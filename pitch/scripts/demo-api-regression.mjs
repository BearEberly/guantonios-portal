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

const wrongPacing = await post('/api/demo/operator/pacing', { op: 'list' }, 'wrong-token');
assert(wrongPacing.status === 401 && wrongPacing.data.error === 'operator_unauthorized', 'wrong token should reject pacing list', wrongPacing);
const pacingSet = await post('/api/demo/operator/pacing', { op: 'set', date: slot.date, time: slot.time, maxCovers: 1, reason: 'API regression pacing.' }, operatorToken);
assert(pacingSet.status === 200 && pacingSet.data.ok && pacingSet.data.pacingRule?.maxCovers === 1, 'pacing set failed', pacingSet);
const pacingList = await post('/api/demo/operator/pacing', { op: 'list' }, operatorToken);
assert(pacingList.status === 200 && pacingList.data.pacingRules.some(r => r.id === pacingSet.data.pacingRule.id), 'pacing list missing active rule', pacingList);
const cappedSearch = await post('/api/demo/search', { date: slot.date, time: slot.time, partySize: 2, section: 'indoor' });
assert(!(cappedSearch.data.slots || []).some(s => s.date === slot.date && s.time === slot.time && s.exact), 'paced slot should not return exact availability for a 2-top', cappedSearch);
const pacingClear = await post('/api/demo/operator/pacing', { op: 'clear', ruleId: pacingSet.data.pacingRule.id }, operatorToken);
assert(pacingClear.status === 200 && pacingClear.data.ok && pacingClear.data.pacingRule?.status === 'cleared', 'pacing clear failed', pacingClear);
const restoredSearch = await post('/api/demo/search', { date: slot.date, time: slot.time, partySize: 2, section: 'indoor' });
assert((restoredSearch.data.slots || []).some(s => s.date === slot.date && s.time === slot.time && s.exact), 'cleared pacing should restore exact availability', restoredSearch);
evidence.push(['operator_pacing', pacingSet.status, pacingClear.status, pacingList.data.pacingRules.length]);

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

const wrongServiceStage = await post('/api/demo/operator/service', { reference: confirm.data.reference, serviceStage: 'ordered' }, 'wrong-token');
assert(wrongServiceStage.status === 401 && wrongServiceStage.data.error === 'operator_unauthorized', 'wrong token should reject service stage update', wrongServiceStage);
const missingServiceStage = await post('/api/demo/operator/service', { reference: confirm.data.reference }, operatorToken);
assert(missingServiceStage.status === 409 && missingServiceStage.data.error === 'invalid_service_stage', 'missing service stage should return validation error', missingServiceStage);
const unseatedServiceStage = await post('/api/demo/operator/service', { reference: confirm.data.reference, serviceStage: 'ordered' }, operatorToken);
assert(unseatedServiceStage.status === 409 && unseatedServiceStage.data.error === 'service_stage_unavailable', 'unseated booking should reject service stage update', unseatedServiceStage);
const assignTable = await post('/api/demo/operator/status', { reference: confirm.data.reference, status: 'seated', tableCode: 'P1' }, operatorToken);
assert(assignTable.status === 200 && assignTable.data.ok && assignTable.data.tableCode === 'P1', 'operator table assignment failed', assignTable);
const serviceStage = await post('/api/demo/operator/service', { reference: confirm.data.reference, serviceStage: 'fired' }, operatorToken);
assert(serviceStage.status === 200 && serviceStage.data.ok && serviceStage.data.serviceStage === 'fired', 'operator service stage update failed', serviceStage);
const assignedList = await post('/api/demo/operator/list', {}, operatorToken);
const assignedBooking = assignedList.data.bookings.find(b => b.reference === confirm.data.reference);
assert(assignedBooking?.status === 'seated' && assignedBooking?.tableCode === 'P1' && assignedBooking?.section === 'outdoor', 'operator list missing assigned table', assignedList);
assert(assignedBooking?.serviceStage === 'fired' && assignedBooking?.turnRisk, 'operator list missing service stage state', assignedList);
evidence.push(['operator_assign_table', assignTable.status, assignedBooking.tableCode, assignedBooking.status]);
evidence.push(['operator_service_stage', serviceStage.status, assignedBooking.serviceStage, assignedBooking.turnRisk]);

