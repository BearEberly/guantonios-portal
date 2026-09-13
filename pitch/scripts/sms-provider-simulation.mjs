// Explicit local provider simulation. This never calls Twilio or a public webhook.
// It uses real OpenAI and demo Supabase services and creates then cancels one demo booking.
// From the repository root, after review: SMS_PROVIDER_SIMULATION=1 node pitch/scripts/sms-provider-simulation.mjs
import { readFile, lstat } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes, randomInt, createHmac } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.env.SMS_PROVIDER_SIMULATION !== '1') {
  console.error('Refusing to run: explicitly set SMS_PROVIDER_SIMULATION=1 after reviewing this harness.');
  process.exit(2);
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const privatePath = `${packageRoot}/.dev.vars`;
const expectedSupabaseOrigin = 'https://tcrbfctksulrwudfmxiv.supabase.co';
const simulatedOrigin = 'https://sms-simulation.invalid';
const checks = [];
const networkCounts = { openai: 0, supabase: 0, blocked: 0 };
const durationsMs = {};
const ownMessageSids = new Set();
const ownBookingReferences = new Set();
const baselineReferences = new Set();
let baselineBookings = [];
let baselineReady = false;
let env;
let inbound;
let callDemoRpc;
let originalFetch;
let expectedSenderKey;
let primaryFailure = null;
let cleanupFailure = null;
let finalBookingStatus = null;
let finalConsentStatus = null;
let finishedNormalFlow = false;

function demand(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { safeCode: code });
}
function safeFailure(error) {
  return error?.safeCode || 'simulation_failed_without_printing_provider_error';
}
function newSid() {
  const sid = `SM${randomBytes(16).toString('hex')}`;
  ownMessageSids.add(sid);
  return sid;
}
function bookProjection(bookings) {
  return bookings.map(({ reference, status, partySize, section, startsAt, endsAt, tableCode, guestLabel, createdAt }) =>
    ({ reference, status, partySize, section, startsAt, endsAt, tableCode, guestLabel, createdAt }))
    .sort((a, b) => a.reference.localeCompare(b.reference));
}
async function listBookings() {
  const result = await callDemoRpc(env, { op: 'operator_list', operator: true });
  demand(result?.ok === true && Array.isArray(result.bookings), 'operator_list_failed');
  return result.bookings;
}
function rememberOwnReference(value) {
  if (typeof value !== 'string' || !/^DEMO-[0-9A-F]{8}$/.test(value)) return;
  demand(baselineReady && !baselineReferences.has(value), 'fixture_collides_with_existing_booking');
  ownBookingReferences.add(value);
}

async function send(body, { sid = newSid(), badSignature = false } = {}) {
  const url = `${simulatedOrigin}/api/demo/sms/inbound`;
  const form = new URLSearchParams({
    AccountSid: env.TWILIO_ACCOUNT_SID,
    MessageSid: sid,
    From: env.SMS_TEST_ALLOWLIST,
    To: env.TWILIO_PHONE_NUMBER,
    Body: body,
    NumMedia: '0'
  });
  // Independent Node HMAC implementation, not the application's signature helper.
  const signatureInput = url + [...new Set(form.keys())].sort()
    .flatMap(key => [...new Set(form.getAll(key))].sort().map(value => key + value)).join('');
  const signature = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(signatureInput).digest('base64');
  const request = new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': badSignature ? 'invalid-simulation-signature' : signature
    },
    body: form.toString()
  });
  const started = performance.now();
  const response = await inbound({ request, env });
  const xml = await response.text();
  const durationMs = Math.round(performance.now() - started);
  demand(response.headers.get('content-type')?.includes('text/xml'), 'unexpected_webhook_response_type');
  return { status: response.status, xml, sid, durationMs };
}
function nonempty(response, code) {
  demand(response.status === 200 && response.xml.includes('<Body>'), code);
}
function empty(response, code) {
  demand(response.status === 200 && !response.xml.includes('<Message'), code);
}
function record(label, response) {
  checks.push(label);
  if (response) durationsMs[label] = response.durationMs;
}

