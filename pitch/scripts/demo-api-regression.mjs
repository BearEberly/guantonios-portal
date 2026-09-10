const base = process.env.DEMO_BASE_URL || 'http://localhost:8788';
const operatorToken = process.env.DEMO_OPERATOR_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!operatorToken) throw new Error('DEMO_OPERATOR_TOKEN is required');

async function post(path, body, token) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-demo-operator-token': token } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function laDate(offsetDays) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(Date.now() + offsetDays * 86400000));
}

async function findOpenDate(partySize = 2, section = 'indoor', time = '19:30') {
  for (let i = 0; i < 14; i += 1) {
    const date = laDate(i);
    const result = await post('/api/demo/search', { date, time, partySize, section });
    if (result.data.available) return { date, result };
  }
  throw new Error(`No open demo date found for ${partySize} ${section} ${time}`);
}

const evidence = [];
const reset = await post('/api/demo/operator/reset', {}, operatorToken);
assert(reset.status === 200 && reset.data.ok, 'operator reset failed', reset);
evidence.push(['reset', reset.status, reset.data.ok]);

const open = await findOpenDate(2, 'indoor', '19:30');
const slot = open.result.data.slots[0];
evidence.push(['search', open.result.status, open.result.data.slots.length, open.date]);

const holdKey = `hold_reg_${Date.now()}`;
const hold = await post('/api/demo/hold', { date: slot.date, time: slot.time, partySize: 2, section: 'indoor', idempotencyKey: holdKey });
assert(hold.status === 200 && hold.data.ok && hold.data.holdToken, 'hold failed', hold);
const holdRetry = await post('/api/demo/hold', { date: slot.date, time: slot.time, partySize: 2, section: 'indoor', idempotencyKey: holdKey });
assert(holdRetry.status === 200 && holdRetry.data.recovered && holdRetry.data.holdToken === hold.data.holdToken, 'hold retry failed', holdRetry);
evidence.push(['hold_retry', holdRetry.status, holdRetry.data.recovered]);

const wrongConfirm = await post('/api/demo/confirm', { holdId: hold.data.holdId, holdToken: 'wrong-token', idempotencyKey: `confirm_wrong_${Date.now()}` });
assert(wrongConfirm.status === 409 && wrongConfirm.data.error === 'hold_expired_or_unauthorized', 'wrong hold token should fail', wrongConfirm);
const confirmKey = `confirm_reg_${Date.now()}`;
const confirm = await post('/api/demo/confirm', { holdId: hold.data.holdId, holdToken: hold.data.holdToken, idempotencyKey: confirmKey, firstName: 'Demo', lastName: 'Guest', email: 'demo@example.invalid', mobile: '(209) 555-0199' });
assert(confirm.status === 200 && confirm.data.ok && confirm.data.reference && confirm.data.manageToken, 'confirm failed', confirm);
const confirmRetry = await post('/api/demo/confirm', { holdId: hold.data.holdId, holdToken: hold.data.holdToken, idempotencyKey: confirmKey });
assert(confirmRetry.status === 200 && confirmRetry.data.recovered && confirmRetry.data.reference === confirm.data.reference, 'confirm retry failed', confirmRetry);
evidence.push(['confirm_retry', confirmRetry.status, confirmRetry.data.reference]);

const badView = await post('/api/demo/view', { reference: confirm.data.reference, manageToken: 'wrong' });
assert(badView.status === 401, 'wrong management token should fail', badView);
const view = await post('/api/demo/view', { reference: confirm.data.reference, manageToken: confirm.data.manageToken });
assert(view.status === 200 && view.data.reservation.status === 'confirmed', 'view failed', view);
evidence.push(['view', view.status, view.data.reservation.status]);

const change = await post('/api/demo/change', { reference: confirm.data.reference, manageToken: confirm.data.manageToken, date: open.date, time: '18:00', partySize: 2, section: 'outdoor' });
assert(change.status === 200 && change.data.reservation.section === 'outdoor', 'change failed', change);
evidence.push(['change', change.status, change.data.reservation.section]);

const cancel = await post('/api/demo/cancel', { reference: confirm.data.reference, manageToken: confirm.data.manageToken });
assert(cancel.status === 200 && cancel.data.reservation.status === 'cancelled', 'cancel failed', cancel);
evidence.push(['cancel', cancel.status, cancel.data.reservation.status]);

const opList = await post('/api/demo/operator/list', {}, operatorToken);
assert(opList.status === 200 && opList.data.bookings.some(b => b.reference === confirm.data.reference && b.status === 'cancelled'), 'operator list missing cancelled booking', opList);
evidence.push(['operator_list', opList.status, opList.data.bookings.length]);

const raceOpen = await findOpenDate(6, 'indoor', '17:00');
const raceSlot = raceOpen.result.data.slots[0];
const raceResults = await Promise.all(Array.from({ length: 5 }, (_, i) => post('/api/demo/hold', { date: raceSlot.date, time: raceSlot.time, partySize: 6, section: 'indoor', idempotencyKey: `race_${Date.now()}_${i}` })));
const raceSuccesses = raceResults.filter(r => r.status === 200 && r.data.ok).length;
assert(raceSuccesses === 1, 'concurrent last-table race should allow exactly one hold', raceResults.map(r => ({ status: r.status, data: r.data })));
evidence.push(['concurrency_last_table', raceSuccesses, raceResults.length]);

if (supabaseUrl && supabaseAnonKey) {
  const direct = await fetch(`${supabaseUrl}/rest/v1/bookings?select=reference&limit=1`, {
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}`, accept: 'application/json', 'accept-profile': 'reservation_demo' }
  });
  assert(direct.status >= 400, 'anon key should not directly read reservation_demo.bookings', direct.status);
  evidence.push(['direct_private_schema_read', direct.status]);
}

console.log(JSON.stringify({ ok: true, base, evidence }, null, 2));