const guestLoad = await post('/api/demo/operator/guest', { op: 'load', reference: confirm.data.reference }, operatorToken);
assert(guestLoad.status === 200 && guestLoad.data.profile?.id && guestLoad.data.profile.visits.some(v => v.reference === confirm.data.reference), 'guest profile load failed', guestLoad);
const guestUpdate = await post('/api/demo/operator/guest', { op: 'update', profileId: guestLoad.data.profile.id, tags: ['VIP', 'Patio'], preferences: ['Sparkling water'], privateNote: 'Seat near the pizza oven when possible.' }, operatorToken);
assert(guestUpdate.status === 200 && guestUpdate.data.profile.tags.includes('VIP') && guestUpdate.data.profile.preferences.includes('Sparkling water') && guestUpdate.data.profile.privateNote.includes('pizza oven'), 'guest profile update failed', guestUpdate);
evidence.push(['operator_guest_profile', guestUpdate.status, guestUpdate.data.profile.tags.join('|'), guestUpdate.data.profile.visitCount]);

const change = await post('/api/demo/change', { reference: confirm.data.reference, manageToken: confirm.data.manageToken, date: open.date, time: '18:00', partySize: 2, section: 'outdoor' });
assert(change.status === 200 && change.data.reservation.section === 'outdoor', 'change failed', change);
evidence.push(['change', change.status, change.data.reservation.section]);

const cancel = await post('/api/demo/cancel', { reference: confirm.data.reference, manageToken: confirm.data.manageToken });
assert(cancel.status === 200 && cancel.data.reservation.status === 'cancelled', 'cancel failed', cancel);
evidence.push(['cancel', cancel.status, cancel.data.reservation.status]);

const opList = await post('/api/demo/operator/list', {}, operatorToken);
assert(opList.status === 200 && opList.data.bookings.some(b => b.reference === confirm.data.reference && b.status === 'cancelled'), 'operator list missing cancelled booking', opList);
evidence.push(['operator_list', opList.status, opList.data.bookings.length]);

const block = await post('/api/demo/operator/floor', { op: 'block', tableCode: 'P1', date: open.date, reason: 'API regression block.' }, operatorToken);
assert(block.status === 200 && block.data.ok && block.data.tableBlock?.tableCode === 'P1', 'table block failed', block);
const blockList = await post('/api/demo/operator/floor', { op: 'list' }, operatorToken);
assert(blockList.status === 200 && blockList.data.tableBlocks.some(b => b.tableCode === 'P1' && b.reason === 'API regression block.'), 'table block list missing block', blockList);
evidence.push(['operator_table_block', block.status, block.data.tableBlock.tableCode]);

const waitCreate = await post('/api/demo/operator/waitlist', { op: 'create', guestLabel: 'API Walk In', contact: '2095550102', date: open.date, time: '19:30', partySize: 2, section: 'either', quotedWaitMinutes: 20, note: 'API regression waitlist.' }, operatorToken);
assert(waitCreate.status === 200 && waitCreate.data.ok && waitCreate.data.waitlistId, 'waitlist create failed', waitCreate);
const waitNotify = await post('/api/demo/operator/waitlist', { op: 'status', waitlistId: waitCreate.data.waitlistId, status: 'notified' }, operatorToken);
assert(waitNotify.status === 200 && waitNotify.data.entry?.status === 'notified', 'waitlist notify failed', waitNotify);
const blockedSeat = await post('/api/demo/operator/waitlist', { op: 'seat', waitlistId: waitCreate.data.waitlistId, tableCode: 'P1' }, operatorToken);
assert(blockedSeat.status === 409 && blockedSeat.data.error === 'table_unavailable', 'blocked table should reject waitlist seating', blockedSeat);
const clearBlock = await post('/api/demo/operator/floor', { op: 'clear', blockId: block.data.tableBlock.id }, operatorToken);
assert(clearBlock.status === 200 && clearBlock.data.ok, 'clear table block failed', clearBlock);
const waitSeat = await post('/api/demo/operator/waitlist', { op: 'seat', waitlistId: waitCreate.data.waitlistId, tableCode: 'P1' }, operatorToken);
assert(waitSeat.status === 200 && waitSeat.data.ok && waitSeat.data.reference && waitSeat.data.tableCode === 'P1', 'waitlist seat failed after clearing block', waitSeat);
const waitList = await post('/api/demo/operator/waitlist', { op: 'list' }, operatorToken);
assert(waitList.status === 200 && waitList.data.waitlist.some(w => w.id === waitCreate.data.waitlistId && w.status === 'seated'), 'waitlist list missing seated entry', waitList);
evidence.push(['operator_waitlist_seat', waitSeat.status, waitSeat.data.tableCode, waitSeat.data.reference]);

