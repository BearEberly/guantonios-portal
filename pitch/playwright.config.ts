import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    browserName: 'chromium'
  },
  projects: [
    { name: 'chromium-desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'ipad-chromium', use: { viewport: { width: 1194, height: 834 }, isMobile: false, hasTouch: true } },
    { name: 'mobile-chromium', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
});
