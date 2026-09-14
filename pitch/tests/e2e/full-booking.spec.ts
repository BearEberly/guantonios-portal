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
  type ResetCounts = { clean: boolean; summary: string };
  async function readCounts(): Promise<ResetCounts> {
    const list = await request.post('/api/demo/operator/list', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
    const listBody = await list.json().catch(() => null) as { ok?: boolean; bookings?: unknown[]; holds?: unknown[]; notifications?: unknown[]; error?: string } | null;
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
    const counts = {
      bookings: (listBody?.bookings || []).length,
      holds: (listBody?.holds || []).length,
      notifications: (listBody?.notifications || []).length,
      waitlist: (waitlistBody?.waitlist || []).length,
      profiles: (guestsBody?.profiles || []).length,
      blocks: (floorBody?.tableBlocks || []).length,
      pacing: (pacingBody?.pacingRules || []).length,
      notify: (notifyBody?.notifyRequests || []).length
    };
    const ok = Boolean(listBody?.ok && waitlistBody?.ok && guestsBody?.ok && floorBody?.ok && pacingBody?.ok && notifyBody?.ok);
    const clean = ok && Object.values(counts).every(count => count === 0);
    return { clean, summary: Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(' ') };
  }

  let lastError = '';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const reset = await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
    const resetBody = await reset.json().catch(() => null) as { ok?: boolean; reset?: boolean; error?: string } | null;
    if (!reset.ok() || !resetBody?.ok || !resetBody?.reset) {
      lastError = `reset failed with ${reset.status()} ${resetBody?.error || ''}`;
      await new Promise(resolve => setTimeout(resolve, 260));
      continue;
    }
    const first = await readCounts();
    if (first.clean) {
      await new Promise(resolve => setTimeout(resolve, 260));
      const second = await readCounts();
      if (second.clean) return;
      lastError = `reset verification was not stable: ${second.summary}`;
    } else {
      lastError = `reset verification failed: ${first.summary}`;
    }
    await new Promise(resolve => setTimeout(resolve, 260));
  }
  throw new Error(lastError || 'reset failed');
}

async function selectReservationRow(page: Page, reference: string) {
  const row = reservationRow(page, reference);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: new RegExp(`Select .* ${reference}`) }).click();
  return row;
}

type OperatorBookingFixture = { reference: string; startsAt: string; endsAt: string; status?: string };

async function operatorBookingForReference(request: APIRequestContext, reference: string) {
  let lastStatus = 0;
  let lastError = '';
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const list = await request.post('/api/demo/operator/list', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
    const body = await list.json().catch(() => null) as { ok?: boolean; bookings?: OperatorBookingFixture[]; error?: string } | null;
    lastStatus = list.status();
    lastError = body?.error || '';
    expect(list.ok(), `operator list failed with ${lastStatus} ${lastError}`).toBeTruthy();
    const booking = (body?.bookings || []).find(item => item.reference === reference);
    if (booking) return booking;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`operator list did not include ${reference} after retries; last status ${lastStatus} ${lastError}`);
}

async function serviceDateForReference(request: APIRequestContext, reference: string) {
  const booking = await operatorBookingForReference(request, reference);
  return serviceDateFromTimestamp(booking.startsAt);
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
  let lastStatus = 0;
  let lastError = '';
  const retryableErrors = ['demo_backend_error', 'demo_reset_error', 'deadlock', 'timeout', 'not_found'];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post(path, {
      headers: token ? { 'x-demo-operator-token': token } : undefined,
      data
    });
    const body = await response.json().catch(() => null) as T & { ok?: boolean; error?: string } | null;
    lastStatus = response.status();
    lastError = body?.error || '';
    if (response.ok() && body?.ok) return body as T & { ok: boolean };
    const retryable = retryableErrors.some(error => lastError.toLowerCase().includes(error));
    if (!retryable || attempt === 4) {
      expect(response.ok(), `${path} failed with ${lastStatus} ${lastError}`).toBeTruthy();
      expect(body?.ok, `${path} did not return ok`).toBeTruthy();
      return body as T & { ok: boolean };
    }
    await new Promise(resolve => setTimeout(resolve, 220 * (attempt + 1)));
  }
  throw new Error(`${path} failed after retries with ${lastStatus} ${lastError}`);
}

