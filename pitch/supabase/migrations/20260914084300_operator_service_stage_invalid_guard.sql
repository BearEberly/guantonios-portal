-- Return a deterministic validation error when the operator omits the service stage.

create or replace function public.reservation_demo_operator_service(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_reference text := payload->>'reference';
  v_stage text := coalesce(nullif(payload->>'serviceStage', ''), nullif(payload->>'stage', ''));
  v_booking reservation_demo.bookings%rowtype;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();

  if v_stage is null or v_stage not in ('not_started','ordered','fired','entrees','dessert','check_dropped','paid') then
    return jsonb_build_object('ok', false, 'error', 'invalid_service_stage');
  end if;

  select * into v_booking from reservation_demo.bookings where reference = v_reference;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_booking.status <> 'seated' then
    return jsonb_build_object('ok', false, 'error', 'service_stage_unavailable');
  end if;

  update reservation_demo.bookings
  set service_stage = v_stage,
      service_stage_updated_at = case when v_stage = 'not_started' then null else now() end,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  insert into reservation_demo.audit_events (actor, action, booking_id, detail)
  values ('operator-demo', 'operator_service_stage', v_booking.id, jsonb_build_object('serviceStage', v_stage));

  return jsonb_build_object(
    'ok', true,
    'reference', v_booking.reference,
    'serviceStage', v_booking.service_stage,
    'serviceStageUpdatedAt', v_booking.service_stage_updated_at,
    'turnRisk', reservation_demo.booking_turn_risk(v_booking.status, v_booking.service_stage, v_booking.ends_at),
    'demo', true
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', 'operator_service_error', 'code', sqlstate);
end;
$$;

revoke all on function public.reservation_demo_operator_service(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_service(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_service(jsonb, text) to authenticated;

comment on function public.reservation_demo_operator_service(jsonb,text) is 'Server-secret-gated operator service-stage control for the synthetic reservation demo.';
