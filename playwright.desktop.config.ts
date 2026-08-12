import { defineConfig, devices } from '@playwright/test';

const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/desktop',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/desktop',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1100, height: 760 },
    baseURL: BASE_URL,
    colorScheme: 'light',
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'desktop-chromium' }],
  webServer: {
    command: 'npm run build:desktop && npm run preview:desktop',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
