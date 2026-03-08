const { test, expect } = require('@playwright/test');

const base = 'http://localhost:4173';
const pages = [
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
  await page.goto(base + '/app/login.html');
  await page.fill('#email', user);
  await page.fill('#password', pass);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForLoadState('domcontentloaded');
}

test('staff smoke', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await login(page, 'bear', '1234');
  for (const p of pages) {
    const r = await page.goto(base + p);
    expect(r.status(), `HTTP failed for ${p}`).toBeLessThan(400);
    await page.waitForTimeout(250);
  }
  expect(errors, 'console/page errors').toEqual([]);
});

test('admin smoke', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await login(page, 'admin', '1234');
  for (const p of pages) {
    const r = await page.goto(base + p);
    expect(r.status(), `HTTP failed for ${p}`).toBeLessThan(400);
    await page.waitForTimeout(250);
  }
  expect(errors, 'console/page errors').toEqual([]);
});
