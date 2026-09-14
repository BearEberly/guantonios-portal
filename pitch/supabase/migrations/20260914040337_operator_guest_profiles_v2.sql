-- Bring the first operator guest-profile migration into the iPad Guestbook UI contract.
-- The live v1 table uses contact_key; preserve that shape and add profile fields to operator/list.

-- Add protected operator guest profiles for the iPad guestbook workflow.

create table if not exists reservation_demo.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references reservation_demo.venues(id) on delete cascade,
  contact_key text not null check (length(contact_key) between 1 and 160),
  guest_label text not null default 'Demo Guest' check (length(guest_label) between 1 and 80),
  contact_placeholder text not null default '' check (length(contact_placeholder) <= 96),
  tags text[] not null default '{}'::text[],
  preferences text[] not null default '{}'::text[],
  private_note text not null default '' check (length(private_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, contact_key)
);

alter table reservation_demo.guest_profiles enable row level security;
revoke all on reservation_demo.guest_profiles from public, anon, authenticated;

alter table reservation_demo.bookings
  add column if not exists guest_profile_id uuid references reservation_demo.guest_profiles(id) on delete set null;

create index if not exists bookings_guest_profile_idx on reservation_demo.bookings(guest_profile_id, starts_at desc);
create index if not exists guest_profiles_venue_label_idx on reservation_demo.guest_profiles(venue_id, lower(guest_label));

create or replace function reservation_demo.guest_contact_key(p_contact text, p_label text)
returns text
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select left(coalesce(
    nullif(lower(regexp_replace(coalesce(p_contact, ''), '[^a-zA-Z0-9@.+-]+', '', 'g')), ''),
    'name:' || lower(regexp_replace(coalesce(nullif(btrim(p_label), ''), 'Demo Guest'), '\s+', ' ', 'g'))
  ), 160)
$$;

create or replace function reservation_demo.find_or_create_guest_profile(p_venue uuid, p_label text, p_contact text)
returns uuid
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_key text := reservation_demo.guest_contact_key(p_contact, p_label);
  v_id uuid;
  v_label text := left(coalesce(nullif(btrim(p_label), ''), 'Demo Guest'), 80);
  v_contact text := left(coalesce(nullif(btrim(p_contact), ''), ''), 96);
begin
  insert into reservation_demo.guest_profiles(venue_id, contact_key, guest_label, contact_placeholder)
  values (p_venue, v_key, v_label, v_contact)
  on conflict (venue_id, contact_key) do update
  set guest_label = case
        when excluded.guest_label <> 'Demo Guest' then excluded.guest_label
        else reservation_demo.guest_profiles.guest_label
      end,
      contact_placeholder = case
        when excluded.contact_placeholder <> '' then excluded.contact_placeholder
        else reservation_demo.guest_profiles.contact_placeholder
      end,
      updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function reservation_demo.attach_booking_guest_profile()
returns trigger
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
begin
  if new.guest_profile_id is null then
    new.guest_profile_id := reservation_demo.find_or_create_guest_profile(new.venue_id, new.guest_label, new.contact_placeholder);
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_attach_guest_profile on reservation_demo.bookings;
create trigger bookings_attach_guest_profile
  before insert or update of guest_label, contact_placeholder on reservation_demo.bookings
  for each row execute function reservation_demo.attach_booking_guest_profile();

update reservation_demo.bookings b
set guest_profile_id = reservation_demo.find_or_create_guest_profile(b.venue_id, b.guest_label, b.contact_placeholder)
where b.guest_profile_id is null;

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
        'tableCode', t.code
      ) order by b.starts_at desc, b.created_at desc) filter (where b.id is not null) as visits
    from reservation_demo.bookings b
    left join reservation_demo.allocations a on a.booking_id = b.id
    left join reservation_demo.demo_tables t on t.id = a.table_id
    where b.guest_profile_id = gp.id
  ) v on true
  where gp.id = p_profile_id
$$;

create or replace function reservation_demo.clean_guest_profile_list(p_values jsonb, p_limit integer default 8)
returns text[]
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select coalesce(array_agg(value order by ord), '{}'::text[])
  from (
    select distinct on (lower(cleaned)) cleaned as value, ord
    from (
      select left(btrim(value), 42) as cleaned, ord
      from jsonb_array_elements_text(case when jsonb_typeof(coalesce(p_values, '[]'::jsonb)) = 'array' then coalesce(p_values, '[]'::jsonb) else '[]'::jsonb end) with ordinality as raw(value, ord)
    ) s
    where cleaned <> ''
    order by lower(cleaned), ord
    limit greatest(0, least(coalesce(p_limit, 8), 12))
  ) dedup
