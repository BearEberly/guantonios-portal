-- Add ResyOS-style protected table blocks for the iPad floor workflow.

create table if not exists reservation_demo.table_blocks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references reservation_demo.venues(id) on delete cascade,
  table_id uuid not null references reservation_demo.demo_tables(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service_date date not null,
  reason text not null default 'Operator block' check (length(reason) between 1 and 120),
  status text not null default 'active' check (status in ('active','cleared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleared_at timestamptz,
  check (ends_at > starts_at)
);

alter table reservation_demo.table_blocks enable row level security;
revoke all on reservation_demo.table_blocks from public, anon, authenticated;

create index if not exists table_blocks_service_idx
  on reservation_demo.table_blocks(service_date, status, starts_at);

alter table reservation_demo.table_blocks
  drop constraint if exists table_blocks_no_overlap;

alter table reservation_demo.table_blocks
  add constraint table_blocks_no_overlap
  exclude using gist (table_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'active');

drop function if exists reservation_demo.table_block_payload(uuid);
create function reservation_demo.table_block_payload(p_id uuid)
returns jsonb
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', tb.id,
    'tableCode', t.code,
    'section', t.section,
    'startsAt', tb.starts_at,
    'endsAt', tb.ends_at,
    'serviceDate', tb.service_date,
    'reason', tb.reason,
    'status', tb.status,
    'createdAt', tb.created_at,
    'updatedAt', tb.updated_at,
    'clearedAt', tb.cleared_at
  )
  from reservation_demo.table_blocks tb
  join reservation_demo.demo_tables t on t.id = tb.table_id
  where tb.id = p_id
$$;

drop function if exists reservation_demo.prevent_blocked_allocation();
create function reservation_demo.prevent_blocked_allocation()
returns trigger
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
begin
  if new.status in ('held','confirmed','checked_in','seated') and exists (
    select 1
    from reservation_demo.table_blocks tb
    where tb.table_id = new.table_id
      and tb.status = 'active'
      and tstzrange(tb.starts_at, tb.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'table blocked' using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists allocations_prevent_blocked_table on reservation_demo.allocations;
create trigger allocations_prevent_blocked_table
  before insert or update of table_id, starts_at, ends_at, status on reservation_demo.allocations
  for each row execute function reservation_demo.prevent_blocked_allocation();

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

revoke all on function reservation_demo.table_block_payload(uuid) from public, anon, authenticated;
revoke all on function reservation_demo.prevent_blocked_allocation() from public, anon, authenticated;
revoke all on function public.reservation_demo_operator_floor(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_floor(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_floor(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;

comment on table reservation_demo.table_blocks is 'Private synthetic table blocks for the ResyOS-style iPad floor demo.';
comment on function public.reservation_demo_operator_floor(jsonb,text) is 'Server-secret-gated operator floor controls for table blocks in the synthetic reservation demo.';
