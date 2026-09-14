-- Add per-table reset stages so reset failures identify the exact cleanup step.

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
  delete from reservation_demo.notify_requests;
  v_stage := 'delete_pacing_rules';
  delete from reservation_demo.pacing_rules;
  v_stage := 'delete_table_blocks';
  delete from reservation_demo.table_blocks;
  v_stage := 'delete_waitlist_entries';
  delete from reservation_demo.waitlist_entries;
  v_stage := 'delete_notification_events';
  delete from reservation_demo.notification_events;
  v_stage := 'delete_audit_events';
  delete from reservation_demo.audit_events;
  v_stage := 'delete_allocations';
  delete from reservation_demo.allocations;
  v_stage := 'delete_booking_attempts';
  delete from reservation_demo.booking_attempts;
  v_stage := 'delete_bookings';
  delete from reservation_demo.bookings;
  v_stage := 'delete_guest_profiles';
  delete from reservation_demo.guest_profiles;
  v_stage := 'delete_holds';
  delete from reservation_demo.holds;
  v_stage := 'delete_service_days';
  delete from reservation_demo.service_days;

  v_stage := 'seed';
  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();

  v_stage := 'audit_insert';
  insert into reservation_demo.audit_events (actor, action, detail)
  values ('operator-demo', 'demo_reset', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'reset', true, 'demo', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'demo_reset_error', 'code', sqlstate, 'message', sqlerrm, 'stage', v_stage);
end;
$$;

revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;
