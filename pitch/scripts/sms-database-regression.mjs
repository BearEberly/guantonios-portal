// Offline PostgreSQL regression. No Supabase, Twilio or OpenAI credentials used.
// Set SMS_TEST_PGLITE_ROOT to an unpacked @electric-sql/pglite@0.5.8 package,
// or install that exact version in the caller's module resolution path.
// PGlite executes actual PostgreSQL SQL/PLpgSQL, but has one backend: these
// tests verify lease state transitions, not simultaneous multi-backend locks.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = process.env.SMS_TEST_PGLITE_ROOT;
const moduleUrl = root ? pathToFileURL(`${root}/dist/index.js`).href : '@electric-sql/pglite';
const contrib = (name) => root ? pathToFileURL(`${root}/dist/contrib/${name}.js`).href : `@electric-sql/pglite/contrib/${name}`;
const { PGlite } = await import(moduleUrl);
const { pgcrypto } = await import(contrib('pgcrypto'));
const { btree_gist } = await import(contrib('btree_gist'));
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
const secret = 'offline-synthetic-sms-regression-only';
let serial = 0;
let passed = 0;
const sid = () => `SM${(++serial).toString(16).padStart(32, '0')}`;
const sender = () => (++serial).toString(16).padStart(64, '0');
const query = async (text, args = []) => (await db.query(text, args)).rows;
const scalar = async (text, args = []) => Object.values((await query(text, args))[0])[0];
const rpc = async (payload, key = secret) => scalar('select public.reservation_demo_sms_api($1::jsonb,$2::text)', [JSON.stringify(payload), key]);
const claim = async (senderKey, body, messageSid = sid(), extra = {}) => {
  const result = await rpc({ op: 'claim', senderKey, messageSid, body, ...extra });
  return { ...result, senderKey, messageSid, body };
};
const action = (m, name, data = {}) => rpc({ op: 'action', senderKey: m.senderKey, messageSid: m.messageSid, leaseToken: m.leaseToken, action: name, data });
const finish = (m, replyText = 'Demo response.', extra = {}) => rpc({ op: 'finish', senderKey: m.senderKey, messageSid: m.messageSid, leaseToken: m.leaseToken, replyText, ...extra });
const expireLease = (m) => query("update reservation_demo.sms_conversations set lease_until = now() - interval '1 second' where sender_key=$1", [m.senderKey]);
const state = (key) => scalar('select reservation_demo.sms_state($1)', [key]);
const reset = async () => {
  const r = await scalar('select public.reservation_demo_reset($1)', [secret]);
  assert.equal(r.ok, true, JSON.stringify(r));
};
const criteria = async (extra = {}) => ({
  date: await scalar("select service_date::text from reservation_demo.service_days where status='open' order by service_date limit 1"),
  time: '17:00', partySize: 2, section: 'indoor', ...extra,
});
const offer = async (key, data, extra = {}) => {
  const m = await claim(key, 'Please find a demo table.');
  assert.equal(m.status, 'claimed');
  const held = await action(m, 'hold', data ?? await criteria());
  assert.equal(held.ok, true, JSON.stringify(held));
  await finish(m, 'Demo table held. Reply YES to confirm.', { offerKind: 'hold', ...extra });
  return { m, held };
};
const book = async (key = sender()) => {
  await offer(key);
  const m = await claim(key, 'YES');
  const result = await action(m, 'confirm');
  assert.equal(result.ok, true, JSON.stringify(result));
  await finish(m, 'Demo reservation confirmed.');
  return { key, m, result };
};
const test = async (name, fn) => {
  await fn();
  console.log(`ok ${++passed} - ${name}`);
};

