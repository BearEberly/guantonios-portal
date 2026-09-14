-- Keep the protected demo reset compatible with databases that require explicit DELETE predicates.

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

  v_stage := 'reset_lock';
  perform pg_advisory_xact_lock(hashtext('reservation_demo_reset'));

  v_stage := 'delete_notify_requests';
  delete from reservation_demo.notify_requests where true;
  v_stage := 'delete_pacing_rules';
  delete from reservation_demo.pacing_rules where true;
  v_stage := 'delete_table_blocks';
  delete from reservation_demo.table_blocks where true;
  v_stage := 'delete_waitlist_entries';
  delete from reservation_demo.waitlist_entries where true;
  v_stage := 'delete_notification_events';
  delete from reservation_demo.notification_events where true;
  v_stage := 'delete_audit_events';
  delete from reservation_demo.audit_events where true;
  v_stage := 'delete_allocations';
  delete from reservation_demo.allocations where true;
  v_stage := 'delete_booking_attempts';
  delete from reservation_demo.booking_attempts where true;
  v_stage := 'delete_bookings';
  delete from reservation_demo.bookings where true;
  v_stage := 'delete_guest_profiles';
  delete from reservation_demo.guest_profiles where true;
  v_stage := 'delete_holds';
  delete from reservation_demo.holds where true;
  v_stage := 'delete_service_days';
  delete from reservation_demo.service_days where true;

  v_stage := 'seed';
  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();

  v_stage := 'audit_insert';
  insert into reservation_demo.audit_events (actor, action, detail)
  values ('operator-demo', 'demo_reset', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'reset', true, 'demo', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'demo_reset_error', 'code', sqlstate, 'stage', v_stage, 'message', sqlerrm);
end;
$$;

revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;
