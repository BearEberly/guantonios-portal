-- Add guest-facing Notify requests and an operator Notify queue for the iPad demo.

create table if not exists reservation_demo.notify_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references reservation_demo.venues(id) on delete cascade,
  service_day_id uuid references reservation_demo.service_days(id) on delete set null,
  guest_label text not null default 'Notify Guest' check (length(guest_label) between 1 and 90),
  contact_placeholder text not null default '' check (length(contact_placeholder) <= 96),
  party_size integer not null check (party_size between 1 and 12),
  section text check (section in ('indoor','outdoor')),
  requested_date date not null,
  requested_time time not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (length(note) <= 180),
  status text not null default 'active' check (status in ('active','notified','booked','cancelled')),
  source text not null default 'public_reservation_demo' check (length(source) <= 48),
  available_count_at_request integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  booked_at timestamptz,
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

create index if not exists notify_requests_service_status_idx
  on reservation_demo.notify_requests(requested_date, requested_time, status, created_at desc);
create index if not exists notify_requests_created_idx
  on reservation_demo.notify_requests(created_at desc);

alter table reservation_demo.notify_requests enable row level security;
revoke all on reservation_demo.notify_requests from public, anon, authenticated;

drop function if exists reservation_demo.notify_request_payload(uuid);
create function reservation_demo.notify_request_payload(p_id uuid)
returns jsonb
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', n.id,
    'status', n.status,
    'partySize', n.party_size,
    'section', n.section,
    'requestedDate', n.requested_date,
    'requestedTime', to_char(n.requested_time, 'HH24:MI'),
    'startsAt', n.starts_at,
    'endsAt', n.ends_at,
    'guestLabel', n.guest_label,
    'contact', n.contact_placeholder,
    'note', n.note,
    'source', n.source,
    'availableCountAtRequest', n.available_count_at_request,
    'createdAt', n.created_at,
    'updatedAt', n.updated_at,
    'notifiedAt', n.notified_at,
    'bookedAt', n.booked_at,
    'cancelledAt', n.cancelled_at
  )
  from reservation_demo.notify_requests n
  where n.id = p_id
$$;

