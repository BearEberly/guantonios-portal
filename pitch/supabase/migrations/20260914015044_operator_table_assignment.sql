-- Add protected operator table assignment for the iPad floor workflow.

create or replace function reservation_demo.ensure_seed()
returns void
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_venue uuid;
  v_start date := reservation_demo.local_now();
  v_day date;
  v_dow integer;
  v_open time;
  v_close time;
begin
  insert into reservation_demo.venues (slug, name, timezone, address, phone, demo_note)
  values ('guantonios-demo', 'Guantonio''s Wood Fired', 'America/Los_Angeles', '600 W Lockeford Street, Lodi, CA 95240', '(209) 263-7152', 'Synthetic pitch demo data. This is not live restaurant inventory.')
  on conflict (slug) do update set name = excluded.name
  returning id into v_venue;

  insert into reservation_demo.demo_tables (venue_id, code, section, min_party, max_party, display_order)
  values
    (v_venue, '12', 'indoor', 1, 2, 10),
    (v_venue, '14', 'indoor', 2, 4, 20),
    (v_venue, '21', 'indoor', 1, 2, 30),
    (v_venue, '22', 'indoor', 1, 2, 40),
    (v_venue, '31', 'indoor', 2, 4, 50),
    (v_venue, '32', 'indoor', 2, 4, 60),
    (v_venue, '33', 'indoor', 2, 4, 70),
    (v_venue, '34', 'indoor', 2, 4, 80),
    (v_venue, '35', 'indoor', 2, 4, 90),
    (v_venue, '36', 'indoor', 2, 4, 100),
    (v_venue, '37', 'indoor', 1, 2, 110),
    (v_venue, '38', 'indoor', 1, 2, 120),
    (v_venue, '39', 'indoor', 1, 2, 130),
    (v_venue, '40', 'indoor', 2, 4, 140),
    (v_venue, '41', 'indoor', 2, 4, 150),
    (v_venue, '42', 'indoor', 5, 6, 160),
    (v_venue, 'P1', 'outdoor', 1, 2, 170),
    (v_venue, 'P2', 'outdoor', 1, 2, 180),
    (v_venue, 'P3', 'outdoor', 2, 4, 190),
    (v_venue, 'P4', 'outdoor', 2, 4, 200),
    (v_venue, 'P5', 'outdoor', 2, 4, 210),
    (v_venue, 'P6', 'outdoor', 5, 6, 220),
    (v_venue, 'B1', 'outdoor', 1, 1, 230),
    (v_venue, 'B2', 'outdoor', 1, 1, 240)
  on conflict (venue_id, code) do update
  set section = excluded.section,
      min_party = excluded.min_party,
      max_party = excluded.max_party,
      display_order = excluded.display_order,
      active = true;

  for v_day in select generate_series(v_start, v_start + 30, interval '1 day')::date loop
    v_dow := extract(isodow from v_day);
    if v_dow between 2 and 4 then
      v_open := time '17:00';
      v_close := time '20:00';
      insert into reservation_demo.service_days (venue_id, service_date, open_time, close_time, booking_start, booking_end, status)
      values (v_venue, v_day, v_open, v_close, time '17:00', time '19:30', 'open')
      on conflict (venue_id, service_date) do update
      set open_time = excluded.open_time,
          close_time = excluded.close_time,
          booking_start = excluded.booking_start,
          booking_end = excluded.booking_end,
          status = case when reservation_demo.service_days.status = 'closed' and extract(isodow from reservation_demo.service_days.service_date) in (1,7) then 'closed' else reservation_demo.service_days.status end;
    elsif v_dow in (5, 6) then
      v_open := time '17:00';
      v_close := time '21:00';
      insert into reservation_demo.service_days (venue_id, service_date, open_time, close_time, booking_start, booking_end, status)
      values (v_venue, v_day, v_open, v_close, time '17:00', time '20:30', 'open')
      on conflict (venue_id, service_date) do update
      set open_time = excluded.open_time,
          close_time = excluded.close_time,
          booking_start = excluded.booking_start,
          booking_end = excluded.booking_end;
    else
      insert into reservation_demo.service_days (venue_id, service_date, open_time, close_time, booking_start, booking_end, status, note)
      values (v_venue, v_day, time '00:00', time '00:00', time '00:00', time '00:00', 'closed', 'Synthetic demo closure for Sunday and Monday.')
      on conflict (venue_id, service_date) do nothing;
    end if;
  end loop;
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
  v_target_table reservation_demo.demo_tables%rowtype;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();

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
    update reservation_demo.bookings
    set status = v_status,
        updated_at = now()
    where id = v_booking.id
    returning * into v_booking;

    update reservation_demo.allocations
    set status = case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end
    where booking_id = v_booking.id;
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
exception when others then
  return jsonb_build_object('ok', false, 'error', 'operator_status_error', 'code', sqlstate);
end;
$$;

revoke all on function public.reservation_demo_operator_status(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_status(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_status(jsonb, text) to authenticated;

select reservation_demo.ensure_seed();
