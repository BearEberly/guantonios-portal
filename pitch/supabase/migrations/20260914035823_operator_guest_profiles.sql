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
    v_tags := reservation_demo.clean_guest_profile_list(payload->'tags', 8);
    v_preferences := reservation_demo.clean_guest_profile_list(payload->'preferences', 8);
    v_private_note := left(coalesce(payload->>'privateNote', ''), 500);

    update reservation_demo.guest_profiles
    set tags = v_tags,
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