create or replace function public.reservation_demo_notify_request(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_venue uuid;
  v_service reservation_demo.service_days%rowtype;
  v_request reservation_demo.notify_requests%rowtype;
  v_options jsonb := '[]'::jsonb;
  v_date date;
  v_time time;
  v_party integer;
  v_section text;
  v_start timestamptz;
  v_end timestamptz;
  v_guest text;
  v_contact text;
  v_note text;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';

  begin
    v_date := (payload->>'date')::date;
    v_time := (payload->>'time')::time;
    v_party := (payload->>'partySize')::integer;
    v_section := nullif(payload->>'section', '');
    if v_section = 'either' then v_section := null; end if;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_notify_request');
  end;

  if v_party < 1 or v_party > 12 or (v_section is not null and v_section not in ('indoor','outdoor')) then
    return jsonb_build_object('ok', false, 'error', 'invalid_notify_request');
  end if;

  select * into v_service from reservation_demo.service_days
  where venue_id = v_venue and service_date = v_date and status = 'open';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if v_time < v_service.open_time or v_time > v_service.close_time then
    return jsonb_build_object('ok', false, 'error', 'outside_service');
  end if;

  v_start := reservation_demo.slot_start_at(v_date, v_time);
  v_end := v_start + ((v_service.turn_minutes::text || ' minutes')::interval);
  v_guest := left(coalesce(nullif(btrim(payload->>'guestLabel'), ''), 'Notify Guest'), 90);
  v_contact := left(coalesce(payload->>'contact', ''), 96);
  v_note := left(coalesce(payload->>'note', ''), 180);
  v_options := coalesce(reservation_demo.available_options(v_date, v_time, v_party, v_section), '[]'::jsonb);

  insert into reservation_demo.notify_requests(
    venue_id, service_day_id, guest_label, contact_placeholder, party_size, section,
    requested_date, requested_time, starts_at, ends_at, note, available_count_at_request
  ) values (
    v_venue, v_service.id, v_guest, v_contact, v_party, v_section,
    v_date, v_time, v_start, v_end, v_note, jsonb_array_length(v_options)
  ) returning * into v_request;

  insert into reservation_demo.audit_events(actor, action, detail)
  values ('guest-demo', 'notify_request_created', jsonb_build_object('notifyRequestId', v_request.id, 'partySize', v_party, 'section', v_section));

  return jsonb_build_object(
    'ok', true,
    'notifyRequestId', v_request.id,
    'notifyRequest', reservation_demo.notify_request_payload(v_request.id),
    'demo', true
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', 'notify_request_error', 'code', sqlstate);
end;
$$;

create or replace function public.reservation_demo_operator_notify(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_op text := coalesce(payload->>'op', 'list');
  v_id uuid;
  v_status text;
  v_request reservation_demo.notify_requests%rowtype;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();

  if v_op = 'list' then
    return jsonb_build_object(
      'ok', true,
      'notifyRequests', coalesce((
        select jsonb_agg(reservation_demo.notify_request_payload(n.id) order by
          case n.status when 'active' then 1 when 'notified' then 2 when 'booked' then 3 else 4 end,
          n.requested_date,
          n.requested_time,
          n.created_at)
        from reservation_demo.notify_requests n
        where n.status in ('active','notified')
          or n.created_at > now() - interval '8 hours'
      ), '[]'::jsonb),
      'demo', true
    );
  end if;

  if v_op = 'status' then
    begin
      v_id := (payload->>'notifyRequestId')::uuid;
      v_status := payload->>'status';
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_notify_request');
    end;

    if v_status not in ('active','notified','booked','cancelled') then
      return jsonb_build_object('ok', false, 'error', 'invalid_notify_status');
    end if;

    update reservation_demo.notify_requests
    set status = v_status,
        updated_at = now(),
        notified_at = case when v_status = 'notified' then coalesce(notified_at, now()) else notified_at end,
        booked_at = case when v_status = 'booked' then coalesce(booked_at, now()) else booked_at end,
        cancelled_at = case when v_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end
    where id = v_id and status in ('active','notified')
    returning * into v_request;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'notify_request_not_found');
    end if;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'notify_request_status', jsonb_build_object('notifyRequestId', v_request.id, 'status', v_status));

    return jsonb_build_object('ok', true, 'notifyRequestId', v_request.id, 'notifyRequest', reservation_demo.notify_request_payload(v_request.id), 'demo', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_notify_operation');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'operator_notify_error', 'code', sqlstate);
end;
$$;

create or replace function public.reservation_demo_reset(secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_stage text := 'start';
begin
  v_stage := 'auth_lookup';
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  v_stage := 'auth_compare';
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  v_stage := 'truncate_demo_rows';
  truncate table
    reservation_demo.notify_requests,
    reservation_demo.pacing_rules,
    reservation_demo.table_blocks,
    reservation_demo.waitlist_entries,
    reservation_demo.notification_events,
    reservation_demo.audit_events,
    reservation_demo.allocations,
    reservation_demo.booking_attempts,
    reservation_demo.bookings,
    reservation_demo.guest_profiles,
    reservation_demo.holds,
    reservation_demo.service_days;

  v_stage := 'seed';
  perform reservation_demo.ensure_seed();
  v_stage := 'audit_insert';
  insert into reservation_demo.audit_events (actor, action, detail) values ('operator-demo', 'demo_reset', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'reset', true, 'demo', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'demo_reset_error', 'code', sqlstate, 'stage', v_stage);
end;
$$;

revoke all on function reservation_demo.notify_request_payload(uuid) from public, anon, authenticated;
revoke all on function public.reservation_demo_notify_request(jsonb, text) from public;
grant execute on function public.reservation_demo_notify_request(jsonb, text) to anon;
grant execute on function public.reservation_demo_notify_request(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_operator_notify(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_notify(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_notify(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;

comment on table reservation_demo.notify_requests is 'Private synthetic Notify demand-capture rows for requested times without live SMS sends.';
comment on function public.reservation_demo_notify_request(jsonb,text) is 'Server-secret-gated public Notify request creation for the synthetic reservation demo.';
comment on function public.reservation_demo_operator_notify(jsonb,text) is 'Server-secret-gated operator Notify queue controls for the synthetic iPad demo.';
