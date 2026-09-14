-- Keep SMS reset invalidation compatible with safe-update settings.

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
         updated_at = clock_timestamp()
   where true;
  update reservation_demo.sms_messages
     set status = 'done',
         reply_text = '',
         completed_at = coalesce(completed_at, clock_timestamp()),
         reset_at = clock_timestamp()
   where true;
  update reservation_demo.sms_actions
     set result = jsonb_build_object('ok', false, 'error', 'demo_reset')
   where true;
end;
$$;

revoke all on function reservation_demo.sms_reset_demo_state() from public, anon, authenticated;
