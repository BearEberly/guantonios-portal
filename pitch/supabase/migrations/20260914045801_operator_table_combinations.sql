-- Add ResyOS-style operator table combinations for the iPad floor workflow.

create table if not exists reservation_demo.table_combinations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references reservation_demo.venues(id) on delete cascade,
  code text not null check (length(code) between 3 and 40),
  section text not null check (section in ('indoor','outdoor')),
  min_party integer not null check (min_party >= 1),
  max_party integer not null check (max_party >= min_party),
  table_codes text[] not null check (cardinality(table_codes) >= 2),
  display_order integer not null default 1000,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

alter table reservation_demo.table_combinations enable row level security;
revoke all on reservation_demo.table_combinations from public, anon, authenticated;

create index if not exists table_combinations_venue_active_idx
  on reservation_demo.table_combinations(venue_id, active, display_order);

create or replace function reservation_demo.ensure_table_combinations()
returns void
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_venue uuid;
begin
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';
  if v_venue is null then
    return;
  end if;

  insert into reservation_demo.table_combinations(venue_id, code, section, min_party, max_party, table_codes, display_order, active)
  values
    (v_venue, '21+22', 'indoor', 3, 4, array['21','22'], 310, true),
    (v_venue, '31+33', 'indoor', 5, 8, array['31','33'], 320, true),
    (v_venue, '40+41', 'indoor', 5, 8, array['40','41'], 330, true),
    (v_venue, 'P3+P4', 'outdoor', 5, 8, array['P3','P4'], 410, true),
    (v_venue, 'P5+P6', 'outdoor', 7, 10, array['P5','P6'], 420, true)
  on conflict (venue_id, code) do update
  set section = excluded.section,
      min_party = excluded.min_party,
      max_party = excluded.max_party,
      table_codes = excluded.table_codes,
      display_order = excluded.display_order,
      active = excluded.active,
      updated_at = now();
end;
$$;

create or replace function reservation_demo.resolve_table_assignment(p_venue uuid, p_code text)
returns table(
  table_id uuid,
  table_code text,
  table_section text,
  assignment_code text,
  assignment_section text,
  min_party integer,
  max_party integer,
  table_codes text[],
  member_count integer,
  display_order integer
)
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  with normalized as (
    select upper(btrim(coalesce(p_code, ''))) as code
  ),
  combo as (
    select c.*
    from reservation_demo.table_combinations c, normalized n
    where c.venue_id = p_venue
      and c.active
      and upper(c.code) = n.code
    limit 1
  ),
  combo_rows as (
    select
      t.id as table_id,
      t.code as table_code,
      t.section as table_section,
      c.code as assignment_code,
      c.section as assignment_section,
      c.min_party,
      c.max_party,
      c.table_codes,
      cardinality(c.table_codes)::integer as member_count,
      t.display_order
    from combo c
    cross join lateral unnest(c.table_codes) with ordinality as m(code, ord)
    join reservation_demo.demo_tables t
      on t.venue_id = c.venue_id
     and upper(t.code) = upper(m.code)
     and t.active
  ),
  combo_valid as (
    select count(*)::integer as row_count, coalesce(max(member_count), 0)::integer as expected_count
    from combo_rows
  )
  select cr.*
  from combo_rows cr
  where exists (select 1 from combo_valid cv where cv.row_count = cv.expected_count and cv.expected_count >= 2)
  union all
  select
    t.id as table_id,
    t.code as table_code,
    t.section as table_section,
    t.code as assignment_code,
    t.section as assignment_section,
    t.min_party,
    t.max_party,
    array[t.code]::text[] as table_codes,
    1 as member_count,
    t.display_order
  from reservation_demo.demo_tables t, normalized n
  where not exists (select 1 from combo)
    and t.venue_id = p_venue
    and t.active
    and upper(t.code) = n.code
  order by display_order;
$$;

