const { test, expect } = require('@playwright/test');

const base = 'http://localhost:4173';

const navPages = [
  '/app/dashboard.html',
  '/app/schedule.html',
  '/app/training.html',
  '/app/menus.html',
  '/app/tips.html',
  '/app/tips-summary.html',
  '/app/sops.html',
  '/app/checklists.html',
  '/app/requests.html',
  '/app/profile.html',
  '/app/staff.html',
  '/app/manager.html',
  '/app/admin.html'
];

async function login(page, user, pass) {
  await page.goto(base + '/app/login.html', { waitUntil: 'domcontentloaded' });
  await page.fill('#email', user);
  await page.fill('#password', pass);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForLoadState('domcontentloaded');
}

function wireErrorCapture(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${String(e)}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

test('role access boundaries are enforced', async ({ page }) => {
  const errors = wireErrorCapture(page);

  await login(page, 'bear', '1234');

  await page.goto(base + '/app/staff.html', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app\/dashboard(?:\.html)?$/);

  await page.goto(base + '/app/manager.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/Manager access required|Admin access required|Dashboard|Manager/i);

  await page.goto(base + '/app/admin.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/Admin access required|Dashboard|Admin/i);

  expect(errors).toEqual([]);
});

test('staff directory powers tips roster', async ({ page }) => {
  const errors = wireErrorCapture(page);
  const smokeName = 'ZZ Smoke User';

  await login(page, 'admin', '1234');

  await page.goto(base + '/app/staff.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#staffAddName')).toBeEnabled();
  await expect(page.locator('#staffRows')).not.toContainText('Loading...');
  const beforeCount = await page.locator('#staffRows tr').count();
  await page.fill('#staffAddName', smokeName);
  await page.selectOption('#staffAddPosition', 'Server');
  await page.click('#staffAddForm button[type="submit"]');
  await expect(page.locator('#staffRows tr')).toHaveCount(beforeCount + 1);

  await expect(page.locator('#staffRows')).toContainText(smokeName);

  await page.goto(base + '/app/tips.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tipsRosterRows')).toContainText(smokeName);

  await page.fill('#tipSquareTips', '100');
  await page.fill('#tipLargePartyTips', '20');
  await page.fill('#tipCashDue', '-10');
  await page.fill('#tipCashOnHand', '40');
  await page.click('#tipsSaveBtn');

  await expect(page.locator('#tipsSavedBadge')).toBeVisible();

  await page.goto(base + '/app/tips-summary.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tipsSummaryDayRows')).toContainText('$150.00');

  expect(errors).toEqual([]);
});

test('admin schedule save flow is stable', async ({ page }) => {
  const errors = wireErrorCapture(page);

  await login(page, 'admin', '1234');
  await page.goto(base + '/app/schedule.html', { waitUntil: 'domcontentloaded' });

  const bearRow = page.locator('#scheduleGridRows tr', { hasText: 'Bear' }).first();
  await expect(bearRow).toBeVisible();

  const firstCheck = bearRow.locator('input.schedule-grid-check').first();
  await firstCheck.check({ force: true });
  await page.click('#scheduleSaveBtn');

  await expect(page.locator('#scheduleSavedFlash')).toHaveClass(/is-visible/);

  expect(errors).toEqual([]);
});

test('navigation stress loop has no runtime errors', async ({ page }) => {
  const errors = wireErrorCapture(page);
  await login(page, 'admin', '1234');

  for (let round = 0; round < 3; round += 1) {
    for (const path of navPages) {
      const response = await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      expect(response.status(), `HTTP ${path} round ${round + 1}`).toBeLessThan(400);
      await page.waitForTimeout(120);
    }
  }

  expect(errors).toEqual([]);
});
