import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const operatorToken = process.env.DEMO_OPERATOR_TOKEN;

function reservationRow(page: Page, reference: string) {
  return page.locator('.operator-row').filter({ hasText: reference }).first();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serviceDateFromTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}


async function resetDemoData(request: APIRequestContext) {
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reset = await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
    const resetBody = await reset.json().catch(() => null) as { ok?: boolean; reset?: boolean; error?: string } | null;
    if (!reset.ok() || !resetBody?.ok || !resetBody?.reset) {
      lastError = `reset failed with ${reset.status()} ${resetBody?.error || ''}`;
      continue;
    }
    const list = await request.post('/api/demo/operator/list', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
    const listBody = await list.json().catch(() => null) as { ok?: boolean; bookings?: unknown[]; holds?: unknown[]; error?: string } | null;
    const waitlist = await request.post('/api/demo/operator/waitlist', { headers: { 'x-demo-operator-token': operatorToken! }, data: { op: 'list' } });
    const waitlistBody = await waitlist.json().catch(() => null) as { ok?: boolean; waitlist?: unknown[]; error?: string } | null;
    const guests = await request.post('/api/demo/operator/guest', { headers: { 'x-demo-operator-token': operatorToken! }, data: { op: 'list' } });
    const guestsBody = await guests.json().catch(() => null) as { ok?: boolean; profiles?: unknown[]; error?: string } | null;
    const floor = await request.post('/api/demo/operator/floor', { headers: { 'x-demo-operator-token': operatorToken! }, data: { op: 'list' } });
    const floorBody = await floor.json().catch(() => null) as { ok?: boolean; tableBlocks?: unknown[]; error?: string } | null;
    const pacing = await request.post('/api/demo/operator/pacing', { headers: { 'x-demo-operator-token': operatorToken! }, data: { op: 'list' } });
    const pacingBody = await pacing.json().catch(() => null) as { ok?: boolean; pacingRules?: unknown[]; error?: string } | null;
    const notify = await request.post('/api/demo/operator/notify', { headers: { 'x-demo-operator-token': operatorToken! }, data: { op: 'list' } });
    const notifyBody = await notify.json().catch(() => null) as { ok?: boolean; notifyRequests?: unknown[]; error?: string } | null;
    if (listBody?.ok && waitlistBody?.ok && guestsBody?.ok && floorBody?.ok && pacingBody?.ok && notifyBody?.ok && (listBody.bookings || []).length === 0 && (waitlistBody.waitlist || []).length === 0 && (guestsBody.profiles || []).length === 0 && (floorBody.tableBlocks || []).length === 0 && (pacingBody.pacingRules || []).length === 0 && (notifyBody.notifyRequests || []).length === 0) return;
    lastError = `reset verification failed with bookings=${(listBody?.bookings || []).length} waitlist=${(waitlistBody?.waitlist || []).length} profiles=${(guestsBody?.profiles || []).length} blocks=${(floorBody?.tableBlocks || []).length} pacing=${(pacingBody?.pacingRules || []).length} notify=${(notifyBody?.notifyRequests || []).length}`;
  }
  throw new Error(lastError || 'reset failed');
}

async function selectReservationRow(page: Page, reference: string) {
  const row = reservationRow(page, reference);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: new RegExp(`Select .* ${reference}`) }).click();
  return row;
}

async function serviceDateForReference(request: APIRequestContext, reference: string) {
  let lastStatus = 0;
  let lastError = '';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const list = await request.post('/api/demo/operator/list', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
    const body = await list.json().catch(() => null) as { ok?: boolean; bookings?: Array<{ reference: string; startsAt: string }>; error?: string } | null;
    lastStatus = list.status();
    lastError = body?.error || '';
    expect(list.ok(), `operator list failed with ${lastStatus} ${lastError}`).toBeTruthy();
    const booking = (body?.bookings || []).find(item => item.reference === reference);
    if (booking) return serviceDateFromTimestamp(booking.startsAt);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  throw new Error(`operator list did not include ${reference} after retries; last status ${lastStatus} ${lastError}`);
}

async function chooseOperatorServiceDate(page: Page, date: string) {
  const field = page.getByLabel('Choose service date');
  await field.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, date);
  await expect(field).toHaveValue(date);
}

