import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const operatorToken = process.env.DEMO_OPERATOR_TOKEN;

test.use({ bypassCSP: true });

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(metrics.scrollWidth).toBe(metrics.clientWidth);
  expect(metrics.bodyScrollWidth).toBe(metrics.clientWidth);
}

async function expectNoAxeViolations(page: import('@playwright/test').Page) {
  await page.addScriptTag({ path: axePath });
  const results = await page.evaluate(async () => {
    return await window.axe.run(document, {
      rules: {
        'color-contrast': { enabled: false }
      }
    });
  });
  expect(results.violations, JSON.stringify(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), null, 2)).toEqual([]);
}

test('public demo pages pass automated accessibility smoke checks', async ({ page }) => {
  for (const path of ['/', '/reservations', '/manage']) {
    await page.goto(path);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  }
});

test('protected operator page passes automated accessibility smoke checks after login', async ({ page }) => {
  test.skip(!operatorToken, 'DEMO_OPERATOR_TOKEN is required for protected operator verification');
  await page.goto('/operator');
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
  await page.getByLabel(/operator passcode/i).fill(operatorToken!);
  await page.getByRole('button', { name: /open operator view/i }).click();
  await page.getByText(/disabled notification adapter/i).waitFor({ timeout: 8000 });
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

declare global {
  interface Window {
    axe: {
      run: (context: Document, options?: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }>;
    };
  }
}
