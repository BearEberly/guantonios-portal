-- Keep single-table operator moves on the original allocation row while combinations use multiple rows.

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
  v_active_allocation_count integer;
  v_assignment_code text;
  v_assignment_section text;
  v_min_party integer;
  v_max_party integer;
  v_single_table_id uuid;
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

    select table_id into v_single_table_id
    from reservation_demo.resolve_table_assignment(v_booking.venue_id, v_table_code)
    limit 1;

    if coalesce(v_member_count, 0) = 0 then
      return jsonb_build_object('ok', false, 'error', 'table_not_found');
    end if;
    if v_booking.party_size < v_min_party or v_booking.party_size > v_max_party then
      return jsonb_build_object('ok', false, 'error', 'table_size_mismatch');
    end if;

    select count(*)::integer into v_active_allocation_count
    from reservation_demo.allocations
    where booking_id = v_booking.id
      and status not in ('released','expired');

    begin
      if v_member_count = 1 and v_active_allocation_count <= 1 then
        update reservation_demo.allocations
        set table_id = v_single_table_id,
            status = case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end
        where booking_id = v_booking.id
          and status not in ('released','expired');

        if not found then
          insert into reservation_demo.allocations(table_id, booking_id, starts_at, ends_at, status)
          values (v_single_table_id, v_booking.id, v_booking.starts_at, v_booking.ends_at,
            case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end);
        end if;
      else
        update reservation_demo.allocations
        set status = 'released'
        where booking_id = v_booking.id
          and status not in ('released','expired');

        insert into reservation_demo.allocations(table_id, booking_id, starts_at, ends_at, status)
        select table_id, v_booking.id, v_booking.starts_at, v_booking.ends_at,
               case when v_status = 'cancelled' then 'cancelled' when v_status = 'completed' then 'completed' else v_status end
        from reservation_demo.resolve_table_assignment(v_booking.venue_id, v_assignment_code);
      end if;

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

revoke all on function public.reservation_demo_operator_status(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_status(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_status(jsonb, text) to authenticated;