function laDate(offsetDays: number) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(Date.now() + offsetDays * 86400000));
}

async function apiPost<T = any>(request: APIRequestContext, path: string, data: unknown, token = operatorToken) {
  const response = await request.post(path, {
    headers: token ? { 'x-demo-operator-token': token } : undefined,
    data
  });
  const body = await response.json().catch(() => null) as T & { ok?: boolean; error?: string } | null;
  expect(response.ok(), `${path} failed with ${response.status()} ${body?.error || ''}`).toBeTruthy();
  expect(body?.ok, `${path} did not return ok`).toBeTruthy();
  return body as T & { ok: boolean };
}

async function findOpenDemoSlot(request: APIRequestContext, partySize = 2, section = 'outdoor', time = '19:30') {
  for (let offset = 0; offset < 14; offset += 1) {
    const date = laDate(offset);
    const response = await request.post('/api/demo/search', { data: { date, time, partySize, section } });
    const body = await response.json().catch(() => null) as { available?: boolean; slots?: Array<{ date: string; time: string }> } | null;
    if (response.ok() && body?.available && body.slots?.[0]) return body.slots[0];
  }
  throw new Error(`No open demo slot found for ${partySize} ${section} ${time}`);
}

async function createConfirmedDemoBooking(request: APIRequestContext, input: { guestLabel: string; partySize?: number; section?: 'indoor' | 'outdoor'; time?: string }) {
  const partySize = input.partySize || 2;
  const section = input.section || 'outdoor';
  const time = input.time || '19:30';
  const slot = await findOpenDemoSlot(request, partySize, section, time);
  const hold = await apiPost<{ holdId: string; holdToken: string }>(request, '/api/demo/hold', {
    date: slot.date,
    time: slot.time,
    partySize,
    section,
    idempotencyKey: `e2e_hold_${Date.now()}_${Math.random()}`
  }, undefined);
  const [firstName, ...rest] = input.guestLabel.split(' ');
  const confirm = await apiPost<{ reference: string; manageToken: string; reservation: { reference: string } }>(request, '/api/demo/confirm', {
    holdId: hold.holdId,
    holdToken: hold.holdToken,
    idempotencyKey: `e2e_confirm_${Date.now()}_${Math.random()}`,
    firstName: firstName || 'Report',
    lastName: rest.join(' ') || 'Guest',
    email: 'demo@example.invalid',
    mobile: '(209) 555-0199',
    request: 'Created by Reports e2e setup.'
  }, undefined);
  return { reference: confirm.reference, date: slot.date, time: slot.time };
}

test('guest can confirm, change, cancel, and operator can see the synthetic booking', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Indoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Indoor$/i }).first().click();
  await expect(page.getByRole('heading', { name: /confirm demo reservation/i })).toBeVisible();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible({ timeout: 15_000 });
  const reference = (await page.locator('.reference').innerText()).trim();
  expect(reference).toMatch(/^DEMO-/);
  const serviceDate = await serviceDateForReference(request, reference);
  await page.getByRole('link', { name: /view or change/i }).click();
  await expect(page.getByRole('heading', { name: /manage demo reservation/i })).toBeVisible();
  await page.getByRole('button', { name: /load reservation/i }).click();
  await expect(page.getByText(/reservation loaded/i)).toBeVisible();
  await page.getByLabel('Seating').selectOption('outdoor');
  await page.getByRole('button', { name: /change demo reservation/i }).click();
  await expect(page.getByText(/changed and capacity reallocated/i)).toBeVisible();
  const manageUrl = page.url();
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, serviceDate);
  await expect(page.getByRole('button', { name: new RegExp(`Select .* ${reference}`) })).toBeVisible();
  await expect(page.getByText(/SMS operations/i)).toBeVisible();
  await page.goto(manageUrl);
  await page.getByRole('button', { name: /load reservation/i }).click();
  await expect(page.getByText(/reservation loaded/i)).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /cancel demo reservation/i }).click();
  await expect(page.getByText(/cancelled and capacity returned/i)).toBeVisible();
});

