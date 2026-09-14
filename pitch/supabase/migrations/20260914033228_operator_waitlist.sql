-- Add an operator-only walk-in waitlist for the iPad service workflow.

create table if not exists reservation_demo.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references reservation_demo.venues(id) on delete cascade,
  guest_label text not null default 'Walk-in Guest' check (length(guest_label) between 1 and 80),
  contact_placeholder text not null default '' check (length(contact_placeholder) <= 48),
  party_size integer not null check (party_size between 1 and 12),
  section text check (section in ('indoor','outdoor')),
  requested_date date not null,
  requested_time time not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  quoted_wait_minutes integer not null default 25 check (quoted_wait_minutes between 0 and 240),
  note text not null default '' check (length(note) <= 180),
  status text not null default 'waiting' check (status in ('waiting','notified','seated','cancelled')),
  source text not null default 'operator_iPad' check (length(source) <= 40),
  seated_booking_id uuid references reservation_demo.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  seated_at timestamptz,
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

create index if not exists waitlist_entries_status_created_idx
  on reservation_demo.waitlist_entries(status, created_at desc);
create index if not exists waitlist_entries_service_idx
  on reservation_demo.waitlist_entries(requested_date, requested_time, status);

alter table reservation_demo.waitlist_entries enable row level security;
revoke all on reservation_demo.waitlist_entries from public, anon, authenticated;

drop function if exists reservation_demo.waitlist_entry_payload(uuid);
create function reservation_demo.waitlist_entry_payload(p_id uuid)
returns jsonb
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', w.id,
    'status', w.status,
    'partySize', w.party_size,
    'section', w.section,
    'requestedDate', w.requested_date,
    'requestedTime', to_char(w.requested_time, 'HH24:MI'),
    'startsAt', w.starts_at,
    'endsAt', w.ends_at,
    'quotedWaitMinutes', w.quoted_wait_minutes,
    'guestLabel', w.guest_label,
    'contact', w.contact_placeholder,
    'note', w.note,
    'createdAt', w.created_at,
    'updatedAt', w.updated_at,
    'notifiedAt', w.notified_at,
    'seatedAt', w.seated_at,
    'cancelledAt', w.cancelled_at,
    'reference', b.reference,
    'tableCode', t.code
  )
  from reservation_demo.waitlist_entries w
  left join reservation_demo.bookings b on b.id = w.seated_booking_id
  left join reservation_demo.allocations a on a.booking_id = b.id
  left join reservation_demo.demo_tables t on t.id = a.table_id
  where w.id = p_id
$$;

