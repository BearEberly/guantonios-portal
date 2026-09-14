import { test, expect } from '@playwright/test';

const operatorToken = process.env.DEMO_OPERATOR_TOKEN;

test('guest can confirm, change, cancel, and operator can see the synthetic booking', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Indoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Indoor$/i }).first().click();
  await expect(page.getByRole('heading', { name: /confirm demo reservation/i })).toBeVisible();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible();
  const reference = (await page.locator('.reference').innerText()).trim();
  expect(reference).toMatch(/^DEMO-/);
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
  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText(/disabled notification adapter/i)).toBeVisible();
  await page.goto(manageUrl);
  await page.getByRole('button', { name: /load reservation/i }).click();
  await expect(page.getByText(/reservation loaded/i)).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /cancel demo reservation/i }).click();
  await expect(page.getByText(/cancelled and capacity returned/i)).toBeVisible();
});

test('operator can seat a selected party by tapping an open floor table', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Indoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Indoor$/i }).first().click();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible();
  const reference = (await page.locator('.reference').innerText()).trim();

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await expect(page.getByText(reference)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`Select .* ${reference}`) }).click();
  const patioTable = page.getByRole('button', { name: /Table P1, 2 seats/i });
  await expect(patioTable).toBeVisible();
  await patioTable.click();

  await expect(page.getByText(new RegExp(`Seated ${reference} at table P1`))).toBeVisible();
  const selectedParty = page.locator('.selected-party-panel');
  await expect(selectedParty).toContainText(/2 guests · outdoor · table P1/i);
  await expect(selectedParty).toContainText('Seated');
});

test('operator can drag a reservation to an open floor table', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Mobile uses the tap Move table fallback; drag is verified on desktop and iPad.');
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Indoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Indoor$/i }).first().click();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible();
  const reference = (await page.locator('.reference').innerText()).trim();

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await expect(page.getByText(reference)).toBeVisible();
  const dragSource = page.getByRole('button', { name: new RegExp(`Select .* ${reference}`) });
  const patioTable = page.getByRole('button', { name: /Table P1, 2 seats/i });
  await expect(dragSource).toBeVisible();
  await expect(patioTable).toBeVisible();
  await dragSource.dragTo(patioTable);

  await expect(page.getByText(new RegExp(`(Dropped|Seated) ${reference} at table P1`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table P1/i);
});

test('operator can use Move table mode as a touch fallback', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
  await page.goto('/reservations');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByRole('button', { name: /^Indoor$/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Indoor$/i }).first().click();
  await page.getByRole('button', { name: /confirm demo reservation/i }).click();
  await expect(page.getByRole('heading', { name: /demo reservation confirmed/i })).toBeVisible();
  const reference = (await page.locator('.reference').innerText()).trim();

  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await page.getByRole('button', { name: new RegExp(`Select .* ${reference}`) }).click();
  await page.getByRole('button', { name: /move table/i }).click();
  await expect(page.getByText(/drag this party or tap an open highlighted table/i)).toBeVisible();
  await page.getByRole('button', { name: /Table P1, 2 seats, open, drop/i }).click();

  await expect(page.getByText(new RegExp(`Seated ${reference} at table P1`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table P1/i);
});


test('operator can add, notify, and seat a walk-in from the Wait rail', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();

  await page.getByLabel('Operator sections').getByRole('button', { name: /^Wait$/i }).click();
  await expect(page.getByLabel('Add walk-in waitlist party')).toBeVisible();
  await page.getByLabel('Waitlist guest name').fill('Walk In Test');
  await page.getByLabel('Waitlist requested time').fill('19:30');
  await page.getByLabel('Waitlist party size').selectOption('2');
  await page.getByLabel('Waitlist seating preference').selectOption('either');
  await page.getByLabel('Quoted wait minutes').fill('20');
  await page.getByLabel('Waitlist note').fill('Test walk-in for iPad waitlist.');
  await page.getByRole('button', { name: /add to waitlist/i }).click();

  const waitRow = page.locator('.waitlist-row').filter({ hasText: 'Walk In Test' });
  await expect(page.getByText(/Added Walk In Test to the waitlist for 2/i)).toBeVisible();
  await expect(waitRow).toBeVisible();
  await expect(waitRow).toContainText(/20 min quote/i);
  await waitRow.getByRole('button', { name: /^Notify$/i }).click();
  await expect(waitRow).toContainText(/Notified/i);
  await waitRow.getByRole('button', { name: /seat from floor/i }).click();
  await expect(page.getByText(/Seat Walk In Test by tapping an open compatible table/i)).toBeVisible();
  await page.getByRole('button', { name: /Table P1, 2 seats, open, drop Walk In Test here/i }).click();

  await expect(page.getByText(/Seated waitlist party DEMO-[A-Z0-9]+ at table P1/i)).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table P1/i);
});

test('operator can create and seat a booking from the iPad Book rail', async ({ page, request }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await request.post('/api/demo/operator/reset', { headers: { 'x-demo-operator-token': operatorToken! }, data: {} });
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();

  await page.getByLabel('Operator sections').getByRole('button', { name: /^Book$/i }).click();
  await expect(page.getByLabel('Book from operator iPad')).toBeVisible();
  await page.getByLabel('Operator guest name').fill('Operator Walk In');
  await page.getByLabel('Operator booking party size').selectOption('2');
  await page.getByLabel('Operator booking seating').selectOption('indoor');
  await page.getByRole('button', { name: /check availability/i }).click();
  await expect(page.getByLabel('Operator booking availability').getByRole('button', { name: /Book Indoor/i }).first()).toBeVisible();
  await page.getByLabel('Operator booking availability').getByRole('button', { name: /Book Indoor/i }).first().click();

  await expect(page.getByText(/Booked DEMO-/)).toBeVisible();
  const statusText = await page.locator('.resyos-live-status').innerText();
  const reference = statusText.match(/Booked (DEMO-[A-Z0-9]+)/)?.[1];
  expect(reference).toBeTruthy();
  await expect(page.locator('.operator-row').filter({ hasText: reference! })).toBeVisible();

  await page.getByLabel('View controls').getByRole('button', { name: /^Timeline$/i }).click();
  await expect(page.getByLabel('Table lane reservation book')).toBeVisible();
  await expect(page.locator('.timeline-reservation-card').filter({ hasText: reference! })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`Seat ${reference} at table P1 from 5:00`) }).click();

  await expect(page.getByText(new RegExp(`Seated ${reference} at table P1`))).toBeVisible();
  await expect(page.locator('.selected-party-panel')).toContainText(/2 guests · outdoor · table P1/i);
});
