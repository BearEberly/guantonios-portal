-- Apply after pitch/db/2026-09-10-reservation-demo.sql.
-- Controlled SMS demonstration only. The Pages server validates the Twilio
-- signature, destination and tester allowlist BEFORE calling this RPC.
-- senderKey is HMAC-SHA256(DEMO_API_SECRET,
--   'reservation-demo-sms-v1|' + normalizedFrom + '|' + normalizedTo).
-- No raw phone numbers or inbound message bodies are persisted here.

create table reservation_demo.sms_conversations (
  sender_key text primary key check (sender_key ~ '^[0-9a-f]{64}$'),
  criteria jsonb not null default '{}'::jsonb,
  proposal jsonb,
  booking jsonb,
  pending_cancel jsonb,
  consent_status text not null default 'conversational'
    check (consent_status in ('conversational', 'opted_in', 'opted_out')),
  message_sequence bigint not null default 0,
  active_message_sid text,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reservation_demo.sms_messages (
  message_sid text primary key check (message_sid ~ '^SM[0-9a-fA-F]{32}$'),
  sender_key text not null references reservation_demo.sms_conversations(sender_key),
  message_sequence bigint not null,
  body_hash text not null,
  command_type text not null,
  status text not null default 'processing' check (status in ('processing', 'done')),
  reply_text text check (length(reply_text) <= 1600),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  reset_at timestamptz
);
create index sms_messages_sender_created_idx
  on reservation_demo.sms_messages(sender_key, created_at desc);

create table reservation_demo.sms_actions (
  message_sid text not null references reservation_demo.sms_messages(message_sid),
  action text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (message_sid, action)
);

create table reservation_demo.sms_consent_events (
  id uuid primary key default gen_random_uuid(),
  sender_key text not null references reservation_demo.sms_conversations(sender_key),
  message_sid text not null unique references reservation_demo.sms_messages(message_sid),
  consent_status text not null check (consent_status in ('conversational', 'opted_in', 'opted_out')),
  source text not null check (source in ('inbound_request', 'START', 'STOP')),
  created_at timestamptz not null default now()
);

create table reservation_demo.sms_deliveries (
  message_sid text primary key check (message_sid ~ '^SM[0-9a-fA-F]{32}$'),
  inbound_message_sid text not null references reservation_demo.sms_messages(message_sid),
  delivery_status text not null
    check (delivery_status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'read')),
  error_code text check (error_code ~ '^[0-9]{1,8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sms_deliveries_inbound_idx on reservation_demo.sms_deliveries(inbound_message_sid);

alter table reservation_demo.sms_conversations enable row level security;
alter table reservation_demo.sms_messages enable row level security;
alter table reservation_demo.sms_actions enable row level security;
alter table reservation_demo.sms_consent_events enable row level security;
alter table reservation_demo.sms_deliveries enable row level security;
revoke all on reservation_demo.sms_conversations, reservation_demo.sms_messages,
  reservation_demo.sms_actions, reservation_demo.sms_consent_events,
  reservation_demo.sms_deliveries from public, anon, authenticated;

create function reservation_demo.sms_state(p_sender_key text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('criteria', c.criteria, 'proposal', c.proposal,
    'booking', c.booking, 'pendingCancel', c.pending_cancel)
  from reservation_demo.sms_conversations c where c.sender_key = p_sender_key
$$;

-- Releasing an unconfirmed SMS offer only changes existing hold/allocation rows.
-- Availability, hold creation, confirmation, view and cancellation use the
-- original reservation_demo_api below as their transactional source of truth.
create function reservation_demo.sms_release_proposal(p_proposal jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if p_proposal is not null then
    update reservation_demo.allocations a set status = 'released'
      where a.hold_id = (p_proposal->>'holdId')::uuid and a.status = 'held';
    update reservation_demo.holds h set status = 'released'
      where h.id = (p_proposal->>'holdId')::uuid and h.status = 'held';
  end if;
end;
$$;

create function public.reservation_demo_sms_api(payload jsonb, secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_op text := payload->>'op';
  v_sender text := payload->>'senderKey';
  v_sid text := payload->>'messageSid';
  v_hash text;
  v_body text;
  v_command text;
  v_now timestamptz := clock_timestamp();
  v_c reservation_demo.sms_conversations%rowtype;
  v_m reservation_demo.sms_messages%rowtype;
  v_a reservation_demo.sms_actions%rowtype;
  v_d reservation_demo.sms_deliveries%rowtype;
  v_action text;
  v_data jsonb := coalesce(payload->'data', '{}'::jsonb);
  v_criteria jsonb;
  v_result jsonb;
  v_proposal jsonb;
  v_reply text;
  v_status text;
  v_old_rank integer;
  v_new_rank integer;
  v_is_new boolean := false;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if secret is null or v_hash is null or reservation_demo.hash_secret(secret) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;
  if v_op = 'health' then
    return jsonb_build_object('ok', true, 'demo', true);
  end if;
  -- Serializes SMS operations with the reset trigger, without serializing
  -- independent senders. Row locks below fence work for a single sender.
  perform pg_advisory_xact_lock_shared(214074301, 1);

  if v_op = 'delivery' then
    v_status := payload->>'deliveryStatus';
    if v_sid is null or v_sid !~ '^SM[0-9a-fA-F]{32}$'
      or coalesce(payload->>'inboundMessageSid', '') !~ '^SM[0-9a-fA-F]{32}$'
      or v_status is null or v_status not in ('queued','sending','sent','delivered','undelivered','failed','read')
      or (nullif(payload->>'errorCode', '') is not null and payload->>'errorCode' !~ '^[0-9]{1,8}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_delivery');
    end if;
    if not exists (select 1 from reservation_demo.sms_messages
      where message_sid = payload->>'inboundMessageSid' and status = 'done') then
      return jsonb_build_object('ok', false, 'error', 'unknown_inbound_message');
    end if;
    insert into reservation_demo.sms_deliveries(message_sid, inbound_message_sid, delivery_status, error_code)
      values (v_sid, payload->>'inboundMessageSid', v_status, nullif(payload->>'errorCode', ''))
      on conflict (message_sid) do nothing;
    select * into v_d from reservation_demo.sms_deliveries where message_sid = v_sid for update;
    if v_d.inbound_message_sid <> payload->>'inboundMessageSid' then
      return jsonb_build_object('ok', false, 'error', 'message_identity_mismatch');
    end if;
    v_old_rank := case v_d.delivery_status when 'queued' then 1 when 'sending' then 2 when 'sent' then 3 when 'read' then 5 else 4 end;
    v_new_rank := case v_status when 'queued' then 1 when 'sending' then 2 when 'sent' then 3 when 'read' then 5 else 4 end;
    if (v_old_rank < 4 and v_new_rank > v_old_rank)
      or (v_d.delivery_status = 'delivered' and v_status = 'read') then
      update reservation_demo.sms_deliveries set delivery_status = v_status,
        error_code = nullif(payload->>'errorCode', ''), updated_at = v_now where message_sid = v_sid;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_sender is null or v_sender !~ '^[0-9a-f]{64}$'
    or v_sid is null or v_sid !~ '^SM[0-9a-fA-F]{32}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_message_identity');
  end if;

  if v_op = 'claim' then
    v_body := payload->>'body';
    if v_body is null or length(v_body) > 1600 then
      return jsonb_build_object('ok', false, 'error', 'invalid_body');
    end if;
    v_command := upper(btrim(v_body));
    if payload->>'optOutType' = 'STOP' or v_command in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT') then
      v_command := 'STOP';
    elsif payload->>'optOutType' = 'START' or v_command in ('START','UNSTOP') then
      v_command := 'START';
    elsif payload->>'optOutType' = 'HELP' or v_command in ('HELP','INFO') then
      v_command := 'HELP';
    elsif v_command not in ('YES', 'CONFIRM CANCEL', 'VIEW', 'STATUS', 'RESET') then
      v_command := 'TEXT';
    end if;
    insert into reservation_demo.sms_conversations(sender_key) values(v_sender) on conflict do nothing;
    select * into v_c from reservation_demo.sms_conversations where sender_key = v_sender for update;
    select * into v_m from reservation_demo.sms_messages where message_sid = v_sid for update;
    if found then
      if v_m.sender_key <> v_sender or v_m.body_hash <> reservation_demo.hash_secret(v_body) then
        return jsonb_build_object('ok', false, 'error', 'message_identity_mismatch');
      end if;
      if v_m.status = 'done' then
        return jsonb_build_object('ok', true, 'status', 'done', 'replyText',
          case when v_c.consent_status = 'opted_out' and v_m.command_type not in ('STOP','HELP')
            then '' else coalesce(v_m.reply_text, '') end,
          'consentStatus', v_c.consent_status);
      end if;
      -- An abandoned earlier message cannot overtake a later conversation turn.
      if v_m.message_sequence < v_c.message_sequence then
        update reservation_demo.sms_messages set status = 'done', reply_text = '', completed_at = v_now where message_sid = v_sid;
        return jsonb_build_object('ok', true, 'status', 'done', 'replyText', '', 'consentStatus', v_c.consent_status);
      end if;
    end if;
    if v_c.lease_until > v_now and v_command <> 'STOP' then
      return jsonb_build_object('ok', true, 'status', 'busy', 'retryAfterSeconds', 2);
    end if;
    if v_m.message_sid is null then
      v_is_new := true;
      v_c.message_sequence := v_c.message_sequence + 1;
      insert into reservation_demo.sms_messages(message_sid, sender_key, message_sequence, body_hash, command_type)
        values(v_sid, v_sender, v_c.message_sequence, reservation_demo.hash_secret(v_body), v_command)
        returning * into v_m;
    end if;
    -- Bound paid interpretation to 100 new free-text turns per rolling day.
    -- Provider retries and deterministic safety/booking commands remain usable.
    if v_is_new and v_command = 'TEXT' and (
      select count(*) from reservation_demo.sms_messages where sender_key = v_sender
        and command_type = 'TEXT' and created_at >= v_now - interval '24 hours'
    ) > 100 then
      -- Empty replay prevents a provider retry from producing a paid reply.
      v_reply := '';
      update reservation_demo.sms_messages set status = 'done', reply_text = v_reply, completed_at = v_now where message_sid = v_sid;
      update reservation_demo.sms_conversations set message_sequence = v_c.message_sequence,
        active_message_sid = null, lease_token = null, lease_until = null, updated_at = v_now where sender_key = v_sender;
      return jsonb_build_object('ok', true, 'status', 'rate_limited', 'replyText', v_reply,
        'consentStatus',v_c.consent_status);
    end if;
    if v_command = 'STOP' then
      perform reservation_demo.sms_release_proposal(v_c.proposal);
      v_c.proposal := null;
      v_c.pending_cancel := null;
      v_c.consent_status := 'opted_out';
    elsif v_command = 'START' then
      v_c.consent_status := 'opted_in';
    end if;
    insert into reservation_demo.sms_consent_events(sender_key,message_sid,consent_status,source)
      values(v_sender,v_sid,v_c.consent_status,
        case v_command when 'STOP' then 'STOP' when 'START' then 'START' else 'inbound_request' end)
      on conflict(message_sid) do nothing;
    if v_c.consent_status = 'opted_out' and v_command not in ('STOP','HELP') then
      update reservation_demo.sms_messages set status = 'done', reply_text = '', completed_at = v_now where message_sid = v_sid;
      update reservation_demo.sms_conversations set message_sequence = v_c.message_sequence,
        active_message_sid = null, lease_token = null, lease_until = null, updated_at = v_now where sender_key = v_sender;
      return jsonb_build_object('ok', true, 'status', 'blocked', 'replyText', '', 'consentStatus', 'opted_out');
    end if;
    v_c.lease_token := gen_random_uuid();
    update reservation_demo.sms_conversations set message_sequence = v_c.message_sequence,
      proposal = v_c.proposal, pending_cancel = v_c.pending_cancel, consent_status = v_c.consent_status,
      active_message_sid = v_sid, lease_token = v_c.lease_token,
      lease_until = v_now + interval '45 seconds', updated_at = v_now where sender_key = v_sender;
    return jsonb_build_object('ok', true, 'status', 'claimed', 'leaseToken', v_c.lease_token,
      'leaseExpiresAt', v_now + interval '45 seconds', 'state', reservation_demo.sms_state(v_sender),
      'consentStatus', v_c.consent_status);
  end if;

  select * into v_c from reservation_demo.sms_conversations where sender_key = v_sender for update;
  select * into v_m from reservation_demo.sms_messages where message_sid = v_sid and sender_key = v_sender for update;
  if v_c.sender_key is null or v_m.message_sid is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_message');
  end if;
  if v_op = 'finish' and v_m.status = 'done' then
    return jsonb_build_object('ok', true, 'status', 'done', 'replyText',
      case when v_c.consent_status = 'opted_out' and v_m.command_type not in ('STOP','HELP')
        then '' else coalesce(v_m.reply_text, '') end);
  end if;
  if v_m.status <> 'processing' or v_c.active_message_sid is distinct from v_sid
    or v_c.lease_token::text is distinct from payload->>'leaseToken' or v_c.lease_until <= v_now
    or v_c.lease_token is null then
    return jsonb_build_object('ok', false, 'error', 'lease_lost');
  end if;

  if v_op = 'finish' then
    v_reply := payload->>'replyText';
    if v_reply is null or length(v_reply) > 1600 then
      return jsonb_build_object('ok', false, 'error', 'invalid_reply');
    end if;
    if payload ? 'criteria' then
      if jsonb_typeof(payload->'criteria') is distinct from 'object' then
        return jsonb_build_object('ok', false, 'error', 'invalid_criteria');
      end if;
      select coalesce(jsonb_object_agg(key,value), '{}'::jsonb) into v_criteria
        from jsonb_each(payload->'criteria') where key in ('date','time','partySize','section');
      if octet_length(v_criteria::text) > 512 then
        return jsonb_build_object('ok', false, 'error', 'invalid_criteria');
      end if;
      if v_c.proposal is not null and v_c.proposal->>'proposalId' <> v_sid
        and v_criteria is distinct from v_c.proposal->'criteria' then
        perform reservation_demo.sms_release_proposal(v_c.proposal);
        v_c.proposal := null;
      end if;
      if v_criteria is distinct from v_c.criteria then v_c.pending_cancel := null; end if;
      v_c.criteria := v_criteria;
    end if;
    if v_c.proposal->>'proposalId' = v_sid then
      if payload->>'offerKind' = 'hold' and length(v_reply) > 0 then
        v_c.proposal := v_c.proposal || jsonb_build_object('offeredAt', v_now);
      else
        perform reservation_demo.sms_release_proposal(v_c.proposal);
        v_c.proposal := null;
      end if;
    end if;
    if v_c.pending_cancel->>'requestedByMessageSid' = v_sid then
      if payload->>'offerKind' = 'cancel' and length(v_reply) > 0 then
        v_c.pending_cancel := v_c.pending_cancel || jsonb_build_object('offeredAt', v_now);
      else
        v_c.pending_cancel := null;
      end if;
    end if;
    if v_c.consent_status = 'opted_out' and v_m.command_type not in ('STOP','HELP') then v_reply := ''; end if;
    update reservation_demo.sms_conversations set criteria = v_c.criteria, proposal = v_c.proposal,
      pending_cancel = v_c.pending_cancel, active_message_sid = null, lease_token = null,
      lease_until = null, updated_at = v_now where sender_key = v_sender;
    update reservation_demo.sms_messages set status = 'done', reply_text = v_reply, completed_at = v_now where message_sid = v_sid;
    return jsonb_build_object('ok', true, 'status', 'done', 'replyText', v_reply,
      'state', reservation_demo.sms_state(v_sender), 'consentStatus', v_c.consent_status);
  end if;

  if v_op = 'action' then
    if v_c.consent_status = 'opted_out' then
      return jsonb_build_object('ok', false, 'error', 'opted_out');
    end if;
    v_action := payload->>'action';
    if v_action is null or v_action not in ('search','hold','confirm','view','request_cancel','cancel')
      or jsonb_typeof(v_data) is distinct from 'object' or octet_length(v_data::text) > 1024 then
      return jsonb_build_object('ok', false, 'error', 'invalid_action');
    end if;
    select * into v_a from reservation_demo.sms_actions where message_sid = v_sid and action = v_action;
    if found then
      if v_a.request_hash <> reservation_demo.hash_secret(v_data::text) then
        return jsonb_build_object('ok', false, 'error', 'action_request_mismatch');
      end if;
      return v_a.result || jsonb_build_object('state', reservation_demo.sms_state(v_sender), 'consentStatus', v_c.consent_status, 'recovered', true);
    end if;

    if v_action in ('search','hold') then
      select coalesce(jsonb_object_agg(key,value), '{}'::jsonb) into v_criteria
        from jsonb_each(v_data) where key in ('date','time','partySize','section');
      if v_action = 'hold' and v_c.booking is not null
        and exists(select 1 from reservation_demo.bookings b where b.reference = v_c.booking->>'reference'
          and b.status in ('confirmed','checked_in','seated')) then
        return jsonb_build_object('ok', false, 'error', 'booking_already_exists', 'state', reservation_demo.sms_state(v_sender));
      end if;
      if v_action = 'hold' then
        perform reservation_demo.sms_release_proposal(v_c.proposal);
        update reservation_demo.sms_conversations set proposal = null where sender_key = v_sender;
      end if;
      v_result := public.reservation_demo_api(v_criteria || jsonb_build_object('op', v_action,
        'idempotencyKey', 'sms-hold-' || v_sid), secret);
      if v_action = 'hold' and v_result->>'ok' = 'true' then
        v_proposal := v_result || v_criteria || jsonb_build_object('proposalId',v_sid,
          'criteria',v_criteria,'offeredAt',null);
        update reservation_demo.sms_conversations set proposal = v_proposal,
          criteria = v_criteria, pending_cancel = null, updated_at = v_now where sender_key = v_sender;
      end if;
    elsif v_action = 'confirm' then
      if v_m.command_type <> 'YES' then
        return jsonb_build_object('ok', false, 'error', 'explicit_yes_required');
      end if;
      if v_c.proposal is null or v_c.proposal->>'offeredAt' is null
        or (v_c.proposal->>'offeredAt')::timestamptz > v_m.created_at
        or (v_c.proposal->>'expiresAt')::timestamptz <= v_now
        or v_c.criteria is distinct from v_c.proposal->'criteria' then
        return jsonb_build_object('ok', false, 'error', 'current_proposal_required', 'state', reservation_demo.sms_state(v_sender));
      end if;
      v_result := public.reservation_demo_api(jsonb_build_object('op','confirm',
        'holdId',v_c.proposal->>'holdId','holdToken',v_c.proposal->>'holdToken',
        'idempotencyKey','sms-confirm-' || (v_c.proposal->>'proposalId')), secret);
      if v_result->>'ok' = 'true' then
        update reservation_demo.sms_conversations set booking = v_result, proposal = null,
          pending_cancel = null, updated_at = v_now where sender_key = v_sender;
      end if;
    elsif v_action in ('view','request_cancel','cancel') then
      if v_c.booking is null then
        return jsonb_build_object('ok', false, 'error', 'no_booking');
      end if;
      if v_action = 'cancel' and (v_m.command_type <> 'CONFIRM CANCEL'
        or v_c.pending_cancel is null or v_c.pending_cancel->>'offeredAt' is null
        or (v_c.pending_cancel->>'offeredAt')::timestamptz > v_m.created_at
        or (v_c.pending_cancel->>'expiresAt')::timestamptz <= v_now
        or v_c.pending_cancel->>'reference' is distinct from v_c.booking->>'reference') then
        return jsonb_build_object('ok', false, 'error', 'explicit_cancel_confirmation_required');
      end if;
      v_result := public.reservation_demo_api(jsonb_build_object(
        'op',case when v_action = 'cancel' then 'cancel' else 'view' end,
        'reference',v_c.booking->>'reference','manageToken',v_c.booking->>'manageToken'), secret);
      if v_result->>'ok' = 'true' then
        if v_action = 'request_cancel' and v_result#>>'{reservation,status}' <> 'cancelled' then
          update reservation_demo.sms_conversations set pending_cancel = jsonb_build_object(
            'reference',v_c.booking->>'reference','requestedByMessageSid',v_sid,
            'offeredAt',null,'expiresAt',v_now + interval '5 minutes'), updated_at = v_now where sender_key = v_sender;
        elsif v_action = 'view' then
          update reservation_demo.sms_conversations set pending_cancel = null,
            booking = v_c.booking || (v_result->'reservation'), updated_at = v_now where sender_key = v_sender;
        elsif v_action = 'cancel' then
          update reservation_demo.sms_conversations set pending_cancel = null,
            booking = v_c.booking || jsonb_build_object('status','cancelled'), updated_at = v_now where sender_key = v_sender;
        end if;
      end if;
    end if;
    insert into reservation_demo.sms_actions(message_sid,action,request_hash,result)
      values(v_sid,v_action,reservation_demo.hash_secret(v_data::text),v_result);
    return v_result || jsonb_build_object('state', reservation_demo.sms_state(v_sender), 'consentStatus', v_c.consent_status);
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_operation');
exception when others then
  -- An exception rolls back this invocation, including any nested booking call.
  -- Never return provider payloads, database details, tokens or message text.
  return jsonb_build_object('ok', false, 'error', 'sms_backend_error', 'code', sqlstate);
end;
$$;

-- Reset synthetic reservations without reviving opted-out senders or replaying
-- old messages as new bookings. Consent and dedup tombstones remain private.
create function reservation_demo.sms_invalidate_on_reset()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(214074301, 1);
  update reservation_demo.sms_conversations set criteria = '{}'::jsonb,
    proposal = null, booking = null, pending_cancel = null,
    active_message_sid = null, lease_token = null, lease_until = null, updated_at = clock_timestamp();
  update reservation_demo.sms_messages set status = 'done', reply_text = '',
    completed_at = coalesce(completed_at,clock_timestamp()), reset_at = clock_timestamp();
  update reservation_demo.sms_actions set result = jsonb_build_object('ok',false,'error','demo_reset');
  return null;
end;
$$;
create trigger sms_invalidate_on_demo_reset
  before delete or truncate on reservation_demo.bookings
  for each statement execute function reservation_demo.sms_invalidate_on_reset();

revoke all on function reservation_demo.sms_state(text) from public, anon, authenticated;
revoke all on function reservation_demo.sms_release_proposal(jsonb) from public, anon, authenticated;
revoke all on function reservation_demo.sms_invalidate_on_reset() from public, anon, authenticated;
revoke all on function public.reservation_demo_sms_api(jsonb,text) from public, anon, authenticated;
grant execute on function public.reservation_demo_sms_api(jsonb,text) to anon, authenticated;
comment on function public.reservation_demo_sms_api(jsonb,text) is
  'Server-secret-gated controlled SMS demo RPC. Private sender state, fenced leases, explicit confirmation and replay cache. Not a public guest API.';
