const { chromium, devices } = require('playwright');

const base = 'http://localhost:4173';
const pages = [
  '/app/dashboard.html','/app/schedule.html','/app/training.html','/app/menus.html','/app/tips.html','/app/tips-summary.html','/app/sops.html','/app/checklists.html','/app/requests.html','/app/profile.html','/app/staff.html','/app/manager.html','/app/admin.html'
];

async function login(page, user, pass) {
  await page.goto(base + '/app/login.html', { waitUntil: 'domcontentloaded' });
  await page.fill('#email', user);
  await page.fill('#password', pass);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForLoadState('domcontentloaded');
}

async function runMode(browser, mode) {
  const users = [
    { label: 'staff', login: 'bear', pass: '1234' },
    { label: 'admin', login: 'admin', pass: '1234' }
  ];

  const out = [];
  const errors = [];
  for (const u of users) {
    const ctx = await browser.newContext(mode.mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${mode.name}/${u.label}] ${String(e)}`));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`[${mode.name}/${u.label}] ${msg.text()}`);
    });

    await login(page, u.login, u.pass);
    for (const path of pages) {
      const t0 = Date.now();
      const resp = await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(120);
      const metrics = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowX: el.scrollWidth - el.clientWidth
        };
      });
      out.push({
        mode: mode.name,
        user: u.label,
        path,
        status: resp ? resp.status() : 0,
        ms: Date.now() - t0,
        overflowX: metrics.overflowX
      });
    }
    await ctx.close();
  }
  return { out, errors };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await runMode(browser, { name: 'desktop', mobile: false });
  const mobile = await runMode(browser, { name: 'mobile', mobile: true });
  await browser.close();
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})();