test('operator Texts rail shows SMS readiness, templates, and preview history', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Texts Guest ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  await selectReservationRow(page, booking.reference);
  await page.getByLabel('Operator sections').getByRole('button', { name: /^Texts$/i }).click();

  const textsPanel = page.getByLabel('Text message command center');
  await expect(textsPanel).toBeVisible();
  await expect(page.getByLabel('SMS readiness status')).toContainText('+1 (209) 709-4194');
  await expect(page.getByLabel('SMS readiness checks')).toContainText('Conversation DB');
  await expect(page.getByLabel('SMS readiness checks')).toContainText('Carrier approval');
  await expect(page.getByLabel('Selected party text templates')).toContainText('Confirm reservation');
  await expect(page.getByLabel('Selected party text templates')).toContainText(booking.reference);
  await expect(page.getByLabel('Notification preview history')).toContainText('confirmation preview');
  await expect(page.getByLabel('Notification preview history')).toContainText(/preview only/i);
});

test('operator Availability board uses live exact inventory for the selected party size', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await createConfirmedDemoBooking(request, { guestLabel: `Availability Guest ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await page.getByLabel('Party size filters').getByRole('button', { name: '7+' }).click();
  await page.getByLabel('View controls').getByRole('button', { name: /^Availability$/i }).click();

  const board = page.getByLabel('Availability by service time');
  await expect(board).toBeVisible();
  await expect(board).toContainText(/live search for 7-tops/i);
  await expect(board).toContainText(/No exact table|Nearby times only/i);
  await expect(board.getByRole('button', { name: /Book this time/i }).first()).toBeDisabled();

  await page.getByLabel('Party size filters').getByRole('button', { name: /^2$/ }).click();
  await expect(board).toContainText(/live search for 2-tops/i);
  const openSlot = board.locator('article').filter({ hasText: /Indoor exact|Patio exact|Indoor \+ Patio exact/i }).first();
  await expect(openSlot).toBeVisible();
  await expect(openSlot.getByRole('button', { name: /Book this time/i })).toBeEnabled();
});

test('operator can pace a service slot and restore exact availability', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const slot = await findOpenDemoSlot(request, 2, 'indoor', '19:30');

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, slot.date);
  const pacingControls = page.getByLabel('Pacing controls');
  await expect(pacingControls).toBeVisible();
  await page.getByLabel('Pacing slot').selectOption(slot.time);
  await page.getByLabel('Pacing max covers').fill('1');
  await page.getByLabel('Pacing note').fill('Kitchen slowdown');
  await page.getByRole('button', { name: /save pacing cap/i }).click();
  await expect(pacingControls).toContainText('7:30 capped at 1');
  await expect(pacingControls).toContainText('Kitchen slowdown');

  const cappedSearch = await request.post('/api/demo/search', { data: { date: slot.date, time: slot.time, partySize: 2, section: 'indoor' } });
  const cappedBody = await cappedSearch.json().catch(() => null) as { slots?: Array<{ date: string; time: string; exact?: boolean }> } | null;
  expect((cappedBody?.slots || []).some(candidate => candidate.date === slot.date && candidate.time === slot.time && candidate.exact)).toBeFalsy();

  await page.getByRole('button', { name: /clear pacing cap/i }).click();
  await expect(pacingControls).toContainText('No cap set for 7:30');
  const restoredSearch = await request.post('/api/demo/search', { data: { date: slot.date, time: slot.time, partySize: 2, section: 'indoor' } });
  const restoredBody = await restoredSearch.json().catch(() => null) as { slots?: Array<{ date: string; time: string; exact?: boolean }> } | null;
  expect((restoredBody?.slots || []).some(candidate => candidate.date === slot.date && candidate.time === slot.time && candidate.exact)).toBeTruthy();
});


test('operator can seat a selected party by tapping an open floor table', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Outdoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Outdoor$/i }).first().click();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible({ timeout: 15_000 });
  const reference = (await page.locator('.reference').innerText()).trim();
  const serviceDate = await serviceDateForReference(request, reference);

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, serviceDate);
  await selectReservationRow(page, reference);
  const patioTable = page.getByRole('button', { name: /Table P2, 2 seats/i });
  await expect(patioTable).toBeVisible();
  await patioTable.click();

  await expect(page.getByText(new RegExp(`Seated ${reference} at table P2`))).toBeVisible();
  const selectedParty = page.locator('.selected-party-panel');
  await expect(selectedParty).toContainText(/2 guests · outdoor · table P2/i);
  await expect(selectedParty).toContainText('Seated');
});



test('operator can edit selected reservation details from the iPad drawer', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Detail Guest ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  await selectReservationRow(page, booking.reference);

  const drawer = page.getByLabel('Reservation detail editor');
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Reservation edit guest name').fill('Edited Resy Guest');
  await drawer.getByLabel('Reservation edit date').fill(booking.date);
  await drawer.getByLabel('Reservation edit time').selectOption('18:00');
  await drawer.getByLabel('Reservation edit party size').selectOption('3');
  await drawer.getByLabel('Reservation edit section').selectOption('indoor');
  await drawer.getByLabel('Reservation edit contact').fill('(209) 555-0144');
  await drawer.getByLabel('Reservation edit note').fill('High chair and corner table if possible.');
  await drawer.getByRole('button', { name: /save details/i }).click();

  await expect(page.getByText(new RegExp(`Updated ${escapeRegex(booking.reference)} details from the iPad drawer`))).toBeVisible();
  const selectedParty = page.locator('.selected-party-panel');
  await expect(selectedParty).toContainText('Edited Resy Guest');
  await expect(selectedParty).toContainText(/6:00.*3 guests.*indoor.*table/i);
  await expect(selectedParty).toContainText('Host note');
  await expect(drawer.getByLabel('Reservation edit note')).toHaveValue('High chair and corner table if possible.');
  const editedRow = reservationRow(page, booking.reference);
  await expect(editedRow).toContainText('Edited Resy Guest');
  await expect(editedRow).toContainText(/6:00/);
  await expect(editedRow).toContainText('Host note');

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.locator('.timeline-reservation-card').filter({ hasText: booking.reference })).toContainText('Edited Resy Guest');

  const list = await request.post('/api/demo/operator/list', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
  const body = await list.json().catch(() => null) as { ok?: boolean; bookings?: Array<{ reference: string; guestLabel?: string; partySize?: number; section?: string; contact?: string; operatorNote?: string }> } | null;
  expect(list.ok()).toBeTruthy();
  const edited = (body?.bookings || []).find(item => item.reference === booking.reference);
  expect(edited).toMatchObject({ guestLabel: 'Edited Resy Guest', partySize: 3, section: 'indoor', contact: '2095550144', operatorNote: 'High chair and corner table if possible.' });
});

test('operator can advance seated service stage and see turn-risk reporting', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Stage Guest ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });
  await apiPost(request, '/api/demo/operator/status', { reference: booking.reference, status: 'seated', tableCode: 'P2' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  await selectReservationRow(page, booking.reference);

  const stageControls = page.getByLabel('Manual service stage controls');
  await expect(stageControls).toBeVisible();
  await expect(stageControls).toContainText('Not started');
  await stageControls.getByRole('button', { name: /^Entrees$/ }).click();
  await expect(page.getByText(new RegExp(`Updated ${escapeRegex(booking.reference)} service stage to Entrees`))).toBeVisible();
  await expect(stageControls.getByRole('button', { name: /^Entrees$/ })).toHaveAttribute('aria-pressed', 'true');
  const patioMap = page.getByLabel('Patio synthetic floor map');
  const tableP2 = patioMap.getByRole('button', { name: /Table P2, 2 seats/i });
  await expect(tableP2).toBeVisible();
  await expect(tableP2).toContainText('Stage Guest');
  await expect(tableP2).toContainText(/P2 · 2 · 7:30/);
  await expect(tableP2.locator('em')).toContainText('Entrees');

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.getByLabel('Reservation timeline board')).toContainText('Entrees');
  await page.getByLabel('Operator sections').getByRole('button', { name: /^Reports$/i }).click();
  await expect(page.getByLabel('Service-stage report')).toContainText('Entrees');
  await expect(page.getByLabel('Table turns report')).toContainText('Entrees');
});

test('operator can drag a reservation to an open floor table', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Mobile uses the tap Move table fallback; drag is verified on desktop and iPad.');
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Outdoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Outdoor$/i }).first().click();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible({ timeout: 15_000 });
  const reference = (await page.locator('.reference').innerText()).trim();
  const serviceDate = await serviceDateForReference(request, reference);

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, serviceDate);
  await expect(page.getByRole('button', { name: new RegExp(`Select .* ${reference}`) })).toBeVisible();
  const dragSource = page.getByRole('button', { name: new RegExp(`Select .* ${reference}`) });
  const patioTable = page.getByRole('button', { name: /Table P2, 2 seats/i });
  await expect(dragSource).toBeVisible();
  await expect(patioTable).toBeVisible();
  await dragSource.dragTo(patioTable);

  await expect(page.getByText(new RegExp(`(Dropped|Seated) ${reference} at table P2`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table P2/i);
});

test('operator can use Move table mode as a touch fallback', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Outdoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Outdoor$/i }).first().click();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible({ timeout: 15_000 });
  const reference = (await page.locator('.reference').innerText()).trim();
  const serviceDate = await serviceDateForReference(request, reference);

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, serviceDate);
  await selectReservationRow(page, reference);
  await page.getByRole('button', { name: /move table/i }).click();
  await expect(page.getByText(/drag this party or tap an open highlighted table/i)).toBeVisible();
  await page.getByRole('button', { name: /Table P2, 2 seats at .*open, drop/i }).click();

  await expect(page.getByText(new RegExp(`Seated ${reference} at table P2`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table P2/i);
});



test('operator can block and clear an open table from the iPad floor', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();

  await expect(page.getByLabel('Floor table controls')).toBeVisible();
  await page.getByLabel('Table block start time').selectOption('19:30');
  await page.getByLabel('Table block end time').selectOption('20:00');
  await page.getByLabel('Table block reason').fill('Manager hold for repair.');
  await page.getByRole('button', { name: /^Block table$/i }).click();
  await expect(page.getByText(/Tap an open table to block it from 7:30 to 8:00 for this dinner service/i)).toBeVisible();
  await page.getByRole('button', { name: /Table P1, 2 seats at 7:30, open, block this table/i }).click();

  await expect(page.getByText(/Blocked table P1 from 7:30 to 8:00: Manager hold for repair/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Table P1, 2 seats at 7:30, blocked .*Manager hold for repair/i })).toBeVisible();
  await expect(page.getByLabel('Table blocks')).toContainText('Table P1');
  await expect(page.getByLabel('Table blocks')).toContainText(/7:30 PM to 8:00 PM/i);
  await expect(page.getByLabel('Table blocks')).toContainText('Manager hold for repair.');

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.getByRole('button', { name: /Table P1 blocked from .*Manager hold for repair/i })).toBeVisible();
  await page.getByLabel('Floor snapshot time').selectOption('17:00');
  await page.getByLabel('View controls').getByRole('button', { name: /^Floor$/i }).click();
  await expect(page.getByRole('button', { name: /Table P1, 2 seats at 5:00, open/i })).toBeVisible();
  await page.getByLabel('Floor snapshot time').selectOption('19:30');
  await page.getByRole('button', { name: /Table P1, 2 seats at 7:30, blocked .*Manager hold for repair/i }).click();
  await expect(page.getByText(/Table P1 is blocked from .*Manager hold for repair/i)).toBeVisible();
  await page.getByRole('button', { name: /Clear block on table P1/i }).click();
  await expect(page.getByText(/Cleared block on table P1/i)).toBeVisible();
  await expect(page.getByLabel('Table blocks')).toContainText('No active table blocks.');
  await expect(page.getByRole('button', { name: /Table P1, 2 seats at 7:30, open/i })).toBeVisible();
});

test('operator can add, notify, and seat a walk-in from the Wait rail', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();

  await page.getByLabel('Operator sections').getByRole('button', { name: /^Wait$/i }).click();
  await expect(page.getByLabel('Add walk-in waitlist party')).toBeVisible();
  const walkName = `Walk In ${Date.now()}`;
  await page.getByLabel('Waitlist guest name').fill(walkName);
  await page.getByLabel('Waitlist requested time').fill('19:30');
  await page.getByLabel('Waitlist party size').selectOption('2');
  await page.getByLabel('Waitlist seating preference').selectOption('either');
  await page.getByLabel('Quoted wait minutes').fill('20');
  await page.getByLabel('Waitlist note').fill('Test walk-in for iPad waitlist.');
  await page.getByRole('button', { name: /add to waitlist/i }).click();

  const waitRow = page.locator('.waitlist-row').filter({ hasText: walkName }).last();
  await expect(page.getByText(new RegExp(`Added ${escapeRegex(walkName)} to the waitlist for 2`, 'i'))).toBeVisible();
  await expect(waitRow).toBeVisible();
  await expect(waitRow).toContainText(/20 min quote/i);
  await waitRow.getByRole('button', { name: /^Notify$/i }).click();
  await expect(waitRow).toContainText(/Notified/i);
  await waitRow.getByRole('button', { name: /seat from floor/i }).click();
  await expect(page.getByText(new RegExp(`Seat ${escapeRegex(walkName)} by tapping an open compatible table`, 'i'))).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`Table P1, 2 seats at .*open, drop ${escapeRegex(walkName)} here`, 'i') }).click();

  await expect(page.getByText(/Seated waitlist party DEMO-[A-Z0-9]+ at table P1/i)).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table/i);
});

test('guest can join Notify from an unavailable time and operator can mark it from the iPad queue', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const slot = await findOpenDemoSlot(request, 2, 'indoor', '19:30');
  await apiPost(request, '/api/demo/operator/pacing', { op: 'set', date: slot.date, time: slot.time, maxCovers: 1, reason: 'Notify e2e cap.' });

  await page.goto('/reservations');
  await page.locator('#availability input[type="date"]').fill(slot.date);
  await page.locator('#availability select').nth(0).selectOption('2');
  await page.locator('#availability select').nth(1).selectOption(slot.time);
  await page.locator('#availability select').nth(2).selectOption('indoor');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('heading', { name: /join the notify list/i })).toBeVisible();

  const notifyName = `Notify Guest ${Date.now()}`;
  await page.getByLabel('Name').fill(notifyName);
  await page.getByLabel('Mobile').fill('(209) 555-0198');
  await page.locator('#notifySmsConsent').check();
  await page.getByRole('button', { name: /add notify request/i }).click();
  await expect(page.getByRole('heading', { name: /notify request added/i })).toBeVisible();
  await expect(page.getByText(/protected iPad operator Notify queue/i)).toBeVisible();

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, slot.date);
  await page.getByRole('button', { name: /^Notify\s+1$/i }).click();
  const notifyRow = page.locator('.notify-row').filter({ hasText: notifyName }).first();
  await expect(notifyRow).toBeVisible();
  await expect(notifyRow).toContainText(/No exact table|Alternates found/i);
  await notifyRow.getByRole('button', { name: /mark notified/i }).click();
  await expect(notifyRow).toContainText(/Notified/i);
});

test('operator can seat an 8 top with a combined patio table setup', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();

  await page.getByLabel('Operator sections').getByRole('button', { name: /^Wait$/i }).click();
  const comboName = `Combo Eight ${Date.now()}`;
  await page.getByLabel('Waitlist guest name').fill(comboName);
  await page.getByLabel('Waitlist requested time').fill('19:30');
  await page.getByLabel('Waitlist party size').selectOption('8');
  await page.getByLabel('Waitlist seating preference').selectOption('outdoor');
  await page.getByLabel('Quoted wait minutes').fill('30');
  await page.getByLabel('Waitlist note').fill('Needs combined patio tables.');
  await page.getByRole('button', { name: /add to waitlist/i }).click();

  const waitRow = page.locator('.waitlist-row').filter({ hasText: comboName }).last();
  await expect(waitRow).toBeVisible();
  await waitRow.getByRole('button', { name: /seat from floor/i }).click();
  await page.getByRole('button', { name: /^Combine tables$/i }).click();
  await expect(page.getByText(/Choose a combination below/i)).toBeVisible();
  await expect(page.getByLabel('Table combinations')).toContainText('P3+P4');
  await page.getByRole('button', { name: /Seat selected party at combined tables P3\+P4/i }).click();

  await expect(page.getByText(/Seated waitlist party DEMO-[A-Z0-9]+ at tables P3\+P4/i)).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/8 guests · outdoor · table P3\+P4/i);
  await expect(page.getByRole('button', { name: /Table P3, 4 seats at .*seated, 8 guests/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Table P4, 4 seats at .*seated, 8 guests/i })).toBeVisible();
});



test('operator reports show live service pacing on the iPad', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const reportName = `Report Party ${Date.now()}`;
  const reportWaitName = `Report Wait ${Date.now()}`;
  const booking = await createConfirmedDemoBooking(request, { guestLabel: reportName, partySize: 2, section: 'outdoor', time: '19:30' });
  await apiPost(request, '/api/demo/operator/status', { reference: booking.reference, status: 'seated', tableCode: 'P1' });
  await apiPost(request, '/api/demo/operator/waitlist', {
    op: 'create',
    guestLabel: reportWaitName,
    contact: '2095550103',
    date: booking.date,
    time: '19:30',
    partySize: 4,
    section: 'indoor',
    quotedWaitMinutes: 35,
    note: 'Reports e2e waitlist party.'
  });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await page.getByLabel('Operator sections').getByRole('button', { name: /^Reports$/i }).click();

  const reportBoard = page.getByLabel('Daily cover report');
  await expect(reportBoard).toBeVisible();
  await expect(reportBoard).toContainText('Live service report');
  await expect(reportBoard).toContainText('Total covers');
  await expect(reportBoard).toContainText('2');
  await expect(page.getByLabel('Cover pacing report')).toContainText('covers');
  await expect(page.getByLabel('Live floor status report')).toContainText('Patio');
  await expect(page.getByLabel('Table turns report')).toContainText(booking.reference);
  await expect(page.getByLabel('Reports summary')).toContainText('Table utilization');
  await expect(page.getByLabel('Report insights')).toContainText('2 covers');
});

test('operator service date controls scope the iPad service context', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const guestName = `Service Date ${Date.now()}`;
  const booking = await createConfirmedDemoBooking(request, { guestLabel: guestName, partySize: 2, section: 'outdoor', time: '19:30' });
  await apiPost(request, '/api/demo/operator/status', { reference: booking.reference, status: 'seated', tableCode: 'P1' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);

  await expect(reservationRow(page, booking.reference)).toBeVisible();
  await expect(page.getByLabel('Service summary').locator('article').filter({ hasText: 'Dine-in covers' })).toContainText('2');
  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.locator('.timeline-reservation-card').filter({ hasText: booking.reference })).toBeVisible();
  await page.getByLabel('View controls').getByRole('button', { name: /^Reports$/i }).click();
  await expect(page.getByLabel('Daily cover report')).toContainText('2');
  await expect(page.getByLabel('Table turns report')).toContainText(booking.reference);

  await page.getByLabel('Date and shift controls').getByRole('button', { name: /Next service/i }).click();
  await expect(page.getByLabel('Service summary').locator('article').filter({ hasText: 'Dine-in covers' })).toContainText('0');
  await expect(page.getByLabel('Daily cover report')).toContainText('0');
  await expect(page.getByLabel('Table turns report')).not.toContainText(booking.reference);
  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.locator('.timeline-reservation-card').filter({ hasText: booking.reference })).toHaveCount(0);

  await page.getByLabel('Date and shift controls').getByRole('button', { name: /Previous service/i }).click();
  await expect(reservationRow(page, booking.reference)).toBeVisible();
});
test('operator can load and update a guestbook profile on the iPad', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: 'Guestbook Tester', partySize: 2, section: 'indoor', time: '19:30' });
  await apiPost(request, '/api/demo/operator/guest', {
    op: 'attach',
    reference: booking.reference,
    guestLabel: 'Guestbook Tester',
    contact: '2095550188',
    tags: ['Guest'],
    preferences: ['Sparkling water preference.'],
    privateNote: 'Demo note, not saved to a real guest profile.'
  });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  await selectReservationRow(page, booking.reference);
  await page.getByRole('button', { name: /Open profile/i }).click();
  const profilePanel = page.locator('.guest-profile-editor');
  await expect(profilePanel).toBeVisible();
  await expect(profilePanel).toContainText('Guestbook Tester');
  await expect(profilePanel).toContainText(booking.reference);
  expect((await page.getByLabel('Guest profile mobile').inputValue()).replace(/\D/g, '')).toBe('2095550188');

  await page.getByLabel('Guest profile tags').fill('VIP, Patio');
  await page.getByLabel('Guest profile preferences').fill('Sparkling water, corner table');
  await page.getByLabel('Guest profile private note').fill('Knows the owner. Keep notes private.');
  await page.getByRole('button', { name: /save profile/i }).click();

  await expect(page.getByText(/Updated Guestbook Tester's guest profile/i)).toBeVisible();
  await expect(page.getByLabel('Guest profile tags')).toHaveValue('VIP, Patio');
  await expect(page.getByLabel('Guest profile preferences')).toHaveValue('Sparkling water, corner table');
  const selectedPartyPanel = page.locator('.selected-party-panel');
  await expect(selectedPartyPanel.getByLabel('Selected party service intelligence')).toContainText('Service plan');
  await expect(selectedPartyPanel.getByLabel('Guest intelligence')).toContainText('Sparkling water, corner table');
  await expect(selectedPartyPanel.getByLabel('Guest intelligence')).toContainText('Knows the owner. Keep notes private.');
  await page.getByLabel('Operator sections').getByRole('button', { name: /^Guests$/i }).click();
  await expect(page.getByLabel('Guestbook profiles')).toContainText('Guestbook Tester');
  await expect(page.getByLabel('Guestbook profiles')).toContainText('VIP');
});

test('operator can create and seat a booking from the iPad Book rail', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();

  await page.getByLabel('Operator sections').getByRole('button', { name: /^Book$/i }).click();
  await expect(page.getByLabel('Book from operator iPad')).toBeVisible();
  await page.getByLabel('Operator guest name').fill('Operator Walk In');
  await page.getByLabel('Operator booking party size').selectOption('2');
  await page.getByLabel('Operator booking seating').selectOption('outdoor');
  await page.getByRole('button', { name: /check availability/i }).click();
  await expect(page.getByLabel('Operator booking availability').getByRole('button', { name: /Book Outdoor/i }).first()).toBeVisible();
  await page.getByLabel('Operator booking availability').getByRole('button', { name: /Book Outdoor/i }).first().click();

  await expect(page.getByText(/Booked DEMO-/)).toBeVisible();
  const statusText = await page.locator('.resyos-live-status').innerText();
  const reference = statusText.match(/Booked (DEMO-[A-Z0-9]+)/)?.[1];
  expect(reference).toBeTruthy();
  await expect(page.locator('.operator-row').filter({ hasText: reference! })).toBeVisible();

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.getByLabel('Table lane reservation book')).toBeVisible();
  await expect(page.locator('.timeline-reservation-card').filter({ hasText: reference! })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`Seat ${reference} at table P2 from 5:00`) }).click();

  await expect(page.getByText(new RegExp(`Seated ${reference} at table P2`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table P2/i);
});