try {
  const privateInfo = await lstat(privatePath);
  demand(privateInfo.isFile() && !privateInfo.isSymbolicLink(), 'private_configuration_must_be_regular_file');
  const saved = parseEnv(await readFile(privatePath, 'utf8'));
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DEMO_API_SECRET', 'OPENAI_API_KEY']) {
    demand(typeof saved[key] === 'string' && saved[key].length > 0, `missing_${key}`);
  }
  demand(saved.DEMO_MODE === 'true', 'saved_environment_is_not_demo');
  const databaseUrl = new URL(saved.SUPABASE_URL);
  demand(databaseUrl.origin === expectedSupabaseOrigin && databaseUrl.pathname === '/' && !databaseUrl.search && !databaseUrl.hash && !databaseUrl.username && !databaseUrl.password, 'unexpected_database_target');
  const config = await readFile(`${packageRoot}/wrangler.toml`, 'utf8');
  demand(/^SMS_MODE\s*=\s*"disabled"\s*$/m.test(config), 'versioned_sms_mode_is_not_disabled');
  demand(/^SMS_CARRIER_APPROVED\s*=\s*"false"\s*$/m.test(config), 'versioned_carrier_flag_is_not_false');
  const model = config.match(/^SMS_AI_MODEL\s*=\s*"([a-zA-Z0-9.-]+)"\s*$/m)?.[1];
  demand(model, 'missing_versioned_model');
  // Synthetic credentials and unassigned 000/001 area-code identities exist only in memory.
  // The carrier-approved flag below is a simulated local gate, not actual approval.
  env = Object.freeze({
    SUPABASE_URL: expectedSupabaseOrigin,
    SUPABASE_ANON_KEY: saved.SUPABASE_ANON_KEY,
    DEMO_API_SECRET: saved.DEMO_API_SECRET,
    OPENAI_API_KEY: saved.OPENAI_API_KEY,
    DEMO_MODE: 'true',
    SMS_AI_MODEL: model,
    SMS_AI_REHEARSAL_ENABLED: 'false',
    SMS_MODE: 'test',
    SMS_CARRIER_APPROVED: 'true',
    SMS_PUBLIC_ORIGIN: simulatedOrigin,
    TWILIO_AUTH_TOKEN: randomBytes(32).toString('hex'),
    TWILIO_ACCOUNT_SID: `AC${randomBytes(16).toString('hex')}`,
    TWILIO_PHONE_NUMBER: `+1001${String(randomInt(10000000)).padStart(7, '0')}`,
    SMS_TEST_ALLOWLIST: `+1000${String(randomInt(10000000)).padStart(7, '0')}`
  });
  expectedSenderKey = createHmac('sha256', env.DEMO_API_SECRET)
    .update(`reservation-demo-sms-v1|${env.SMS_TEST_ALLOWLIST}|${env.TWILIO_PHONE_NUMBER}`).digest('hex');
  const importedInbound = await import(pathToFileURL(`${packageRoot}/functions/api/demo/sms/inbound.js`).href);
  const shared = await import(pathToFileURL(`${packageRoot}/functions/api/demo/_shared.js`).href);
  inbound = importedInbound.onRequestPost;
  callDemoRpc = shared.callDemoRpc;

  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const openai = url.origin === 'https://api.openai.com' && url.pathname === '/v1/responses';
    const smsRpc = url.origin === expectedSupabaseOrigin && url.pathname === '/rest/v1/rpc/reservation_demo_sms_api';
    const demoRpc = url.origin === expectedSupabaseOrigin && url.pathname === '/rest/v1/rpc/reservation_demo_api';
    if (method !== 'POST' || url.search || url.hash || url.username || url.password || (!openai && !smsRpc && !demoRpc)) {
      networkCounts.blocked += 1;
      throw Object.assign(new Error('forbidden_network_destination'), { safeCode: 'forbidden_network_destination' });
    }
    demand(networkCounts.openai + networkCounts.supabase < 100, 'simulation_network_budget_exceeded');
    let payload;
    if (openai) {
      demand(networkCounts.openai < 4, 'simulation_ai_call_budget_exceeded');
      networkCounts.openai += 1;
    } else {
      const envelope = JSON.parse(init.body);
      payload = envelope.payload;
      demand(payload && typeof payload === 'object', 'unexpected_rpc_payload');
      if (demoRpc) {
        demand(['meta', 'search', 'operator_list', 'cancel'].includes(payload.op), 'disallowed_demo_operation');
        if (payload.op === 'cancel') {
          demand(ownBookingReferences.has(payload.reference) && !baselineReferences.has(payload.reference), 'cleanup_not_scoped_to_fixture');
        }
      } else {
        demand(['claim', 'action', 'finish'].includes(payload.op), 'disallowed_sms_operation');
        demand(payload.senderKey === expectedSenderKey && ownMessageSids.has(payload.messageSid), 'rpc_not_scoped_to_fixture');
        if (payload.op === 'action') demand(['search', 'hold', 'confirm', 'view', 'request_cancel', 'cancel'].includes(payload.action), 'disallowed_sms_action');
      }
      networkCounts.supabase += 1;
    }
    const response = await originalFetch(input, { ...init, redirect: 'error', signal: init.signal || AbortSignal.timeout(10000) });
    if (smsRpc && response.ok) {
      // Inspect only in memory to retain a precise cleanup reference if later steps fail.
      // Never print request bodies, credentials, raw provider data, or management tokens.
      const result = await response.clone().json();
      if (payload.op === 'action' && payload.action === 'confirm' && result.ok) rememberOwnReference(result.reference);
      rememberOwnReference(result.state?.booking?.reference);
      if (typeof result.consentStatus === 'string') finalConsentStatus = result.consentStatus;
      if (result.state?.booking?.status) finalBookingStatus = result.state.booking.status;
    }
    return response;
  };

  baselineBookings = await listBookings();
  for (const booking of baselineBookings) baselineReferences.add(booking.reference);
  baselineReady = true;
  const meta = await callDemoRpc(env, { op: 'meta' });
  demand(meta?.ok && /^\d{4}-\d{2}-\d{2}$/.test(meta.today || ''), 'demo_date_lookup_failed');
  let chosen;
  for (let offset = 1; offset <= 14; offset += 1) {
    const date = new Date(`${meta.today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.toISOString().slice(0, 10);
    const search = await callDemoRpc(env, { op: 'search', date: day, time: '17:00', partySize: 2, section: 'indoor' });
    demand(search?.ok, 'availability_lookup_failed');
    chosen = search.slots?.find(slot => slot.exact === true && slot.date === day && slot.time === '17:00' && slot.partySize === 2 && slot.seating?.some(seat => seat.section === 'indoor'));
    if (chosen) break;
  }
  demand(chosen, 'no_available_future_demo_slot');
  record('available_future_demo_slot_selected');

  const beforeBadSignature = networkCounts.openai + networkCounts.supabase;
  const bad = await send('START', { badSignature: true });
  demand(bad.status === 403 && networkCounts.openai + networkCounts.supabase === beforeBadSignature, 'invalid_signature_was_not_rejected_before_network');
  record('invalid_signature_rejected_without_network', bad);

  const started = await send('START');
  nonempty(started, 'start_reply_missing');
  demand(finalConsentStatus === 'opted_in', 'start_did_not_record_consent');
  record('start_consent_recorded', started);

  const book = await send(`Please make a demo reservation for 2 people indoors on ${chosen.date} at 5:00 PM.`);
  nonempty(book, 'booking_offer_reply_missing');
  demand(book.xml.includes('Reply YES') && book.xml.includes('held 2 guests') && ownBookingReferences.size === 0, 'booking_was_not_only_held');
  record('real_ai_created_offer_without_confirming', book);

  const confirmed = await send('YES');
  nonempty(confirmed, 'confirmation_reply_missing');
  demand(confirmed.xml.includes('CONFIRMED') && ownBookingReferences.size === 1, 'confirmation_did_not_create_exactly_one_reference');
  record('explicit_yes_confirmed_demo_booking', confirmed);

  const replayAiCount = networkCounts.openai;
  const replay = await send('YES', { sid: confirmed.sid });
  empty(replay, 'replayed_message_emitted_reply');
  demand(networkCounts.openai === replayAiCount && ownBookingReferences.size === 1, 'replay_changed_booking_or_called_ai');
  record('same_message_sid_replay_suppressed', replay);

  const view = await send('VIEW');
  nonempty(view, 'view_reply_missing');
  demand(view.xml.includes('Status: confirmed'), 'view_did_not_show_confirmed_status');
  record('view_verified_confirmed_status', view);

  const cancelOffer = await send('Please cancel my reservation.');
  nonempty(cancelOffer, 'cancellation_offer_reply_missing');
  demand(cancelOffer.xml.includes('Reply CONFIRM CANCEL'), 'cancellation_not_explicitly_offered');
  record('real_ai_requested_explicit_cancellation', cancelOffer);

  const cancelled = await send('CONFIRM CANCEL');
  nonempty(cancelled, 'cancellation_reply_missing');
  demand(cancelled.xml.includes('your demo booking is cancelled') && finalBookingStatus === 'cancelled', 'cancellation_not_recorded');
  record('explicit_cancel_confirmed', cancelled);

  const stopped = await send('STOP');
  nonempty(stopped, 'stop_reply_missing');
  demand(finalConsentStatus === 'opted_out', 'stop_did_not_record_opt_out');
  record('stop_consent_recorded', stopped);

  const optedOutAiCount = networkCounts.openai;
  const optedOut = await send('Could you make another reservation for me?');
  empty(optedOut, 'opted_out_request_emitted_reply');
  demand(networkCounts.openai === optedOutAiCount, 'opted_out_request_called_ai');
  record('opted_out_request_blocked_without_ai', optedOut);

  const resumed = await send('START');
  nonempty(resumed, 'resume_reply_missing');
  demand(finalConsentStatus === 'opted_in', 'resume_did_not_record_consent');
  record('start_resumed_fixture', resumed);
  const finalStop = await send('STOP');
  nonempty(finalStop, 'final_stop_reply_missing');
  demand(finalConsentStatus === 'opted_out', 'final_fixture_is_not_opted_out');
  record('fixture_left_opted_out', finalStop);

  const afterBookings = await listBookings();
  const additions = afterBookings.filter(booking => !baselineReferences.has(booking.reference));
  demand(additions.length === 1 && ownBookingReferences.has(additions[0].reference), 'new_booking_count_is_not_exactly_one');
  demand(additions[0].status === 'cancelled', 'final_booking_is_not_cancelled');
  const survivingBaseline = afterBookings.filter(booking => baselineReferences.has(booking.reference));
  demand(JSON.stringify(bookProjection(survivingBaseline)) === JSON.stringify(bookProjection(baselineBookings)), 'existing_bookings_changed_during_simulation');
  demand(networkCounts.blocked === 0, 'an_outbound_destination_was_blocked');
  record('exactly_one_new_cancelled_booking_and_existing_bookings_preserved');
  finishedNormalFlow = true;
} catch (error) {
  primaryFailure = safeFailure(error);
} finally {
  if (env && inbound && callDemoRpc && originalFetch && baselineReady && !finishedNormalFlow) {
    try {
      // STOP safely releases an unconfirmed fixture hold. It never cancels other senders.
      const stop = await send('STOP');
      demand(stop.status === 200 && finalConsentStatus === 'opted_out', 'cleanup_fixture_stop_failed');
      for (const reference of ownBookingReferences) {
        const bookings = await listBookings();
        const fixture = bookings.find(booking => booking.reference === reference);
        demand(fixture && !baselineReferences.has(reference), 'cleanup_fixture_reference_unverified');
        if (fixture.status !== 'cancelled') {
          const cancel = await callDemoRpc(env, { op: 'cancel', operator: true, reference });
          demand(cancel?.ok && cancel.reservation?.status === 'cancelled', 'cleanup_fixture_cancel_failed');
        }
      }
      const bookings = await listBookings();
      for (const reference of ownBookingReferences) demand(bookings.find(booking => booking.reference === reference)?.status === 'cancelled', 'cleanup_cancel_verification_failed');
      finalBookingStatus = ownBookingReferences.size ? 'cancelled' : null;
    } catch (error) {
      cleanupFailure = safeFailure(error);
    }
  }
  if (originalFetch) globalThis.fetch = originalFetch;
}

const ok = finishedNormalFlow && !primaryFailure && !cleanupFailure;
console.log(JSON.stringify({
  ok,
  simulation: true,
  productionFlagsChanged: false,
  carrierApprovalSimulatedLocallyOnly: true,
  realOpenAiAndDemoSupabaseUsed: networkCounts.openai > 0 && networkCounts.supabase > 0,
  twilioApiCalls: 0,
  smsSent: false,
  deliveryVerified: false,
  checks,
  durationsMs,
  networkCounts,
  createdDemoBookingCount: ownBookingReferences.size,
  finalBookingStatus,
  finalFixtureConsent: finalConsentStatus,
  fixtureMessageCount: ownMessageSids.size,
  fixtureRowsPreservedForAudit: true,
  bookingRowsDeleted: 0,
  demoResetCalled: false,
  primaryFailure,
  cleanupFailure
}, null, 2));
process.exitCode = ok ? 0 : 1;
