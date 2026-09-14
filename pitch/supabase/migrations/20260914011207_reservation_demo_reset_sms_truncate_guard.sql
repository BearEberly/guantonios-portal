-- Keep operator demo reset reliable after SMS tables were added.
-- The SMS reset trigger remains active for normal booking deletes, but reset
-- explicitly invalidates SMS state before TRUNCATE so the trigger does not run
-- cross-table updates from inside a TRUNCATE trigger context.

create or replace function reservation_demo.sms_reset_demo_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(214074301, 1);
  update reservation_demo.sms_conversations
     set criteria = '{}'::jsonb,
         proposal = null,
         booking = null,
         pending_cancel = null,
         active_message_sid = null,
         lease_token = null,
         lease_until = null,
         updated_at = clock_timestamp();
  update reservation_demo.sms_messages
     set status = 'done',
         reply_text = '',
         completed_at = coalesce(completed_at, clock_timestamp()),
         reset_at = clock_timestamp();
  update reservation_demo.sms_actions
     set result = jsonb_build_object('ok', false, 'error', 'demo_reset');
end;
$$;

create or replace function reservation_demo.sms_invalidate_on_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'TRUNCATE' then
    perform reservation_demo.sms_reset_demo_state();
  end if;
  return null;
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

  v_stage := 'sms_invalidate';
  perform reservation_demo.sms_reset_demo_state();

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

revoke all on function reservation_demo.sms_reset_demo_state() from public, anon, authenticated;
revoke all on function reservation_demo.sms_invalidate_on_reset() from public, anon, authenticated;
revoke all on function public.reservation_demo_reset(text) from public;
grant execute on function public.reservation_demo_reset(text) to anon;
grant execute on function public.reservation_demo_reset(text) to authenticated;