async function findOpenDemoSlot(request: APIRequestContext, partySize = 2, section = 'outdoor', time = '19:30') {
  for (let offset = 0; offset < 14; offset += 1) {
    const date = laDate(offset);
    const response = await request.post('/api/demo/search', { data: { date, time, partySize, section } });
    const body = await response.json().catch(() => null) as { available?: boolean; slots?: Array<{ date: string; time: string }> } | null;
    if (response.ok() && body?.available && body.slots?.[0]) return body.slots.find(slot => slot.time === time) || body.slots[0];
  }
  throw new Error(`No open demo slot found for ${partySize} ${section} ${time}`);
}


type ExactSlotRequirement = { partySize: number; section: 'indoor' | 'outdoor'; time: string };

type DemoSlot = { date: string; time: string };

async function exactDemoSlotOnDate(request: APIRequestContext, date: string, requirement: ExactSlotRequirement): Promise<DemoSlot | null> {
  const response = await request.post('/api/demo/search', {
    data: { date, time: requirement.time, partySize: requirement.partySize, section: requirement.section }
  });
  const body = await response.json().catch(() => null) as { available?: boolean; slots?: DemoSlot[] } | null;
  if (!response.ok() || !body?.available) return null;
  return (body.slots || []).find(slot => slot.date === date && slot.time === requirement.time) || null;
}

async function findServiceDateWithExactSlots(request: APIRequestContext, requirements: ExactSlotRequirement[]) {
  for (let offset = 0; offset < 14; offset += 1) {
    const date = laDate(offset);
    const matches = await Promise.all(requirements.map(requirement => exactDemoSlotOnDate(request, date, requirement)));
    if (matches.every(Boolean)) return date;
  }
  throw new Error(`No shared demo service date found for exact slots: ${requirements.map(item => `${item.partySize} ${item.section} ${item.time}`).join(', ')}`);
}

type DemoConfirmBody = {
  ok?: boolean;
  reference?: string;
  manageToken?: string;
  startsAt?: string;
  endsAt?: string;
  reservation?: { reference: string; startsAt?: string; endsAt?: string };
  error?: string;
};

async function confirmDemoHoldOnce(request: APIRequestContext, hold: { holdId: string; holdToken: string }, guestLabel: string) {
  const [firstName, ...rest] = guestLabel.split(' ');
  const response = await request.post('/api/demo/confirm', {
    data: {
      holdId: hold.holdId,
      holdToken: hold.holdToken,
      idempotencyKey: `e2e_confirm_${Date.now()}_${Math.random()}`,
      firstName: firstName || 'Report',
      lastName: rest.join(' ') || 'Guest',
      email: 'demo@example.invalid',
      mobile: '(209) 555-0199',
      request: 'Created by Reports e2e setup.'
    }
  });
  const body = await response.json().catch(() => null) as DemoConfirmBody | null;
  return { response, body };
}

function isRetryableHoldConfirmFailure(body: DemoConfirmBody | null) {
  return body?.error === 'hold_expired_or_unauthorized' || body?.error === 'hold_expired_or_released';
}

async function createConfirmedDemoBookingAtSlot(request: APIRequestContext, input: { date: string; guestLabel: string; partySize?: number; section?: 'indoor' | 'outdoor'; time?: string }) {
  const partySize = input.partySize || 2;
  const section = input.section || 'outdoor';
  const time = input.time || '19:30';
  let lastStatus = 0;
  let lastError = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exactSlot = await exactDemoSlotOnDate(request, input.date, { partySize, section, time });
    if (!exactSlot) throw new Error(`No exact demo slot found on ${input.date} for ${partySize} ${section} ${time}`);
    const hold = await apiPost<{ holdId: string; holdToken: string }>(request, '/api/demo/hold', {
      date: exactSlot.date,
      time: exactSlot.time,
      partySize,
      section,
      idempotencyKey: `e2e_hold_${Date.now()}_${Math.random()}`
    }, undefined);
    const { response, body } = await confirmDemoHoldOnce(request, hold, input.guestLabel);
    lastStatus = response.status();
    lastError = body?.error || '';
    if (response.ok() && body?.ok && body.reference && body.manageToken) {
      const operatorBooking = await operatorBookingForReference(request, body.reference);
      return {
        reference: body.reference,
        manageToken: body.manageToken,
        date: serviceDateFromTimestamp(operatorBooking.startsAt),
        time: exactSlot.time,
        startsAt: operatorBooking.startsAt,
        endsAt: operatorBooking.endsAt
      };
    }
    if (!isRetryableHoldConfirmFailure(body) || attempt === 4) {
      expect(response.ok(), `/api/demo/confirm failed with ${lastStatus} ${lastError}`).toBeTruthy();
      expect(body?.ok, '/api/demo/confirm did not return ok').toBeTruthy();
    }
    await new Promise(resolve => setTimeout(resolve, 260 * (attempt + 1)));
  }
  throw new Error(`/api/demo/confirm failed after fresh hold retries with ${lastStatus} ${lastError}`);
}