try {
  await db.exec('create role anon; create role authenticated; create role service_role; create schema extensions;');
  await db.exec(await readFile(new URL('../db/2026-09-10-reservation-demo.sql', import.meta.url), 'utf8'));
  await query('update reservation_demo.demo_config set api_secret_hash = reservation_demo.hash_secret($1) where id=1', [secret]);
  await db.exec(await readFile(new URL('../supabase/migrations/20260913071321_reservation_demo_sms.sql', import.meta.url), 'utf8'));
  await reset();

  await test('wrong and missing secrets cannot create sender records', async () => {
    const before = await scalar('select count(*)::int from reservation_demo.sms_conversations');
    for (const key of [null, '', 'incorrect']) {
      assert.equal((await rpc({ op: 'claim', senderKey: sender(), messageSid: sid(), body: 'test' }, key)).error, 'unauthorized');
    }
    assert.equal(await scalar('select count(*)::int from reservation_demo.sms_conversations'), before);
  });

  await test('health authenticates and succeeds inside a read-only transaction', async () => {
    assert.equal((await rpc({ op: 'health' }, 'incorrect')).error, 'unauthorized');
    await db.exec('begin read only');
    try { assert.deepEqual(await rpc({ op: 'health' }), { ok: true, demo: true }); }
    finally { await db.exec('rollback'); }
  });

  await test('private tables have RLS and no anonymous or authenticated read access', async () => {
    assert.equal(await scalar("select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='reservation_demo' and c.relname like 'sms_%' and c.relkind='r' and c.relrowsecurity"), 5);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(() => query('select * from reservation_demo.sms_conversations'), /permission denied/);
        assert.equal((await rpc({ op: 'claim' }, 'incorrect')).error, 'unauthorized');
      } finally { await db.exec('reset role'); }
    }
  });

  await test('MessageSid replay is cached and changed bodies are rejected', async () => {
    const key = sender();
    const m = await claim(key, 'A synthetic message not retained as text.');
    assert.equal(m.status, 'claimed');
    assert.equal((await claim(key, m.body, m.messageSid)).status, 'busy');
    assert.equal((await claim(key, 'changed', m.messageSid)).error, 'message_identity_mismatch');
    await finish(m, 'Cached reply.');
    assert.equal((await claim(key, m.body, m.messageSid)).replyText, 'Cached reply.');
    const row = await scalar('select to_jsonb(m) from reservation_demo.sms_messages m where message_sid=$1', [m.messageSid]);
    assert.equal(JSON.stringify(row).includes(m.body), false);
    assert.equal(row.command_type, 'TEXT');
  });

  await test('a second sender message waits while a processing lease is live', async () => {
    const key = sender();
    const first = await claim(key, 'First request');
    const secondSid = sid();
    assert.equal((await claim(key, 'Second request', secondSid)).status, 'busy');
    await finish(first);
    assert.equal((await claim(key, 'Second request', secondSid)).status, 'claimed');
  });

  await test('expired lease recovery fences old workers and superseded messages', async () => {
    const key = sender();
    const first = await claim(key, 'Request');
    await expireLease(first);
    const recovered = await claim(key, first.body, first.messageSid);
    assert.notEqual(recovered.leaseToken, first.leaseToken);
    assert.equal((await finish(first)).error, 'lease_lost');
    await expireLease(recovered);
    const later = await claim(key, 'Newer request');
    assert.equal(later.status, 'claimed');
    assert.equal((await claim(key, first.body, first.messageSid)).status, 'done');
    assert.equal((await action(recovered, 'search', await criteria())).error, 'lease_lost');
  });

  await test('only a prior offered proposal plus exact YES can confirm', async () => {
    await reset();
    const key = sender();
    const m = await claim(key, 'Book a table please');
    const data = await criteria();
    assert.equal((await action(m, 'search', data)).slots.length > 0, true);
    assert.equal((await action(m, 'hold', data)).ok, true);
    assert.equal((await action(m, 'confirm')).error, 'explicit_yes_required');
    assert.equal(await scalar('select count(*)::int from reservation_demo.bookings'), 0);
    await finish(m, 'Demo offer. Reply YES.', { offerKind: 'hold' });
    const yes = await claim(key, 'YES');
    const result = await action(yes, 'confirm');
    assert.equal(result.ok, true);
    assert.equal((await action(yes, 'confirm')).reference, result.reference);
    await expireLease(yes);
    const recovered = await claim(key, 'YES', yes.messageSid);
    assert.equal((await action(recovered, 'confirm')).reference, result.reference);
    await finish(recovered);
    const secondYes = await claim(key, 'YES');
    assert.equal((await action(secondYes, 'confirm')).error, 'current_proposal_required');
    assert.equal(await scalar('select count(*)::int from reservation_demo.bookings'), 1);
    assert.equal((await action(secondYes, 'hold', data)).error, 'booking_already_exists');
  });

  await test('a different sender cannot view or confirm another sender booking', async () => {
    const m = await claim(sender(), 'YES');
    assert.equal((await action(m, 'confirm')).error, 'current_proposal_required');
    assert.equal((await action(m, 'view', { reference: 'arbitrary', manageToken: 'arbitrary' })).error, 'no_booking');
  });

  await test('changed action payload cannot reuse a successful hold key', async () => {
    await reset();
    const m = await claim(sender(), 'A demo table');
    const data = await criteria();
    const h = await action(m, 'hold', data);
    assert.equal((await action(m, 'hold', data)).holdId, h.holdId);
    assert.equal((await action(m, 'hold', { ...data, time: '18:00' })).error, 'action_request_mismatch');
  });

  await test('failure replies never authorize a committed but unoffered hold', async () => {
    await reset();
    const key = sender();
    const m = await claim(key, 'Book please');
    const h = await action(m, 'hold', await criteria());
    await finish(m, 'There was a temporary problem.');
    assert.equal((await state(key)).proposal, null);
    assert.equal(await scalar('select status from reservation_demo.holds where id=$1', [h.holdId]), 'released');
    const yes = await claim(key, 'YES');
    assert.equal((await action(yes, 'confirm')).error, 'current_proposal_required');
  });

  await test('a partial replacement or RESET invalidates and releases old offer', async () => {
    await reset();
    const key = sender();
    const { held } = await offer(key);
    const changed = await claim(key, 'Actually another date');
    await finish(changed, 'What date?', { criteria: { partySize: 4 } });
    assert.equal((await state(key)).proposal, null);
    assert.equal(await scalar('select status from reservation_demo.holds where id=$1', [held.holdId]), 'released');
    const yes = await claim(key, 'YES');
    assert.equal((await action(yes, 'confirm')).error, 'current_proposal_required');
    await finish(yes);
    const booked = await book(sender());
    const resetMessage = await claim(booked.key, 'RESET');
    await finish(resetMessage, 'Search cleared.', { criteria: {} });
    assert.equal((await state(booked.key)).booking.reference, booked.result.reference);
  });

  await test('expired proposals cannot confirm', async () => {
    await reset();
    const key = sender();
    await offer(key);
    await query("update reservation_demo.sms_conversations set proposal=jsonb_set(proposal,'{expiresAt}',to_jsonb((now()-interval '1 second')::text)) where sender_key=$1", [key]);
    const m = await claim(key, 'YES');
    assert.equal((await action(m, 'confirm')).error, 'current_proposal_required');
  });

  await test('cancellation requires its own prior offer and exact CONFIRM CANCEL', async () => {
    await reset();
    const { key } = await book();
    const accidental = await claim(key, 'CONFIRM CANCEL');
    assert.equal((await action(accidental, 'cancel')).error, 'explicit_cancel_confirmation_required');
    await finish(accidental);
    const request = await claim(key, 'Please cancel my demo booking');
    assert.equal((await action(request, 'request_cancel')).ok, true);
    assert.equal((await action(request, 'cancel')).error, 'explicit_cancel_confirmation_required');
    await finish(request, 'Reply CONFIRM CANCEL to cancel.', { offerKind: 'cancel' });
    const yes = await claim(key, 'CONFIRM CANCEL');
    const cancelled = await action(yes, 'cancel');
    assert.equal(cancelled.reservation.status, 'cancelled');
    assert.equal((await action(yes, 'cancel')).reservation.status, 'cancelled');
  });

  await test('VIEW withdraws a cancellation offer', async () => {
    await reset();
    const { key } = await book();
    const request = await claim(key, 'Please cancel');
    await action(request, 'request_cancel');
    await finish(request, 'Reply CONFIRM CANCEL.', { offerKind: 'cancel' });
    const view = await claim(key, 'VIEW');
    await action(view, 'view');
    await finish(view);
    const cancel = await claim(key, 'CONFIRM CANCEL');
    assert.equal((await action(cancel, 'cancel')).error, 'explicit_cancel_confirmation_required');
  });

  await test('failed cancellation prompts do not permit later cancellation', async () => {
    await reset();
    const { key } = await book();
    const request = await claim(key, 'Please cancel');
    await action(request, 'request_cancel');
    await finish(request, 'Temporary failure.');
    const cancel = await claim(key, 'CONFIRM CANCEL');
    assert.equal((await action(cancel, 'cancel')).error, 'explicit_cancel_confirmation_required');
  });

  await test('STOP preempts work and suppresses prior cached replies until START', async () => {
    await reset();
    const key = sender();
    const { m: offerMessage } = await offer(key);
    const active = await claim(key, 'YES');
    const stop = await claim(key, 'STOP');
    assert.equal(stop.consentStatus, 'opted_out');
    assert.equal((await action(active, 'confirm')).error, 'lease_lost');
    await finish(stop, '');
    assert.equal((await claim(key, 'anything')).status, 'blocked');
    assert.equal((await claim(key, offerMessage.body, offerMessage.messageSid)).replyText, '');
    assert.equal((await finish(offerMessage)).replyText, '');
    const start = await claim(key, 'START');
    assert.equal(start.consentStatus, 'opted_in');
    await finish(start);
  });

  await test('plain CANCEL is opt-out and does not cancel a booking', async () => {
    await reset();
    const { key, result } = await book();
    const cancel = await claim(key, 'CANCEL');
    assert.equal(cancel.consentStatus, 'opted_out');
    assert.equal((await action(cancel, 'cancel')).error, 'opted_out');
    assert.equal(await scalar('select status from reservation_demo.bookings where reference=$1', [result.reference]), 'confirmed');
    await finish(cancel, '');
  });

  await test('demo reset preserves opt-out and dedup but clears private booking and reply content', async () => {
    const key = sender();
    const m = await claim(key, 'STOP');
    await finish(m, '');
    await db.exec('create table public.offline_canary(value integer); insert into public.offline_canary values(1);');
    await reset();
    assert.equal(await scalar('select count(*)::int from public.offline_canary'), 1);
    assert.equal((await claim(key, 'hello')).status, 'blocked');
    assert.equal((await claim(key, 'STOP', m.messageSid)).status, 'done');
    assert.equal(await scalar('select count(*)::int from reservation_demo.sms_conversations where booking is not null or proposal is not null'), 0);
    assert.equal(await scalar("select count(*)::int from reservation_demo.sms_messages where coalesce(reply_text,'')<>''"), 0);
  });

  await test('delivery callbacks require a known response and never regress terminal status', async () => {
    const outboundSid = sid();
    const unknown = await rpc({ op: 'delivery', messageSid: outboundSid, inboundMessageSid: sid(), deliveryStatus: 'sent' });
    assert.equal(unknown.error, 'unknown_inbound_message');
    const m = await claim(sender(), 'test');
    await finish(m);
    for (const deliveryStatus of ['sent', 'delivered', 'queued', 'failed']) {
      assert.equal((await rpc({ op: 'delivery', messageSid: outboundSid, inboundMessageSid: m.messageSid, deliveryStatus })).ok, true);
    }
    assert.equal(await scalar('select delivery_status from reservation_demo.sms_deliveries where message_sid=$1', [outboundSid]), 'delivered');
  });

  await test('100-turn cap caches silent dedup and preserves free recovery commands', async () => {
    const key = sender();
    const first = await claim(key, 'normal request');
    await finish(first);
    await query("insert into reservation_demo.sms_messages(message_sid,sender_key,message_sequence,body_hash,command_type,status,reply_text) select 'SM'||lpad(to_hex(9000+i),32,'0'),$1,i,'synthetic-hash','TEXT','done','' from generate_series(1,99) i", [key]);
    const limited = await claim(key, 'normal request');
    assert.equal(limited.status, 'rate_limited');
    assert.equal(limited.leaseToken, undefined);
    assert.equal((await claim(key, limited.body, limited.messageSid)).replyText, '');
    for (const body of ['VIEW','YES','CONFIRM CANCEL','HELP','STOP','START']) {
      const m = await claim(key, body);
      assert.equal(m.status, 'claimed');
      await finish(m, '');
    }
  });

  await test('client supplied state cannot replace secure booking associations', async () => {
    await reset();
    const { key, result } = await book();
    const m = await claim(key, 'test');
    await finish(m, 'ok', { state: { booking: { reference: 'forged' } }, criteria: { date: null, arbitrarySecret: 'discard me' } });
    assert.equal((await state(key)).booking.reference, result.reference);
    assert.equal((await state(key)).criteria.arbitrarySecret, undefined);
  });

  console.log(`${passed} offline PostgreSQL SMS regression groups passed.`);
} finally {
  await db.close();
}
