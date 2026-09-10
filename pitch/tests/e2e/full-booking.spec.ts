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
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /cancel demo reservation/i }).click();
  await expect(page.getByText(/cancelled and capacity returned/i)).toBeVisible();
  await page.goto('/operator');
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText(/disabled notification adapter/i)).toBeVisible();
});