async function createConfirmedDemoBooking(request: APIRequestContext, input: { guestLabel: string; partySize?: number; section?: 'indoor' | 'outdoor'; time?: string }) {
  const partySize = input.partySize || 2;
  const section = input.section || 'outdoor';
  const time = input.time || '19:30';
  let lastStatus = 0;
  let lastError = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slot = await findOpenDemoSlot(request, partySize, section, time);
    const hold = await apiPost<{ holdId: string; holdToken: string }>(request, '/api/demo/hold', {
      date: slot.date,
      time: slot.time,
      partySize,
      section,
      idempotencyKey: `e2e_hold_${Date.now()}_${Math.random()}`
    }, undefined);
    const { response, body } = await confirmDemoHoldOnce(request, hold, input.guestLabel);
    lastStatus = response.status();
    lastError = body?.error || '';
    if (response.ok() && body?.ok && body.reference && body.manageToken) {
      const operatorBooking = await operatorBookingForReference(request, body.reference);
      const startsAt = operatorBooking.startsAt;
      const endsAt = operatorBooking.endsAt;
      return {
        reference: body.reference,
        manageToken: body.manageToken,
        date: serviceDateFromTimestamp(startsAt),
        time: slot.time,
        startsAt,
        endsAt
      };
    }
    if (!isRetryableHoldConfirmFailure(body) || attempt === 4) {
      expect(response.ok(), `/api/demo/confirm failed with ${lastStatus} ${lastError}`).toBeTruthy();
      expect(body?.ok, '/api/demo/confirm did not return ok').toBeTruthy();
    }
    await new Promise(resolve => setTimeout(resolve, 260 * (attempt + 1)));
  }
  throw new Error(`/api/demo/confirm failed after fresh hold retries with ${lastStatus} ${lastError}`);
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
  const bookThisTime = openSlot.getByRole('button', { name: /Book this time/i });
  await expect(bookThisTime).toBeEnabled();
  await bookThisTime.click();

  await expect(page.getByLabel('Book from operator iPad')).toBeVisible();
  await expect(page.getByText(/Ready to book 2 guests .* from live availability/i)).toBeVisible();
  const bookingResults = page.getByLabel('Operator booking availability');
  await expect(bookingResults.getByRole('button', { name: /Book (Indoor|Patio)/i }).first()).toBeVisible();
  await page.getByLabel('Operator guest name').fill('Availability Handoff Guest');
  await bookingResults.getByRole('button', { name: /Book (Indoor|Patio)/i }).first().click();

  await expect(page.getByText(/Booked DEMO-/)).toBeVisible();
  await expect(page.locator('.operator-row').filter({ hasText: 'Availability Handoff Guest' })).toBeVisible();
});