create or replace function reservation_demo.booking_table_codes(p_booking uuid)
returns text[]
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select coalesce(array_agg(code order by display_order), '{}'::text[])
  from (
    select distinct t.code, t.display_order
    from reservation_demo.allocations a
    join reservation_demo.demo_tables t on t.id = a.table_id
    where a.booking_id = p_booking
      and a.status not in ('released','expired')
  ) s
$$;

create or replace function reservation_demo.booking_table_code(p_booking uuid)
returns text
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select nullif(array_to_string(reservation_demo.booking_table_codes(p_booking), '+'), '')
$$;

create or replace function reservation_demo.table_combination_payload(p_id uuid)
returns jsonb
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'section', c.section,
    'minParty', c.min_party,
    'maxParty', c.max_party,
    'capacity', c.max_party,
    'tableCodes', to_jsonb(c.table_codes),
    'displayOrder', c.display_order,
    'active', c.active,
    'updatedAt', c.updated_at
  )
  from reservation_demo.table_combinations c
  where c.id = p_id
$$;

create or replace function reservation_demo.guest_profile_payload(p_profile_id uuid)
returns jsonb
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', gp.id,
    'guestLabel', gp.guest_label,
    'contact', gp.contact_placeholder,
    'tags', to_jsonb(gp.tags),
    'preferences', to_jsonb(gp.preferences),
    'privateNote', gp.private_note,
    'visitCount', coalesce(v.visit_count, 0),
    'upcomingCount', coalesce(v.upcoming_count, 0),
    'lastVisitAt', v.last_visit_at,
    'createdAt', gp.created_at,
    'updatedAt', gp.updated_at,
    'visits', coalesce(v.visits, '[]'::jsonb)
  )
  from reservation_demo.guest_profiles gp
  left join lateral (
    select
      count(*)::integer as visit_count,
      count(*) filter (where b.starts_at >= now() and b.status <> 'cancelled')::integer as upcoming_count,
      max(b.starts_at) filter (where b.starts_at < now() and b.status <> 'cancelled') as last_visit_at,
      jsonb_agg(jsonb_build_object(
        'reference', b.reference,
        'status', b.status,
        'partySize', b.party_size,
        'section', b.section,
        'startsAt', b.starts_at,
        'tableCode', reservation_demo.booking_table_code(b.id),
        'tableCodes', to_jsonb(reservation_demo.booking_table_codes(b.id))
      ) order by b.starts_at desc, b.created_at desc) filter (where b.id is not null) as visits
    from reservation_demo.bookings b
    where b.guest_profile_id = gp.id
  ) v on true
  where gp.id = p_profile_id
$$;

create or replace function reservation_demo.waitlist_entry_payload(p_id uuid)
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
    'tableCode', reservation_demo.booking_table_code(b.id),
    'tableCodes', to_jsonb(reservation_demo.booking_table_codes(b.id))
  )
  from reservation_demo.waitlist_entries w
  left join reservation_demo.bookings b on b.id = w.seated_booking_id
  where w.id = p_id
$$;

