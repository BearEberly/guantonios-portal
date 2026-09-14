-- Inline SMS invalidation inside the public reset RPC so reset diagnostics can
-- identify the exact statement if PostgREST RPC execution differs from direct
-- SQL execution.

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

  v_stage := 'sms_lock';
  perform pg_advisory_xact_lock(214074301, 1);
  v_stage := 'sms_conversations';
  update reservation_demo.sms_conversations
     set criteria = '{}'::jsonb,
         proposal = null,
         booking = null,
         pending_cancel = null,
         active_message_sid = null,
         lease_token = null,
         lease_until = null,
         updated_at = clock_timestamp();
  v_stage := 'sms_messages';
  update reservation_demo.sms_messages
     set status = 'done',
         reply_text = '',
         completed_at = coalesce(completed_at, clock_timestamp()),
         reset_at = clock_timestamp();
  v_stage := 'sms_actions';
  update reservation_demo.sms_actions
     set result = jsonb_build_object('ok', false, 'error', 'demo_reset');

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