test('operator can triage arrivals from the iPad queue', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const stamp = Date.now();
  const serviceDate = await findServiceDateWithExactSlots(request, [
    { partySize: 2, section: 'outdoor', time: '19:00' },
    { partySize: 2, section: 'indoor', time: '19:30' },
    { partySize: 2, section: 'outdoor', time: '19:30' }
  ]);
  const late = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `Late Triage ${stamp}`, partySize: 2, section: 'outdoor', time: '19:00' });
  const due = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `Due Triage ${stamp}`, partySize: 2, section: 'indoor', time: '19:30' });
  const here = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `Here Triage ${stamp}`, partySize: 2, section: 'outdoor', time: '19:30' });
  await apiPost(request, '/api/demo/operator/status', { reference: here.reference, status: 'checked_in' });
  await page.clock.setFixedTime(new Date(new Date(late.startsAt).getTime() + 20 * 60 * 1000));

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, late.date);

  const triage = page.getByLabel('Arrival triage filters');
  await expect(triage).toBeVisible();
  await expect(triage.getByRole('button', { name: /Late\s+1/i })).toBeVisible();
  await expect(triage.getByRole('button', { name: /Due now\s+1/i })).toBeVisible();
  await expect(triage.getByRole('button', { name: /Here\s+1/i })).toBeVisible();
  await expect(triage.getByRole('button', { name: /Unseated\s+3/i })).toBeVisible();

  await triage.getByRole('button', { name: /Late\s+1/i }).click();
  await expect(reservationRow(page, late.reference)).toBeVisible();
  await expect(reservationRow(page, due.reference)).toHaveCount(0);
  await expect(reservationRow(page, here.reference)).toHaveCount(0);

  await triage.getByRole('button', { name: /Due now\s+1/i }).click();
  await expect(reservationRow(page, due.reference)).toBeVisible();
  await expect(reservationRow(page, late.reference)).toHaveCount(0);

  await triage.getByRole('button', { name: /Here\s+1/i }).click();
  await expect(reservationRow(page, here.reference)).toBeVisible();
  await expect(reservationRow(page, due.reference)).toHaveCount(0);

  await triage.getByRole('button', { name: /Unseated\s+3/i }).click();
  await expect(reservationRow(page, late.reference)).toBeVisible();
  await expect(reservationRow(page, due.reference)).toBeVisible();
  await expect(reservationRow(page, here.reference)).toBeVisible();
});

test('operator sync panel shows live counts and pending iPad saves', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Sync Panel ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);

  const syncPanel = page.getByLabel('Operator sync status');
  await expect(syncPanel).toBeVisible();
  await expect(syncPanel).toContainText('Live');
  await expect(syncPanel).toContainText(/Synced \d{1,2}:\d{2}:\d{2}/);
  await expect(syncPanel).toContainText(/[1-9]\d* bookings/);
  await expect(reservationRow(page, booking.reference)).toBeVisible();

  await page.route('**/api/demo/operator/status', async route => {
    await new Promise(resolve => setTimeout(resolve, 450));
    await route.continue();
  });

  const row = reservationRow(page, booking.reference);
  await row.getByRole('button', { name: /^Check in$/ }).click();
  await expect(syncPanel).toContainText('Saving');
  await expect(syncPanel).toContainText(`Saving ${booking.reference} as Checked in.`);
  await expect(syncPanel).toContainText('Live', { timeout: 10000 });
  await expect(syncPanel).toContainText(/Synced \d{1,2}:\d{2}:\d{2}/);
  await expect(reservationRow(page, booking.reference)).toContainText('Checked in');
});