create or replace function public.reservation_demo_operator_list(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_venue uuid;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();
  perform reservation_demo.expire_holds();
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';

  return jsonb_build_object(
    'ok', true,
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', b.reference,
        'status', b.status,
        'partySize', b.party_size,
        'section', b.section,
        'startsAt', b.starts_at,
        'endsAt', b.ends_at,
        'tableCode', reservation_demo.booking_table_code(b.id),
        'tableCodes', to_jsonb(reservation_demo.booking_table_codes(b.id)),
        'guestLabel', b.guest_label,
        'guestProfileId', gp.id,
        'guestTags', coalesce(to_jsonb(gp.tags), '[]'::jsonb),
        'guestPreferences', coalesce(to_jsonb(gp.preferences), '[]'::jsonb),
        'visitCount', coalesce((
          select count(*)::integer
          from reservation_demo.bookings vb
          where vb.guest_profile_id = gp.id and vb.status <> 'cancelled'
        ), 0),
        'privateNotePreview', case when gp.private_note <> '' then left(gp.private_note, 90) else '' end,
        'createdAt', b.created_at
      ) order by b.starts_at, b.created_at)
      from reservation_demo.bookings b
      left join reservation_demo.guest_profiles gp on gp.id = b.guest_profile_id
    ), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'partySize', h.party_size, 'section', h.section, 'startsAt', h.starts_at, 'expiresAt', h.expires_at, 'status', h.status) order by h.created_at desc)
      from reservation_demo.holds h
      where h.created_at > now() - interval '2 hours'
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('eventType', n.event_type, 'status', n.status, 'adapter', n.adapter, 'preview', n.preview, 'createdAt', n.created_at) order by n.created_at desc)
      from reservation_demo.notification_events n
    ), '[]'::jsonb),
    'demo', true
  );
end;
$$;