$$;

create or replace function public.reservation_demo_operator_guest(payload jsonb, secret text)
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
  v_profile_id uuid;
  v_reference text;
  v_booking reservation_demo.bookings%rowtype;
  v_guest text;
  v_contact text;
  v_tags text[];
  v_preferences text[];
  v_private_note text;
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
      'profiles', coalesce((
        select jsonb_agg(reservation_demo.guest_profile_payload(gp.id) order by gp.updated_at desc)
        from reservation_demo.guest_profiles gp
        where gp.venue_id = v_venue
      ), '[]'::jsonb),
      'demo', true
    );
  end if;

  if v_op = 'load' then
    begin
      v_profile_id := nullif(payload->>'profileId', '')::uuid;
    exception when others then
      v_profile_id := null;
    end;
    v_reference := nullif(payload->>'reference', '');
    if v_profile_id is null and v_reference is not null then
      select * into v_booking from reservation_demo.bookings where reference = v_reference;
      if found and v_booking.guest_profile_id is null then
        v_booking.guest_profile_id := reservation_demo.find_or_create_guest_profile(v_booking.venue_id, v_booking.guest_label, v_booking.contact_placeholder);
        update reservation_demo.bookings set guest_profile_id = v_booking.guest_profile_id where id = v_booking.id;
      end if;
      v_profile_id := v_booking.guest_profile_id;
    end if;
    if v_profile_id is null or not exists (select 1 from reservation_demo.guest_profiles where id = v_profile_id and venue_id = v_venue) then
      return jsonb_build_object('ok', false, 'error', 'guest_profile_not_found');
    end if;
    return jsonb_build_object('ok', true, 'profile', reservation_demo.guest_profile_payload(v_profile_id), 'demo', true);
  end if;

  if v_op = 'attach' then
    v_reference := nullif(payload->>'reference', '');
    select * into v_booking from reservation_demo.bookings where reference = v_reference;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'booking_not_found');
    end if;
    v_guest := left(coalesce(nullif(btrim(payload->>'guestLabel'), ''), v_booking.guest_label, 'Demo Guest'), 80);
    v_contact := left(coalesce(nullif(btrim(payload->>'contact'), ''), v_booking.contact_placeholder, ''), 96);
    v_profile_id := reservation_demo.find_or_create_guest_profile(v_booking.venue_id, v_guest, v_contact);
    v_tags := reservation_demo.clean_guest_profile_list(payload->'tags', 8);
    v_preferences := reservation_demo.clean_guest_profile_list(payload->'preferences', 8);
    v_private_note := left(coalesce(payload->>'privateNote', ''), 500);

    update reservation_demo.guest_profiles
    set tags = case when cardinality(v_tags) > 0 then v_tags else tags end,
        preferences = case when cardinality(v_preferences) > 0 then v_preferences else preferences end,
        private_note = case when v_private_note <> '' then v_private_note else private_note end,
        updated_at = now()
    where id = v_profile_id;

    update reservation_demo.bookings
    set guest_profile_id = v_profile_id,
        guest_label = v_guest,
        contact_placeholder = case when v_contact <> '' then v_contact else contact_placeholder end,
        updated_at = now()
    where id = v_booking.id;

    insert into reservation_demo.audit_events(actor, action, booking_id, detail)
    values ('operator-demo', 'guest_profile_attached', v_booking.id, jsonb_build_object('guestProfileId', v_profile_id));

    return jsonb_build_object('ok', true, 'profile', reservation_demo.guest_profile_payload(v_profile_id), 'demo', true);
  end if;

  if v_op = 'update' then
    begin
      v_profile_id := (payload->>'profileId')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_guest_profile');
    end;
    v_guest := left(coalesce(nullif(btrim(payload->>'guestLabel'), ''), ''), 80);
    v_contact := left(coalesce(nullif(btrim(payload->>'contact'), ''), ''), 96);
    v_tags := reservation_demo.clean_guest_profile_list(payload->'tags', 8);
    v_preferences := reservation_demo.clean_guest_profile_list(payload->'preferences', 8);
    v_private_note := left(coalesce(payload->>'privateNote', ''), 500);

    update reservation_demo.guest_profiles
    set guest_label = case when v_guest <> '' then v_guest else guest_label end,
        contact_placeholder = case when v_contact <> '' then v_contact else contact_placeholder end,
        tags = v_tags,
        preferences = v_preferences,
        private_note = v_private_note,
        updated_at = now()
    where id = v_profile_id and venue_id = v_venue;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'guest_profile_not_found');
    end if;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'guest_profile_updated', jsonb_build_object('guestProfileId', v_profile_id, 'tagCount', cardinality(v_tags), 'preferenceCount', cardinality(v_preferences)));

    return jsonb_build_object('ok', true, 'profile', reservation_demo.guest_profile_payload(v_profile_id), 'demo', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_guest_operation');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'guest_profile_backend_error', 'code', sqlstate);
end;
$$;

revoke all on function reservation_demo.guest_contact_key(text, text) from public, anon, authenticated;
revoke all on function reservation_demo.find_or_create_guest_profile(uuid, text, text) from public, anon, authenticated;
revoke all on function reservation_demo.attach_booking_guest_profile() from public, anon, authenticated;
revoke all on function reservation_demo.guest_profile_payload(uuid) from public, anon, authenticated;
revoke all on function reservation_demo.clean_guest_profile_list(jsonb, integer) from public, anon, authenticated;
revoke all on function public.reservation_demo_operator_guest(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_guest(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_guest(jsonb, text) to authenticated;

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

revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;

comment on table reservation_demo.guest_profiles is 'Synthetic operator-only guest profiles for the Guantonio reservation pitch demo.';
comment on function public.reservation_demo_operator_guest(jsonb,text) is 'Server-secret-gated operator guest profile RPC for the synthetic reservation demo.';


-- Refresh the broad demo API so operator/list returns profile data with each booking.
-- Restore hold-token authorization in the main demo RPC while preserving operator table assignment.

create or replace function public.reservation_demo_api(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_op text := coalesce(payload->>'op', '');
  v_today date := reservation_demo.local_now();
  v_date date;
  v_time time;
  v_party integer;
  v_section text;
  v_venue uuid;
  v_service reservation_demo.service_days%rowtype;
  v_slots jsonb := '[]'::jsonb;
  v_offsets integer[] := array[0, -30, 30, -60, 60];
  v_offset integer;
  v_candidate time;
  v_options jsonb;
  v_idem text;
  v_hold uuid;
  v_hold_token text;
  v_manage_token text;
  v_reference text;
  v_start timestamptz;
  v_end timestamptz;
  v_expiry timestamptz;
  v_table record;
  v_booking reservation_demo.bookings%rowtype;
  v_result jsonb;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_status text;
  v_table_code text;
  v_target_table reservation_demo.demo_tables%rowtype;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';

  if v_op = 'meta' then
    return jsonb_build_object(
      'ok', true,
      'demo', true,
      'venue', jsonb_build_object('name', 'Guantonio''s Wood Fired', 'address', '600 W Lockeford Street, Lodi, CA 95240', 'phone', '(209) 263-7152', 'timezone', 'America/Los_Angeles'),
      'sms', jsonb_build_object('enabled', false, 'adapter', 'disabled'),
      'schemaVersion', (select schema_version from reservation_demo.demo_config where id = 1),
      'today', v_today
    );
  end if;

  if v_op = 'search' then
    begin
      v_date := (payload->>'date')::date;
      v_time := (payload->>'time')::time;
      v_party := (payload->>'partySize')::integer;
      v_section := nullif(payload->>'section', '');
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_search');
    end;

    if v_date < v_today or v_date > v_today + 30 then
      return jsonb_build_object('ok', true, 'available', false, 'reason', 'outside_demo_window', 'slots', '[]'::jsonb);
    end if;

    select * into v_service from reservation_demo.service_days where venue_id = v_venue and service_date = v_date;
    if not found or v_service.status <> 'open' then
      return jsonb_build_object('ok', true, 'available', false, 'reason', 'closed', 'slots', '[]'::jsonb);
    end if;

    foreach v_offset in array v_offsets loop
      v_candidate := (v_time + (v_offset::text || ' minutes')::interval)::time;
      if v_candidate >= v_service.booking_start and v_candidate <= v_service.booking_end then
        v_options := reservation_demo.available_options(v_date, v_candidate, v_party, v_section);
        if jsonb_array_length(v_options) > 0 then
          v_slots := v_slots || jsonb_build_array(jsonb_build_object(
            'slotId', to_char(v_date, 'YYYY-MM-DD') || 'T' || to_char(v_candidate, 'HH24:MI') || ':' || coalesce(v_section, 'any'),
            'date', v_date,
            'time', to_char(v_candidate, 'HH24:MI'),
            'displayTime', to_char(v_candidate, 'FMHH12:MI AM'),
            'partySize', v_party,
            'seating', (select jsonb_agg(distinct jsonb_build_object('section', o->>'section', 'label', initcap(o->>'section'))) from jsonb_array_elements(v_options) o),
            'exact', v_offset = 0,
            'startsAt', (v_options->0)->>'startsAt',
            'endsAt', (v_options->0)->>'endsAt'
          ));
        end if;
      end if;
    end loop;

    return jsonb_build_object('ok', true, 'available', jsonb_array_length(v_slots) > 0, 'reason', case when jsonb_array_length(v_slots) > 0 then null else 'sold_out' end, 'slots', v_slots);
  end if;

  if v_op = 'hold' then
    begin
      v_date := (payload->>'date')::date;
      v_time := (payload->>'time')::time;
      v_party := (payload->>'partySize')::integer;
      v_section := payload->>'section';
      v_idem := payload->>'idempotencyKey';
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_hold');
    end;
    if v_idem is null or length(v_idem) < 12 then
      return jsonb_build_object('ok', false, 'error', 'missing_idempotency_key');
    end if;
    select * into v_service from reservation_demo.service_days where venue_id = v_venue and service_date = v_date and status = 'open';
    if not found then
      return jsonb_build_object('ok', false, 'error', 'closed');
    end if;
    if v_time < v_service.booking_start or v_time > v_service.booking_end then
      return jsonb_build_object('ok', false, 'error', 'outside_service');
    end if;

    select result into v_result from reservation_demo.booking_attempts where idempotency_key = v_idem and operation = 'hold';
    if v_result is not null then
      if exists (
        select 1 from reservation_demo.holds h
        where h.id = (v_result->>'holdId')::uuid and h.status = 'held' and h.expires_at > now()
      ) then
        return v_result || jsonb_build_object('recovered', true);
      end if;
      return jsonb_build_object('ok', false, 'error', 'hold_expired_or_released');
    end if;

    v_start := reservation_demo.slot_start_at(v_date, v_time);
    v_end := v_start + ((v_service.turn_minutes::text || ' minutes')::interval);
    v_expiry := now() + ((v_service.hold_minutes::text || ' minutes')::interval);
    v_hold_token := encode(gen_random_bytes(18), 'hex');

    for v_table in
      select t.* from reservation_demo.demo_tables t
      where t.venue_id = v_venue and t.active and t.section = v_section and t.min_party <= v_party and t.max_party >= v_party
      order by t.max_party asc, t.display_order asc
    loop
      begin
        insert into reservation_demo.holds (venue_id, service_day_id, hold_token_hash, idempotency_key, party_size, section, starts_at, ends_at, expires_at, criteria)
        values (v_venue, v_service.id, reservation_demo.hash_secret(v_hold_token), v_idem, v_party, v_section, v_start, v_end, v_expiry, payload - 'op')
        returning id into v_hold;
        insert into reservation_demo.allocations (table_id, hold_id, starts_at, ends_at, status)
        values (v_table.id, v_hold, v_start, v_end, 'held');
        v_result := jsonb_build_object('ok', true, 'holdId', v_hold, 'holdToken', v_hold_token, 'expiresAt', v_expiry, 'tableCode', v_table.code, 'section', v_section, 'startsAt', v_start, 'endsAt', v_end, 'demo', true);
        insert into reservation_demo.booking_attempts (idempotency_key, operation, result) values (v_idem, 'hold', v_result);
        insert into reservation_demo.audit_events (actor, action, hold_id, detail)
        values ('guest-demo', 'hold_created', v_hold, jsonb_build_object('section', v_section, 'tableCode', v_table.code));
        return v_result;
      exception when exclusion_violation or unique_violation then
        v_hold := null;
      end;
    end loop;
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  if v_op = 'confirm' then
    v_idem := payload->>'idempotencyKey';
    if v_idem is null or length(v_idem) < 12 then
      return jsonb_build_object('ok', false, 'error', 'missing_idempotency_key');
    end if;
    select result into v_result from reservation_demo.booking_attempts where idempotency_key = v_idem;
    if v_result is not null then
      return v_result || jsonb_build_object('recovered', true);
    end if;

    begin
      v_hold := (payload->>'holdId')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_hold');
    end;
    if not exists (
      select 1 from reservation_demo.holds h
      where h.id = v_hold and h.status = 'held' and h.expires_at > now() and h.hold_token_hash = reservation_demo.hash_secret(payload->>'holdToken')
    ) then
      perform reservation_demo.expire_holds();
      return jsonb_build_object('ok', false, 'error', 'hold_expired_or_unauthorized');
    end if;

    v_reference := 'DEMO-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    v_manage_token := encode(gen_random_bytes(24), 'hex');

    insert into reservation_demo.bookings (venue_id, hold_id, reference, management_token_hash, idempotency_key, party_size, section, starts_at, ends_at, service_date, start_time)
    select h.venue_id, h.id, v_reference, reservation_demo.hash_secret(v_manage_token), v_idem, h.party_size, h.section, h.starts_at, h.ends_at,
           (timezone('America/Los_Angeles', h.starts_at))::date,
           (timezone('America/Los_Angeles', h.starts_at))::time
    from reservation_demo.holds h
    where h.id = v_hold
    returning * into v_booking;

    update reservation_demo.allocations set booking_id = v_booking.id, hold_id = null, status = 'confirmed' where hold_id = v_hold;
    update reservation_demo.holds set status = 'consumed' where id = v_hold;

    insert into reservation_demo.notification_events (booking_id, event_type, preview)
    values (v_booking.id, 'confirmation_preview', jsonb_build_object('message', 'Demo confirmation preview only. No text or email was sent.'));
    insert into reservation_demo.audit_events (actor, action, booking_id, hold_id, detail)
    values ('guest-demo', 'booking_confirmed', v_booking.id, v_hold, jsonb_build_object('reference', v_reference));

    v_result := jsonb_build_object('ok', true, 'reference', v_reference, 'manageToken', v_manage_token, 'status', v_booking.status, 'partySize', v_booking.party_size, 'section', v_booking.section, 'startsAt', v_booking.starts_at, 'endsAt', v_booking.ends_at, 'demo', true, 'message', 'Demo reservation confirmed. No real table, text, or email was created.');
    insert into reservation_demo.booking_attempts (idempotency_key, operation, result) values (v_idem, 'confirm', v_result);
    return v_result;
  end if;

  if v_op = 'view' then
    select * into v_booking from reservation_demo.bookings b
    where b.reference = payload->>'reference'
      and b.management_token_hash = reservation_demo.hash_secret(payload->>'manageToken');
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_unauthorized');
    end if;
    return jsonb_build_object('ok', true, 'reservation', jsonb_build_object('reference', v_booking.reference, 'status', v_booking.status, 'partySize', v_booking.party_size, 'section', v_booking.section, 'startsAt', v_booking.starts_at, 'endsAt', v_booking.ends_at, 'guestLabel', v_booking.guest_label, 'demoDisclaimer', v_booking.demo_disclaimer));
  end if;

  if v_op = 'change' then
    select * into v_booking from reservation_demo.bookings b
    where b.reference = payload->>'reference'
      and b.management_token_hash = reservation_demo.hash_secret(payload->>'manageToken')
      and b.status in ('confirmed','checked_in','seated');
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_unauthorized');
    end if;
    begin
      v_date := (payload->>'date')::date;
      v_time := (payload->>'time')::time;
      v_section := payload->>'section';
      v_party := coalesce((payload->>'partySize')::integer, v_booking.party_size);
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_change');
    end;
    select * into v_service from reservation_demo.service_days where venue_id = v_venue and service_date = v_date and status = 'open';
    if not found or v_time < v_service.booking_start or v_time > v_service.booking_end then
      return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
    end if;
    v_start := reservation_demo.slot_start_at(v_date, v_time);
    v_end := v_start + ((v_service.turn_minutes::text || ' minutes')::interval);
    for v_table in
      select t.* from reservation_demo.demo_tables t
      where t.venue_id = v_venue and t.active and t.section = v_section and t.min_party <= v_party and t.max_party >= v_party
      order by t.max_party asc, t.display_order asc
    loop
      begin
        update reservation_demo.allocations
        set table_id = v_table.id, starts_at = v_start, ends_at = v_end, status = case when status in ('checked_in','seated') then status else 'confirmed' end
        where booking_id = v_booking.id;
        update reservation_demo.bookings
        set party_size = v_party, section = v_section, starts_at = v_start, ends_at = v_end, service_date = v_date, start_time = v_time, updated_at = now()
        where id = v_booking.id
        returning * into v_booking;
        insert into reservation_demo.audit_events (actor, action, booking_id, detail)
        values ('guest-demo', 'booking_changed', v_booking.id, jsonb_build_object('tableCode', v_table.code));
        return jsonb_build_object('ok', true, 'reservation', jsonb_build_object('reference', v_booking.reference, 'status', v_booking.status, 'partySize', v_booking.party_size, 'section', v_booking.section, 'startsAt', v_booking.starts_at, 'endsAt', v_booking.ends_at), 'demo', true);
      exception when exclusion_violation then
      end;
    end loop;
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  if v_op = 'cancel' then
    select * into v_booking from reservation_demo.bookings b
    where b.reference = payload->>'reference'
      and (b.management_token_hash = reservation_demo.hash_secret(payload->>'manageToken') or v_operator)
      and b.status <> 'cancelled';
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_unauthorized');
    end if;
    update reservation_demo.bookings set status = 'cancelled', updated_at = now() where id = v_booking.id returning * into v_booking;
    update reservation_demo.allocations set status = 'cancelled' where booking_id = v_booking.id;
    insert into reservation_demo.audit_events (actor, action, booking_id, detail)
    values (case when v_operator then 'operator-demo' else 'guest-demo' end, 'booking_cancelled', v_booking.id, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'reservation', jsonb_build_object('reference', v_booking.reference, 'status', v_booking.status, 'partySize', v_booking.party_size, 'section', v_booking.section, 'startsAt', v_booking.starts_at, 'endsAt', v_booking.ends_at), 'demo', true);
  end if;

  if v_op = 'operator_list' and v_operator then
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
          'tableCode', t.code,
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
        left join reservation_demo.allocations a on a.booking_id = b.id
        left join reservation_demo.demo_tables t on t.id = a.table_id
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
  end if;

  if v_op = 'operator_status' and v_operator then
    v_reference := payload->>'reference';
    v_status := payload->>'status';
    v_table_code := nullif(payload->>'tableCode', '');
    if v_status not in ('confirmed','checked_in','seated','completed','cancelled') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    select * into v_booking from reservation_demo.bookings where reference = v_reference;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    if v_table_code is not null then
      select * into v_target_table
      from reservation_demo.demo_tables
      where venue_id = v_booking.venue_id
        and code = v_table_code
        and active;

      if not found then
        return jsonb_build_object('ok', false, 'error', 'table_not_found');
      end if;
      if v_booking.party_size < v_target_table.min_party or v_booking.party_size > v_target_table.max_party then
        return jsonb_build_object('ok', false, 'error', 'table_size_mismatch');
      end if;

      begin
        update reservation_demo.allocations
        set table_id = v_target_table.id,
            status = case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end
        where booking_id = v_booking.id;

        update reservation_demo.bookings
        set status = v_status,
            section = v_target_table.section,
            updated_at = now()
        where id = v_booking.id
        returning * into v_booking;
      exception when exclusion_violation then
        return jsonb_build_object('ok', false, 'error', 'table_unavailable');
      end;
    else
      update reservation_demo.bookings set status = v_status, updated_at = now() where id = v_booking.id returning * into v_booking;
      update reservation_demo.allocations set status = case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end where booking_id = v_booking.id;
    end if;

    insert into reservation_demo.audit_events (actor, action, booking_id, detail)
    values ('operator-demo', 'operator_status', v_booking.id, jsonb_build_object('status', v_status, 'tableCode', v_table_code));
    return jsonb_build_object('ok', true, 'reference', v_reference, 'status', v_status, 'tableCode', coalesce(v_table_code, (
      select t.code
      from reservation_demo.allocations a
      join reservation_demo.demo_tables t on t.id = a.table_id
      where a.booking_id = v_booking.id
      limit 1
    )));
  end if;

  if v_op = 'reset' and v_operator then
    delete from reservation_demo.notification_events;
    delete from reservation_demo.audit_events;
    delete from reservation_demo.allocations;
    delete from reservation_demo.booking_attempts;
    delete from reservation_demo.bookings;
    delete from reservation_demo.holds;
    delete from reservation_demo.service_days;
    perform reservation_demo.ensure_seed();
    insert into reservation_demo.audit_events (actor, action, detail) values ('operator-demo', 'demo_reset', '{}'::jsonb);
    return jsonb_build_object('ok', true, 'reset', true, 'demo', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_or_unauthorized_operation');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'demo_backend_error', 'code', sqlstate);
end;
$$;

revoke all on function public.reservation_demo_api(jsonb, text) from public;
grant execute on function public.reservation_demo_api(jsonb, text) to anon;
grant execute on function public.reservation_demo_api(jsonb, text) to authenticated;