test('operator host briefing ranks next iPad actions', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const stamp = Date.now();
  const serviceDate = await findServiceDateWithExactSlots(request, [
    { partySize: 2, section: 'outdoor', time: '17:30' },
    { partySize: 2, section: 'outdoor', time: '19:00' },
    { partySize: 2, section: 'outdoor', time: '19:30' }
  ]);
  const late = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `Late Briefing ${stamp}`, partySize: 2, section: 'outdoor', time: '19:00' });
  const here = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `Here Briefing ${stamp}`, partySize: 2, section: 'outdoor', time: '19:30' });
  const turn = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `Turn Briefing ${stamp}`, partySize: 2, section: 'outdoor', time: '17:30' });
  await apiPost(request, '/api/demo/operator/status', { reference: here.reference, status: 'checked_in' });
  await apiPost(request, '/api/demo/operator/status', { reference: turn.reference, status: 'seated', tableCode: 'P2' });
  await apiPost(request, '/api/demo/operator/service', { reference: turn.reference, serviceStage: 'paid' });
  await apiPost(request, '/api/demo/operator/pacing', { op: 'set', date: late.date, time: '19:30', maxCovers: 4, reason: 'Host briefing pacing cap.' });
  await page.clock.setFixedTime(new Date(new Date(late.startsAt).getTime() + 20 * 60 * 1000));

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, late.date);

  const briefing = page.getByLabel('Host briefing');
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText('Late arrival needs attention');
  await expect(briefing).toContainText('Late Briefing is late');
  await expect(briefing).toContainText('Seat Here Briefing');
  await expect(briefing).toContainText('Ready to turn at P2');
  await expect(briefing).toContainText('7:30 pacing cap');

  await briefing.getByRole('button', { name: /Seat now: Seat Here Briefing/i }).click();
  await expect(page.getByText(new RegExp(`Moving ${escapeRegex(here.reference)}`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText('Here Briefing');

  await briefing.getByRole('button', { name: /Review late: Late Briefing is late/i }).click();
  await expect(reservationRow(page, late.reference)).toBeVisible();
  await expect(reservationRow(page, here.reference)).toHaveCount(0);
  await expect(page.locator('.selected-party-panel')).toContainText('Late Briefing');
});

test('operator can start a booking from an open Timeline table cell', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();

  const timeline = page.getByLabel('Table lane reservation book');
  await expect(timeline).toBeVisible();
  await page.getByRole('button', { name: /^Book table 12 at 5:00$/i }).click();

  await expect(page.getByLabel('Book from operator iPad')).toBeVisible();
  await expect(page.getByLabel('Operator booking source')).toContainText('Timeline · table 12 · 5:00');
  await expect(page.getByText(/Ready to book 2 guests at 5:00 from table 12/i)).toBeVisible();
  const bookingResults = page.getByLabel('Operator booking availability');
  await expect(bookingResults.getByRole('button', { name: /Book Indoor at 5:00/i }).first()).toBeVisible();

  await page.getByLabel('Operator guest name').fill('Timeline Cell Guest');
  await bookingResults.getByRole('button', { name: /Book Indoor at 5:00/i }).first().click();
  const bookedMessage = page.getByText(/Booked DEMO-/).last();
  await expect(bookedMessage).toBeVisible();
  const statusText = await bookedMessage.innerText();
  const reference = statusText.match(/Booked (DEMO-[A-Z0-9]+)/)?.[1];
  expect(reference).toBeTruthy();
  await expect(page.locator('.operator-row').filter({ hasText: 'Timeline Cell Guest' })).toBeVisible();

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  const table12Row = page.locator('.timeline-table-row').filter({ has: page.getByRole('button', { name: /Timeline table 12/i }) });
  await expect(table12Row.locator('.timeline-reservation-card').filter({ hasText: reference! })).toBeVisible();
  await expect(table12Row.locator('.timeline-reservation-card').filter({ hasText: 'Timeline Cell Guest' })).toBeVisible();
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
  const selectedRow = await selectReservationRow(page, reference);
  await expect(selectedRow).toContainText(/Due now|Early|Late/);
  const patioTable = page.getByRole('button', { name: /Table P2, 2 seats/i });
  await expect(patioTable).toBeVisible();
  await patioTable.click();

  await expect(page.getByText(new RegExp(`Seated ${reference} at table P2`))).toBeVisible();
  const selectedParty = page.locator('.selected-party-panel');
  await expect(selectedParty).toContainText(/2 guests · outdoor · table P2/i);
  await expect(selectedParty).toContainText('Seated');
});




test('operator arrival timing follows the service clock instead of the floor snapshot time', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Late Arrival ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });
  await page.clock.setFixedTime(new Date(new Date(booking.startsAt).getTime() + 12 * 60 * 1000));

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  const row = await selectReservationRow(page, booking.reference);
  await expect(row).toContainText('Late');
  await expect(row).toContainText('12 min late');
  await expect(page.locator('.selected-party-panel')).toContainText('Late');
  await page.getByLabel('Floor snapshot time').selectOption('17:00');
  await expect(row).toContainText('Late');
  await expect(row).toContainText('12 min late');
  await page.getByLabel('Floor snapshot time').selectOption('20:30');
  await expect(row).toContainText('Late');
  await expect(row).toContainText('12 min late');
  await page.getByLabel('Operator sections').getByRole('button', { name: /^Reports$/i }).click();
  await expect(page.getByLabel('Arrival timing report')).toContainText('Late');
});