create or replace function public.reservation_demo_operator_status(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_reference text := payload->>'reference';
  v_status text := payload->>'status';
  v_table_code text := nullif(payload->>'tableCode', '');
  v_booking reservation_demo.bookings%rowtype;
  v_member_count integer;
  v_assignment_code text;
  v_assignment_section text;
  v_min_party integer;
  v_max_party integer;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();
  perform reservation_demo.expire_holds();

  if v_status not in ('confirmed','checked_in','seated','completed','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  select * into v_booking from reservation_demo.bookings where reference = v_reference;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_table_code is not null then
    select count(*)::integer, max(assignment_code), max(assignment_section), min(min_party), max(max_party)
    into v_member_count, v_assignment_code, v_assignment_section, v_min_party, v_max_party
    from reservation_demo.resolve_table_assignment(v_booking.venue_id, v_table_code);

    if coalesce(v_member_count, 0) = 0 then
      return jsonb_build_object('ok', false, 'error', 'table_not_found');
    end if;
    if v_booking.party_size < v_min_party or v_booking.party_size > v_max_party then
      return jsonb_build_object('ok', false, 'error', 'table_size_mismatch');
    end if;

    begin
      update reservation_demo.allocations
      set status = 'released'
      where booking_id = v_booking.id;

      insert into reservation_demo.allocations(table_id, booking_id, starts_at, ends_at, status)
      select table_id, v_booking.id, v_booking.starts_at, v_booking.ends_at,
             case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end
      from reservation_demo.resolve_table_assignment(v_booking.venue_id, v_assignment_code);

      update reservation_demo.bookings
      set status = v_status,
          section = v_assignment_section,
          updated_at = now()
      where id = v_booking.id
      returning * into v_booking;
    exception when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'table_unavailable');
    end;
  else
    update reservation_demo.bookings
    set status = v_status,
        updated_at = now()
    where id = v_booking.id
    returning * into v_booking;

    update reservation_demo.allocations
    set status = case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end
    where booking_id = v_booking.id
      and status <> 'released';
  end if;

  insert into reservation_demo.audit_events (actor, action, booking_id, detail)
  values ('operator-demo', 'operator_status', v_booking.id, jsonb_build_object('status', v_status, 'tableCode', coalesce(v_assignment_code, v_table_code)));

  return jsonb_build_object(
    'ok', true,
    'reference', v_reference,
    'status', v_status,
    'tableCode', coalesce(reservation_demo.booking_table_code(v_booking.id), v_assignment_code, v_table_code),
    'tableCodes', to_jsonb(reservation_demo.booking_table_codes(v_booking.id))
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', 'operator_status_error', 'code', sqlstate);
end;
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
  v_member_count integer;
  v_assignment_code text;
  v_assignment_section text;
  v_min_party integer;
  v_max_party integer;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();
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
      return jsonb_build_object('ok', true, 'waitlistId', v_entry.id, 'reference', v_booking.reference, 'status', 'seated', 'tableCode', reservation_demo.booking_table_code(v_booking.id), 'entry', reservation_demo.waitlist_entry_payload(v_entry.id), 'recovered', true, 'demo', true);
    end if;
    if v_entry.status not in ('waiting','notified') then
      return jsonb_build_object('ok', false, 'error', 'waitlist_not_active');
    end if;

    select count(*)::integer, max(assignment_code), max(assignment_section), min(min_party), max(max_party)
    into v_member_count, v_assignment_code, v_assignment_section, v_min_party, v_max_party
    from reservation_demo.resolve_table_assignment(v_entry.venue_id, v_table_code);

    if coalesce(v_member_count, 0) = 0 then
      return jsonb_build_object('ok', false, 'error', 'table_not_found');
    end if;
    if v_entry.party_size < v_min_party or v_entry.party_size > v_max_party then
      return jsonb_build_object('ok', false, 'error', 'table_size_mismatch');
    end if;
    if v_entry.section is not null and v_entry.section <> v_assignment_section then
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
        v_entry.party_size, v_assignment_section, v_entry.starts_at, v_entry.ends_at,
        v_entry.requested_date, v_entry.requested_time, v_entry.guest_label,
        coalesce(nullif(v_entry.contact_placeholder, ''), 'walk-in-demo'), 'seated'
      ) returning * into v_booking;

      insert into reservation_demo.allocations(table_id, booking_id, starts_at, ends_at, status)
      select table_id, v_booking.id, v_entry.starts_at, v_entry.ends_at, 'seated'
      from reservation_demo.resolve_table_assignment(v_entry.venue_id, v_assignment_code);
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
    values ('operator-demo', 'waitlist_seated', v_booking.id, jsonb_build_object('waitlistId', v_entry.id, 'tableCode', v_assignment_code));

    return jsonb_build_object(
      'ok', true,
      'waitlistId', v_entry.id,
      'reference', v_booking.reference,
      'status', v_booking.status,
      'tableCode', reservation_demo.booking_table_code(v_booking.id),
      'tableCodes', to_jsonb(reservation_demo.booking_table_codes(v_booking.id)),
      'entry', reservation_demo.waitlist_entry_payload(v_entry.id),
      'demo', true
    );
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_waitlist_operation');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'waitlist_backend_error', 'code', sqlstate);
end;
$$;

create or replace function public.reservation_demo_operator_floor(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_op text := coalesce(payload->>'op', 'list');
  v_venue uuid;
  v_table reservation_demo.demo_tables%rowtype;
  v_service reservation_demo.service_days%rowtype;
  v_block reservation_demo.table_blocks%rowtype;
  v_block_id uuid;
  v_table_code text;
  v_date date;
  v_start_time time;
  v_end_time time;
  v_start timestamptz;
  v_end timestamptz;
  v_reason text;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();
  perform reservation_demo.expire_holds();
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';

  if v_op = 'list' then
    return jsonb_build_object(
      'ok', true,
      'tableBlocks', coalesce((
        select jsonb_agg(reservation_demo.table_block_payload(tb.id) order by tb.starts_at, t.display_order)
        from reservation_demo.table_blocks tb
        join reservation_demo.demo_tables t on t.id = tb.table_id
        where tb.venue_id = v_venue
          and tb.status = 'active'
          and tb.ends_at > now() - interval '2 hours'
      ), '[]'::jsonb),
      'tableCombinations', coalesce((
        select jsonb_agg(reservation_demo.table_combination_payload(c.id) order by c.display_order)
        from reservation_demo.table_combinations c
        where c.venue_id = v_venue and c.active
      ), '[]'::jsonb),
      'demo', true
    );
  end if;

  if v_op = 'block' then
    begin
      v_table_code := nullif(payload->>'tableCode', '');
      v_date := coalesce(nullif(payload->>'date', '')::date, reservation_demo.local_now());
      v_start_time := nullif(payload->>'startTime', '')::time;
      v_end_time := nullif(payload->>'endTime', '')::time;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_table_block');
    end;

    if v_table_code is null then
      return jsonb_build_object('ok', false, 'error', 'table_required');
    end if;

    select * into v_table
    from reservation_demo.demo_tables
    where venue_id = v_venue and code = v_table_code and active;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'table_not_found');
    end if;

    select * into v_service
    from reservation_demo.service_days
    where venue_id = v_venue and service_date = v_date and status = 'open';
    if not found then
      return jsonb_build_object('ok', false, 'error', 'closed');
    end if;

    v_start_time := coalesce(v_start_time, v_service.open_time);
    v_end_time := coalesce(v_end_time, v_service.close_time);
    if v_start_time < v_service.open_time or v_end_time > v_service.close_time or v_end_time <= v_start_time then
      return jsonb_build_object('ok', false, 'error', 'invalid_table_block_time');
    end if;

    v_start := reservation_demo.slot_start_at(v_date, v_start_time);
    v_end := reservation_demo.slot_start_at(v_date, v_end_time);
    v_reason := left(coalesce(nullif(btrim(payload->>'reason'), ''), 'Operator block'), 120);

    if exists (
      select 1 from reservation_demo.allocations a
      where a.table_id = v_table.id
        and a.status in ('held','confirmed','checked_in','seated')
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
    ) then
      return jsonb_build_object('ok', false, 'error', 'table_unavailable');
    end if;

    begin
      insert into reservation_demo.table_blocks(venue_id, table_id, starts_at, ends_at, service_date, reason)
      values (v_venue, v_table.id, v_start, v_end, v_date, v_reason)
      returning * into v_block;
    exception when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'table_block_conflict');
    end;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'table_blocked', jsonb_build_object('tableCode', v_table.code, 'tableBlockId', v_block.id, 'reason', v_reason));

    return jsonb_build_object('ok', true, 'tableBlock', reservation_demo.table_block_payload(v_block.id), 'demo', true);
  end if;

  if v_op = 'clear' then
    begin
      v_block_id := (payload->>'blockId')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_table_block');
    end;

    update reservation_demo.table_blocks
    set status = 'cleared', updated_at = now(), cleared_at = now()
    where id = v_block_id and venue_id = v_venue and status = 'active'
    returning * into v_block;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'table_block_not_found');
    end if;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'table_block_cleared', jsonb_build_object('tableBlockId', v_block.id));

    return jsonb_build_object('ok', true, 'tableBlock', reservation_demo.table_block_payload(v_block.id), 'demo', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_floor_operation');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'floor_backend_error', 'code', sqlstate);
end;
$$;

revoke all on function reservation_demo.ensure_table_combinations() from public, anon, authenticated;
revoke all on function reservation_demo.resolve_table_assignment(uuid, text) from public, anon, authenticated;
revoke all on function reservation_demo.booking_table_codes(uuid) from public, anon, authenticated;
revoke all on function reservation_demo.booking_table_code(uuid) from public, anon, authenticated;
revoke all on function reservation_demo.table_combination_payload(uuid) from public, anon, authenticated;
revoke all on function public.reservation_demo_operator_list(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_list(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_list(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_operator_status(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_status(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_status(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_operator_waitlist(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_waitlist(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_waitlist(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_operator_floor(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_floor(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_floor(jsonb, text) to authenticated;

select reservation_demo.ensure_table_combinations();

comment on table reservation_demo.table_combinations is 'Private synthetic table-combination definitions for the ResyOS-style iPad floor demo.';
comment on function reservation_demo.resolve_table_assignment(uuid,text) is 'Resolves one physical table or a configured table combination into physical table rows for allocation.';
comment on function public.reservation_demo_operator_list(jsonb,text) is 'Server-secret-gated operator list RPC that returns one row per booking, including combined table codes.';
