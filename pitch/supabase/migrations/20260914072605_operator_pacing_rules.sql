-- Add ResyOS-style service pacing controls for the iPad operator demo.

create table if not exists reservation_demo.pacing_rules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references reservation_demo.venues(id) on delete cascade,
  service_date date not null,
  slot_time time not null,
  max_covers integer not null check (max_covers between 0 and 99),
  reason text not null default 'Operator pacing',
  status text not null default 'active' check (status in ('active','cleared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleared_at timestamptz,
  unique (venue_id, service_date, slot_time)
);

alter table reservation_demo.pacing_rules enable row level security;
revoke all on reservation_demo.pacing_rules from public, anon, authenticated;

create index if not exists pacing_rules_venue_date_active_idx
  on reservation_demo.pacing_rules(venue_id, service_date, status, slot_time);

create or replace function reservation_demo.pacing_rule_payload(p_id uuid)
returns jsonb
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', pr.id,
    'serviceDate', pr.service_date,
    'slotTime', to_char(pr.slot_time, 'HH24:MI'),
    'maxCovers', pr.max_covers,
    'reason', pr.reason,
    'status', pr.status,
    'createdAt', pr.created_at,
    'updatedAt', pr.updated_at,
    'clearedAt', pr.cleared_at
  )
  from reservation_demo.pacing_rules pr
  where pr.id = p_id
$$;

create or replace function reservation_demo.pacing_capacity(p_venue uuid, p_date date, p_time time)
returns integer
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select coalesce((
    select pr.max_covers
    from reservation_demo.pacing_rules pr
    where pr.venue_id = p_venue
      and pr.service_date = p_date
      and pr.slot_time = p_time
      and pr.status = 'active'
    limit 1
  ), 10)::integer
$$;

create or replace function reservation_demo.pacing_current_covers(
  p_venue uuid,
  p_start timestamptz,
  p_exclude_booking uuid default null,
  p_exclude_hold uuid default null
)
returns integer
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  with active_parties as (
    select distinct
      a.booking_id,
      a.hold_id,
      case when a.booking_id is not null then b.party_size else h.party_size end as covers
    from reservation_demo.allocations a
    left join reservation_demo.bookings b on b.id = a.booking_id
    left join reservation_demo.holds h on h.id = a.hold_id
    where a.status in ('held','confirmed','checked_in','seated')
      and a.starts_at = p_start
      and coalesce(b.venue_id, h.venue_id) = p_venue
      and (p_exclude_booking is null or a.booking_id is distinct from p_exclude_booking)
      and (p_exclude_hold is null or a.hold_id is distinct from p_exclude_hold)
      and (a.booking_id is null or b.status in ('confirmed','checked_in','seated'))
      and (a.hold_id is null or (h.status = 'held' and h.expires_at > now()))
  )
  select coalesce(sum(covers), 0)::integer from active_parties
$$;

create or replace function reservation_demo.pacing_allows_booking(
  p_venue uuid,
  p_date date,
  p_time time,
  p_party integer,
  p_exclude_booking uuid default null,
  p_exclude_hold uuid default null
)
returns boolean
language plpgsql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_start timestamptz;
  v_capacity integer;
  v_current integer;
begin
  v_start := reservation_demo.slot_start_at(p_date, p_time);
  v_capacity := reservation_demo.pacing_capacity(p_venue, p_date, p_time);
  v_current := reservation_demo.pacing_current_covers(p_venue, v_start, p_exclude_booking, p_exclude_hold);
  return v_current + greatest(coalesce(p_party, 0), 0) <= v_capacity;
end;
$$;

create or replace function reservation_demo.prevent_pacing_overbook()
returns trigger
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_date date;
  v_time time;
begin
  if tg_table_name = 'holds' then
    if new.status = 'held' then
      v_date := (timezone('America/Los_Angeles', new.starts_at))::date;
      v_time := (timezone('America/Los_Angeles', new.starts_at))::time;
      if not reservation_demo.pacing_allows_booking(new.venue_id, v_date, v_time, new.party_size, null, new.id) then
        raise exception 'pacing cap reached' using errcode = '23P01';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'bookings' then
    if new.status in ('confirmed','checked_in','seated') then
      v_date := (timezone('America/Los_Angeles', new.starts_at))::date;
      v_time := (timezone('America/Los_Angeles', new.starts_at))::time;
      if not reservation_demo.pacing_allows_booking(new.venue_id, v_date, v_time, new.party_size, new.id, new.hold_id) then
        raise exception 'pacing cap reached' using errcode = '23P01';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_pacing_overbook_holds on reservation_demo.holds;
create trigger prevent_pacing_overbook_holds
before insert or update of party_size, starts_at, status on reservation_demo.holds
for each row execute function reservation_demo.prevent_pacing_overbook();

drop trigger if exists prevent_pacing_overbook_bookings on reservation_demo.bookings;
create trigger prevent_pacing_overbook_bookings
before insert or update of party_size, starts_at, status on reservation_demo.bookings
for each row execute function reservation_demo.prevent_pacing_overbook();

create or replace function reservation_demo.available_options(p_date date, p_time time, p_party integer, p_section text default null)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_venue uuid;
  v_service reservation_demo.service_days%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_options jsonb := '[]'::jsonb;
  v_opt record;