test('operator can run the selected-party host command tray on iPad', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Command Guest ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });
  await page.clock.setFixedTime(new Date(booking.startsAt));

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  await selectReservationRow(page, booking.reference);

  const selectedParty = page.locator('.selected-party-panel');
  const command = page.getByLabel('Host command center');
  await expect(command).toBeVisible();
  await expect(command).toContainText('Next: check in');
  await command.getByRole('button', { name: /^Check in$/ }).first().click();

  await expect(page.getByText(new RegExp(`Updated ${escapeRegex(booking.reference)} to Checked in`))).toBeVisible();
  await expect(selectedParty).toContainText('Here');
  await expect(command).toContainText('Next: seat from floor');
  await command.getByRole('button', { name: /^Seat from floor$/ }).click();
  await expect(page.getByText(new RegExp(`Moving ${escapeRegex(booking.reference)}`))).toBeVisible();
  await page.getByRole('button', { name: /Table P2, 2 seats/i }).click();

  await expect(page.getByText(new RegExp(`Seated ${escapeRegex(booking.reference)} at table P2`))).toBeVisible();
  await expect(selectedParty).toContainText(/table P2/i);
  await expect(command).toContainText('Next: Ordered');
  await command.getByRole('button', { name: /^Mark Ordered$/ }).click();

  await expect(page.getByText(new RegExp(`Updated ${escapeRegex(booking.reference)} service stage to Ordered`))).toBeVisible();
  await expect(command).toContainText('Next: Fired');
  await command.getByRole('button', { name: /^Finish$/ }).click();

  const finishDialog = page.getByRole('dialog', { name: /Finish and close this table/i });
  await expect(finishDialog).toBeVisible();
  await expect(finishDialog).toContainText(booking.reference);
  await expect(finishDialog).toContainText('moves the party to Done');
  await finishDialog.getByRole('button', { name: /Confirm finish/i }).click();

  await expect(page.getByText(new RegExp(`Updated ${escapeRegex(booking.reference)} to Completed`))).toBeVisible();
  await expect(selectedParty).toContainText('Completed');
  await expect(command.getByRole('button', { name: /^Completed$/ })).toBeDisabled();
});

test('operator confirmation sheet protects selected-party cancellation on iPad', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Confirm Cancel ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  await selectReservationRow(page, booking.reference);

  const selectedParty = page.locator('.selected-party-panel');
  const command = page.getByLabel('Host command center');
  await command.getByRole('button', { name: /^Cancel$/ }).click();

  const cancelDialog = page.getByRole('dialog', { name: /Cancel this reservation/i });
  await expect(cancelDialog).toBeVisible();
  await expect(cancelDialog).toContainText(booking.reference);
  await expect(cancelDialog).toContainText('Moves this party out of live service');
  await expect(cancelDialog).toContainText('No fee, refund, or SMS');
  await cancelDialog.getByRole('button', { name: /Keep reservation/i }).click();

  await expect(cancelDialog).toBeHidden();
  await expect(selectedParty).toContainText('Confirmed');
  await command.getByRole('button', { name: /^Cancel$/ }).click();
  const secondCancelDialog = page.getByRole('dialog', { name: /Cancel this reservation/i });
  await secondCancelDialog.getByRole('button', { name: /Confirm cancel/i }).click();

  await expect(page.getByText(new RegExp(`Updated ${escapeRegex(booking.reference)} to Cancelled`))).toBeVisible();
  await expect(selectedParty).toContainText('Cancelled');
  await expect(command.getByRole('button', { name: /^Cancelled$/ })).toBeDisabled();
});

