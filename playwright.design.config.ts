import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/design-graph',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/design-graph',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    colorScheme: 'light',
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'desktop-chromium' }],
  webServer: {
    command: 'npm run design:graph',
    url: `${BASE_URL}/design-graph.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