begin
  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';
  select * into v_service from reservation_demo.service_days where venue_id = v_venue and service_date = p_date;
  if not found or v_service.status <> 'open' or p_party < 1 or p_party > 8 or p_time < v_service.booking_start or p_time > v_service.booking_end then
    return '[]'::jsonb;
  end if;
  if not reservation_demo.pacing_allows_booking(v_venue, p_date, p_time, p_party, null, null) then
    return '[]'::jsonb;
  end if;
  v_start := reservation_demo.slot_start_at(p_date, p_time);
  v_end := v_start + ((v_service.turn_minutes::text || ' minutes')::interval);
  for v_opt in
    select t.id, t.code, t.section, t.max_party
    from reservation_demo.demo_tables t
    where t.venue_id = v_venue
      and t.active
      and t.min_party <= p_party
      and t.max_party >= p_party
      and (p_section is null or t.section = p_section)
      and not exists (
        select 1 from reservation_demo.allocations a
        where a.table_id = t.id and a.status in ('held','confirmed','checked_in','seated')
          and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
      )
      and not exists (
        select 1 from reservation_demo.table_blocks tb
        where tb.table_id = t.id and tb.status = 'active'
          and tstzrange(tb.starts_at, tb.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
      )
    order by t.max_party asc, t.display_order asc
  loop
    v_options := v_options || jsonb_build_array(jsonb_build_object('tableId', v_opt.id, 'tableCode', v_opt.code, 'section', v_opt.section, 'capacity', v_opt.max_party, 'startsAt', v_start, 'endsAt', v_end));
  end loop;
  return v_options;
end;
$$;

create or replace function public.reservation_demo_operator_pacing(payload jsonb, secret text)
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
  v_rule reservation_demo.pacing_rules%rowtype;
  v_rule_id uuid;
  v_service reservation_demo.service_days%rowtype;
  v_date date;
  v_time time;
  v_max integer;
  v_reason text;
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
      'pacingRules', coalesce((
        select jsonb_agg(reservation_demo.pacing_rule_payload(pr.id) order by pr.service_date, pr.slot_time)
        from reservation_demo.pacing_rules pr
        where pr.venue_id = v_venue
          and pr.status = 'active'
          and pr.service_date between reservation_demo.local_now() - 1 and reservation_demo.local_now() + 30
      ), '[]'::jsonb),
      'demo', true
    );
  end if;

  if v_op = 'set' then
    begin
      v_date := (payload->>'date')::date;
      v_time := (payload->>'time')::time;
      v_max := (payload->>'maxCovers')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_pacing_rule');
    end;

    if v_max < 0 or v_max > 99 then
      return jsonb_build_object('ok', false, 'error', 'invalid_pacing_rule');
    end if;

    select * into v_service from reservation_demo.service_days where venue_id = v_venue and service_date = v_date and status = 'open';
    if not found or v_time < v_service.booking_start or v_time > v_service.booking_end then
      return jsonb_build_object('ok', false, 'error', 'invalid_pacing_rule_time');
    end if;

    v_reason := left(coalesce(nullif(btrim(payload->>'reason'), ''), 'Operator pacing'), 120);

    insert into reservation_demo.pacing_rules(venue_id, service_date, slot_time, max_covers, reason, status, cleared_at)
    values (v_venue, v_date, v_time, v_max, v_reason, 'active', null)
    on conflict (venue_id, service_date, slot_time) do update
    set max_covers = excluded.max_covers,
        reason = excluded.reason,
        status = 'active',
        updated_at = now(),
        cleared_at = null
    returning * into v_rule;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'pacing_rule_set', jsonb_build_object('pacingRuleId', v_rule.id, 'slotTime', to_char(v_rule.slot_time, 'HH24:MI'), 'maxCovers', v_rule.max_covers));

    return jsonb_build_object('ok', true, 'pacingRule', reservation_demo.pacing_rule_payload(v_rule.id), 'demo', true);
  end if;

  if v_op = 'clear' then
    begin
      v_rule_id := (payload->>'ruleId')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_pacing_rule');
    end;

    update reservation_demo.pacing_rules
    set status = 'cleared', updated_at = now(), cleared_at = now()
    where id = v_rule_id and venue_id = v_venue and status = 'active'
    returning * into v_rule;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'pacing_rule_not_found');
    end if;

    insert into reservation_demo.audit_events(actor, action, detail)
    values ('operator-demo', 'pacing_rule_cleared', jsonb_build_object('pacingRuleId', v_rule.id));

    return jsonb_build_object('ok', true, 'pacingRule', reservation_demo.pacing_rule_payload(v_rule.id), 'demo', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_pacing_operation');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'pacing_backend_error', 'code', sqlstate);
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

revoke all on function reservation_demo.pacing_rule_payload(uuid) from public, anon, authenticated;
revoke all on function reservation_demo.pacing_capacity(uuid, date, time) from public, anon, authenticated;
revoke all on function reservation_demo.pacing_current_covers(uuid, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke all on function reservation_demo.pacing_allows_booking(uuid, date, time, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function reservation_demo.prevent_pacing_overbook() from public, anon, authenticated;
revoke all on function public.reservation_demo_operator_pacing(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_pacing(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_pacing(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;

comment on table reservation_demo.pacing_rules is 'Private synthetic per-slot cover caps for the ResyOS-style iPad pacing demo.';
comment on function public.reservation_demo_operator_pacing(jsonb,text) is 'Server-secret-gated operator pacing controls for the synthetic reservation demo.';