create or replace function public.reservation_demo_operator_waitlist(payload jsonb, secret text)
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
  v_venue uuid;
  v_service reservation_demo.service_days%rowtype;
  v_entry reservation_demo.waitlist_entries%rowtype;
  v_table reservation_demo.demo_tables%rowtype;
  v_booking reservation_demo.bookings%rowtype;
  v_date date;
  v_time time;
  v_party integer;
  v_section text;
  v_guest text;
  v_contact text;
  v_note text;
  v_quote integer;
  v_start timestamptz;
  v_end timestamptz;
  v_status text;
  v_reference text;
  v_manage_token text;
  v_table_code text;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';

  if v_op = 'list' then
    return jsonb_build_object(
      'ok', true,
      'waitlist', coalesce((
        select jsonb_agg(reservation_demo.waitlist_entry_payload(w.id) order by
          case w.status when 'notified' then 1 when 'waiting' then 2 when 'seated' then 3 else 4 end,
          w.created_at asc)
        from reservation_demo.waitlist_entries w
        where w.status in ('waiting','notified')
          or w.created_at > now() - interval '8 hours'
      ), '[]'::jsonb),
      'demo', true
    );
  end if;

  if v_op = 'create' then
    begin
      v_date := coalesce(nullif(payload->>'date', '')::date, reservation_demo.local_now());
      v_time := coalesce(nullif(payload->>'time', '')::time, time '19:30');
      v_party := coalesce((payload->>'partySize')::integer, 2);
      v_section := nullif(payload->>'section', '');
      if v_section = 'either' then v_section := null; end if;
      v_quote := coalesce((payload->>'quotedWaitMinutes')::integer, 25);
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_waitlist_request');
    end;

    if v_party < 1 or v_party > 12 or v_quote < 0 or v_quote > 240
      or (v_section is not null and v_section not in ('indoor','outdoor')) then
      return jsonb_build_object('ok', false, 'error', 'invalid_waitlist_request');
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
    v_guest := left(coalesce(nullif(btrim(payload->>'guestLabel'), ''), 'Walk-in Guest'), 80);
    v_contact := left(coalesce(payload->>'contact', ''), 48);
    v_note := left(coalesce(payload->>'note', ''), 180);

    insert into reservation_demo.waitlist_entries(
      venue_id, guest_label, contact_placeholder, party_size, section,
      requested_date, requested_time, starts_at, ends_at, quoted_wait_minutes, note
    ) values (
      v_venue, v_guest, v_contact, v_party, v_section,
      v_date, v_time, v_start, v_end, v_quote, v_note
    ) returning * into v_entry;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'waitlist_created', jsonb_build_object('waitlistId', v_entry.id, 'partySize', v_party, 'section', v_section));

    return jsonb_build_object('ok', true, 'waitlistId', v_entry.id, 'entry', reservation_demo.waitlist_entry_payload(v_entry.id), 'demo', true);
  end if;

  if v_op = 'status' then
    begin
      v_id := (payload->>'waitlistId')::uuid;
      v_status := payload->>'status';
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_waitlist_request');
    end;
    if v_status not in ('waiting','notified','cancelled') then
      return jsonb_build_object('ok', false, 'error', 'invalid_waitlist_status');
    end if;

    update reservation_demo.waitlist_entries
    set status = v_status,
        updated_at = now(),
        notified_at = case when v_status = 'notified' then coalesce(notified_at, now()) else notified_at end,
        cancelled_at = case when v_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end
    where id = v_id and status in ('waiting','notified')
    returning * into v_entry;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'waitlist_not_found');
    end if;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'waitlist_status', jsonb_build_object('waitlistId', v_entry.id, 'status', v_status));

    return jsonb_build_object('ok', true, 'waitlistId', v_entry.id, 'entry', reservation_demo.waitlist_entry_payload(v_entry.id), 'demo', true);
  end if;

  if v_op = 'seat' then
    begin
      v_id := (payload->>'waitlistId')::uuid;
      v_table_code := nullif(payload->>'tableCode', '');
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_waitlist_request');
    end;
    if v_table_code is null then
      return jsonb_build_object('ok', false, 'error', 'table_required');
    end if;

    select * into v_entry from reservation_demo.waitlist_entries where id = v_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'waitlist_not_found');
    end if;
    if v_entry.status = 'seated' and v_entry.seated_booking_id is not null then
      select * into v_booking from reservation_demo.bookings where id = v_entry.seated_booking_id;
      return jsonb_build_object('ok', true, 'waitlistId', v_entry.id, 'reference', v_booking.reference, 'status', 'seated', 'entry', reservation_demo.waitlist_entry_payload(v_entry.id), 'recovered', true, 'demo', true);
    end if;
    if v_entry.status not in ('waiting','notified') then
      return jsonb_build_object('ok', false, 'error', 'waitlist_not_active');
    end if;

    select * into v_table from reservation_demo.demo_tables
    where venue_id = v_entry.venue_id and code = v_table_code and active;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'table_not_found');
    end if;
    if v_entry.party_size < v_table.min_party or v_entry.party_size > v_table.max_party then
      return jsonb_build_object('ok', false, 'error', 'table_size_mismatch');
    end if;
    if v_entry.section is not null and v_entry.section <> v_table.section then
      return jsonb_build_object('ok', false, 'error', 'section_mismatch');
    end if;

    v_reference := 'DEMO-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    v_manage_token := encode(gen_random_bytes(24), 'hex');

    begin
      insert into reservation_demo.bookings(
        venue_id, reference, management_token_hash, idempotency_key, party_size, section,
        starts_at, ends_at, service_date, start_time, guest_label, contact_placeholder, status
      ) values (
        v_entry.venue_id, v_reference, reservation_demo.hash_secret(v_manage_token), 'waitlist-seat-' || v_entry.id,
        v_entry.party_size, v_table.section, v_entry.starts_at, v_entry.ends_at,
        v_entry.requested_date, v_entry.requested_time, v_entry.guest_label,
        coalesce(nullif(v_entry.contact_placeholder, ''), 'walk-in-demo'), 'seated'
      ) returning * into v_booking;

      insert into reservation_demo.allocations(table_id, booking_id, starts_at, ends_at, status)
      values (v_table.id, v_booking.id, v_entry.starts_at, v_entry.ends_at, 'seated');
    exception when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'table_unavailable');
    end;

    update reservation_demo.waitlist_entries
    set status = 'seated', seated_booking_id = v_booking.id, seated_at = now(), updated_at = now()
    where id = v_entry.id
    returning * into v_entry;

    insert into reservation_demo.notification_events(booking_id, event_type, preview)
    values (v_booking.id, 'waitlist_seated_preview', jsonb_build_object('message', 'Demo waitlist party seated from the operator iPad. No text or email was sent.'));
    insert into reservation_demo.audit_events(actor, action, booking_id, detail)
    values ('operator-demo', 'waitlist_seated', v_booking.id, jsonb_build_object('waitlistId', v_entry.id, 'tableCode', v_table.code));

    return jsonb_build_object(
      'ok', true,
      'waitlistId', v_entry.id,
      'reference', v_booking.reference,
      'status', v_booking.status,
      'tableCode', v_table.code,
      'entry', reservation_demo.waitlist_entry_payload(v_entry.id),
      'demo', true
    );
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_waitlist_operation');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'waitlist_backend_error', 'code', sqlstate);
end;
$$;

revoke all on function reservation_demo.waitlist_entry_payload(uuid) from public, anon, authenticated;
revoke all on function public.reservation_demo_operator_waitlist(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_waitlist(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_waitlist(jsonb, text) to authenticated;

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
    reservation_demo.waitlist_entries,
    reservation_demo.notification_events,
    reservation_demo.audit_events,
    reservation_demo.allocations,
    reservation_demo.booking_attempts,
    reservation_demo.bookings,
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

revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;

comment on table reservation_demo.waitlist_entries is 'Synthetic operator-only walk-in waitlist for the Guantonio reservation pitch demo.';
comment on function public.reservation_demo_operator_waitlist(jsonb,text) is 'Server-secret-gated operator waitlist RPC for the synthetic reservation demo.';