const comboFloor = await post('/api/demo/operator/floor', { op: 'list' }, operatorToken);
assert(comboFloor.status === 200 && comboFloor.data.tableCombinations.some(c => c.code === 'P3+P4'), 'operator floor missing table combinations', comboFloor);
const comboWait = await post('/api/demo/operator/waitlist', { op: 'create', guestLabel: 'API Combo Eight', contact: '2095550108', date: open.date, time: '19:30', partySize: 8, section: 'outdoor', quotedWaitMinutes: 30, note: 'API combination waitlist.' }, operatorToken);
assert(comboWait.status === 200 && comboWait.data.ok && comboWait.data.waitlistId, 'combo waitlist create failed', comboWait);
const comboSeat = await post('/api/demo/operator/waitlist', { op: 'seat', waitlistId: comboWait.data.waitlistId, tableCode: 'P3+P4' }, operatorToken);
assert(comboSeat.status === 200 && comboSeat.data.ok && comboSeat.data.reference && comboSeat.data.tableCode === 'P3+P4' && comboSeat.data.tableCodes?.length === 2, 'combo waitlist seat failed', comboSeat);
const comboList = await post('/api/demo/operator/list', {}, operatorToken);
const comboBooking = comboList.data.bookings.find(b => b.reference === comboSeat.data.reference);
assert(comboBooking?.tableCode === 'P3+P4' && comboBooking?.tableCodes?.includes('P3') && comboBooking?.tableCodes?.includes('P4'), 'operator list missing combined table assignment', comboList);
evidence.push(['operator_table_combination', comboSeat.status, comboBooking.tableCode, comboBooking.tableCodes.join('+')]);

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
  const directWaitlist = await fetch(`${supabaseUrl}/rest/v1/waitlist_entries?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}`, accept: 'application/json', 'accept-profile': 'reservation_demo' }
  });
  assert(directWaitlist.status >= 400, 'anon key should not directly read reservation_demo.waitlist_entries', directWaitlist.status);
  const directGuests = await fetch(`${supabaseUrl}/rest/v1/guest_profiles?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}`, accept: 'application/json', 'accept-profile': 'reservation_demo' }
  });
  assert(directGuests.status >= 400, 'anon key should not directly read reservation_demo.guest_profiles', directGuests.status);
  const directBlocks = await fetch(`${supabaseUrl}/rest/v1/table_blocks?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}`, accept: 'application/json', 'accept-profile': 'reservation_demo' }
  });
  assert(directBlocks.status >= 400, 'anon key should not directly read reservation_demo.table_blocks', directBlocks.status);
  const directCombos = await fetch(`${supabaseUrl}/rest/v1/table_combinations?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}`, accept: 'application/json', 'accept-profile': 'reservation_demo' }
  });
  assert(directCombos.status >= 400, 'anon key should not directly read reservation_demo.table_combinations', directCombos.status);
  const directPacing = await fetch(`${supabaseUrl}/rest/v1/pacing_rules?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}`, accept: 'application/json', 'accept-profile': 'reservation_demo' }
  });
  assert(directPacing.status >= 400, 'anon key should not directly read reservation_demo.pacing_rules', directPacing.status);
  evidence.push(['direct_private_schema_read', direct.status, directWaitlist.status, directGuests.status, directBlocks.status, directCombos.status, directPacing.status]);
}

console.log(JSON.stringify({ ok: true, base, evidence }, null, 2));
