import { test, expect } from '@playwright/test';

test('homepage routes to the demo reservation flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /reserve a table/i })).toBeVisible();
  await page.getByRole('link', { name: /reserve a table/i }).click();
  await expect(page).toHaveURL(/\/reservations\/?$/);
  await expect(page.getByRole('heading', { name: "Guantonio's Wood Fired", exact: true })).toBeVisible();
  await expect(page.getByText(/synthetic demo only/i)).toBeVisible();
});

test('operator route requires a passcode before listing bookings', async ({ page }) => {
  await page.goto('/operator');
  await expect(page.getByRole('heading', { name: /tonight's demo service/i })).toBeVisible();
  await expect(page.getByLabel(/operator passcode/i)).toBeVisible();
});