test('operator confirmation sheet tracks no-shows separately from cancellations on iPad', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const serviceDate = await findServiceDateWithExactSlots(request, [
    { partySize: 2, section: 'indoor', time: '18:00' },
    { partySize: 2, section: 'outdoor', time: '19:30' }
  ]);
  const cancelBooking = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `Cancel Bucket ${Date.now()}`, partySize: 2, section: 'indoor', time: '18:00' });
  await apiPost(request, '/api/demo/cancel', { reference: cancelBooking.reference, manageToken: cancelBooking.manageToken }, undefined);
  const noShowBooking = await createConfirmedDemoBookingAtSlot(request, { date: serviceDate, guestLabel: `No Show Bucket ${Date.now()}`, partySize: 2, section: 'outdoor', time: '19:30' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, noShowBooking.date);
  await page.getByLabel('Reservation queues').getByRole('button', { name: /^All/i }).click();
  await selectReservationRow(page, noShowBooking.reference);
  const command = page.getByLabel('Host command center');
  await command.getByRole('button', { name: /^No-show$/ }).click();

  const noShowDialog = page.getByRole('dialog', { name: /Mark this party no-show/i });
  await expect(noShowDialog).toBeVisible();
  await expect(noShowDialog).toContainText(noShowBooking.reference);
  await expect(noShowDialog).toContainText('keeps it separate from ordinary cancellations');
  await expect(noShowDialog).toContainText('No fee, refund, or SMS');
  await noShowDialog.getByRole('button', { name: /Confirm no-show/i }).click();

  await expect(page.getByText(new RegExp(`Updated ${escapeRegex(noShowBooking.reference)} to No-show`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText('No-show');
  const disabledNoShowActions = command.getByRole('button', { name: /^No-show$/ });
  await expect(disabledNoShowActions).toHaveCount(2);
  await expect(disabledNoShowActions.nth(0)).toBeDisabled();
  await expect(disabledNoShowActions.nth(1)).toBeDisabled();

  const noShowFilter = page.getByLabel('Reservation queues').getByRole('button', { name: /No-show\s+1/i });
  await expect(noShowFilter).toBeVisible();
  await noShowFilter.click();
  await expect(reservationRow(page, noShowBooking.reference)).toBeVisible();

  const cancelledFilter = page.getByLabel('Reservation queues').getByRole('button', { name: /Cancelled\s+1/i });
  await expect(cancelledFilter).toBeVisible();
  await cancelledFilter.click();
  await expect(reservationRow(page, cancelBooking.reference)).toBeVisible();

  await page.getByLabel('Operator sections').getByRole('button', { name: /^Reports$/i }).click();
  await expect(page.getByLabel('Daily cover report')).toContainText('Cancelled');
  await expect(page.getByLabel('Daily cover report')).toContainText('No-show');
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
  await expect(tableP2.locator('em')).toContainText('Seated');
  await expect(tableP2.locator('em')).toContainText('Entrees');
  const selectedParty = page.locator('.selected-party-panel');
  await expect(selectedParty).toContainText('Arrival timing');
  await expect(selectedParty).toContainText('Seated');

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.getByLabel('Reservation timeline board')).toContainText('Seated');
  await expect(page.getByLabel('Reservation timeline board')).toContainText('Entrees');
  await page.getByLabel('Operator sections').getByRole('button', { name: /^Reports$/i }).click();
  await expect(page.getByLabel('Arrival timing report')).toContainText('Seated');
  await expect(page.getByLabel('Service-stage report')).toContainText('Entrees');
  await expect(page.getByLabel('Table turns report')).toContainText('Entrees');
});

test('operator selected party activity timeline summarizes host history on iPad', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const stamp = Date.now();
  const booking = await createConfirmedDemoBooking(request, { guestLabel: `Activity Guest ${stamp}`, partySize: 2, section: 'indoor', time: '19:30' });
  await apiPost(request, '/api/demo/operator/status', { reference: booking.reference, status: 'seated', tableCode: '12' });
  await apiPost(request, '/api/demo/operator/service', { reference: booking.reference, serviceStage: 'ordered' });
  await apiPost(request, '/api/demo/operator/guest', {
    op: 'attach',
    reference: booking.reference,
    guestLabel: `Activity Guest ${stamp}`,
    contact: '(209) 555-0133',
    tags: ['VIP', 'Regular'],
    preferences: ['Window seat', 'Still water'],
    privateNote: 'Likes a slow pace.',
    note: 'Host attached activity profile.'
  });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, booking.date);
  await selectReservationRow(page, booking.reference);

  const selectedParty = page.locator('.selected-party-panel');
  const serviceControls = selectedParty.getByLabel('Manual service stage controls');
  await expect(serviceControls).toBeVisible();
  await expect(serviceControls.getByRole('button', { name: /^Fired$/ })).toBeVisible();

  const activity = selectedParty.getByLabel('Selected party activity timeline');
  await expect(activity).toBeVisible();
  await expect(activity).toContainText('Activity timeline');
  await expect(activity.locator('.selected-activity-head')).toContainText('Ordered');
  await expect(activity).toContainText('Reservation created');
  await expect(activity).toContainText(booking.reference);
  await expect(activity).toContainText('Arrival');
  await expect(activity).toContainText('Table 12');
  await expect(activity).toContainText('Andrea');
  await expect(activity).toContainText('Guest record');
  await expect(activity).toContainText('VIP');
  await expect(activity).toContainText('Private note');
  await expect(activity).toContainText('Likes a slow pace.');
  await expect(activity).toContainText(/Live|Saving|Needs review/);

  const activityText = await activity.innerText();
  expect(activityText.indexOf('Ordered')).toBeGreaterThanOrEqual(0);
  expect(activityText.indexOf('Ordered')).toBeLessThan(activityText.indexOf('Reservation created'));
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
  await page.getByRole('button', { name: /Table P1, 2 seats at 7:30, .*open, block this table/i }).click();

  await expect(page.getByText(/Blocked table P1 from 7:30 to 8:00: Manager hold for repair/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Table P1, 2 seats at 7:30, .*blocked .*Manager hold for repair/i })).toBeVisible();
  await expect(page.getByLabel('Table blocks')).toContainText('Table P1');
  await expect(page.getByLabel('Table blocks')).toContainText(/7:30 PM to 8:00 PM/i);
  await expect(page.getByLabel('Table blocks')).toContainText('Manager hold for repair.');

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.getByRole('button', { name: /Table P1 blocked from .*Manager hold for repair/i })).toBeVisible();
  await page.getByLabel('Floor snapshot time').selectOption('17:00');
  await page.getByLabel('View controls').getByRole('button', { name: /^Floor$/i }).click();
  await expect(page.getByRole('button', { name: /Table P1, 2 seats at 5:00, .*open/i })).toBeVisible();
  await page.getByLabel('Floor snapshot time').selectOption('19:30');
  await page.getByRole('button', { name: /Table P1, 2 seats at 7:30, .*blocked .*Manager hold for repair/i }).click();
  await expect(page.getByText(/Table P1 is blocked from .*Manager hold for repair/i)).toBeVisible();
  await page.getByRole('button', { name: /Clear block on table P1/i }).click();
  await expect(page.getByText(/Cleared block on table P1/i)).toBeVisible();
  await expect(page.getByLabel('Table blocks')).toContainText('No active table blocks.');
  await expect(page.getByRole('button', { name: /Table P1, 2 seats at 7:30, .*open/i })).toBeVisible();
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

