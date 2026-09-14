-- Finalize operator reset reliability while SMS remains disabled. The reset RPC
-- clears reservation demo rows only. SMS tombstones and conversation cleanup stay
-- in the private admin SQL path until carrier-approved SMS activation resumes.

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
    reservation_demo.notification_events,
    reservation_demo.audit_events,
    reservation_demo.allocations,
    reservation_demo.booking_attempts,
    reservation_demo.bookings,
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