test('operator server rotation tracks table sections on the iPad floor', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await resetDemoData(request);
  const stamp = Date.now();
  const dining = await createConfirmedDemoBooking(request, { guestLabel: `Andrea Section ${stamp}`, partySize: 2, section: 'indoor', time: '19:30' });
  const patio = await createConfirmedDemoBooking(request, { guestLabel: `Sofia Section ${stamp}`, partySize: 4, section: 'outdoor', time: '19:30' });
  const banquette = await createConfirmedDemoBooking(request, { guestLabel: `Marco Section ${stamp}`, partySize: 4, section: 'indoor', time: '20:00' });
  await apiPost(request, '/api/demo/operator/status', { reference: dining.reference, status: 'seated', tableCode: '12' });
  await apiPost(request, '/api/demo/operator/status', { reference: patio.reference, status: 'seated', tableCode: 'P3' });
  await apiPost(request, '/api/demo/operator/status', { reference: banquette.reference, status: 'checked_in', tableCode: '31' });

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await chooseOperatorServiceDate(page, dining.date);

  const rotation = page.getByLabel('Server rotation');
  await expect(rotation).toBeVisible();
  await expect(rotation).toContainText('Server rotation');
  await expect(rotation).toContainText('Suggested next: Nico');
  await expect(rotation).toContainText('Andrea');
  await expect(rotation).toContainText('2');
  await expect(rotation).toContainText('Sofia');
  await expect(rotation).toContainText('4');
  await expect(rotation).toContainText('Marco');
  await expect(rotation).toContainText('1 upcoming');
  await expect(rotation).toContainText('Recent seated: Andrea at table 12');

  await expect(page.getByRole('button', { name: /Table 12, 2 seats .*server Andrea/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Table P3, 4 seats .*server Sofia/i })).toBeVisible();
  await selectReservationRow(page, dining.reference);
  await expect(page.locator('.selected-party-panel')).toContainText('Andrea · Dining window');
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

  const bookedMessage = page.getByText(/Booked DEMO-/).last();
  await expect(bookedMessage).toBeVisible();
  const statusText = await bookedMessage.innerText();
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
