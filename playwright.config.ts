import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

/** The perf spec runs in one project of its own, never in the browser matrix. */
const PERF = /perf\.spec\.ts/;
const DESIGN_GRAPH = /design-graph/;
const DESKTOP = /e2e\/desktop\//;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  // The Tier 1/2 matrix from the plan. Tier 3 (mobile) is view-only and gets
  // added when there is a document surface to view.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [PERF, DESIGN_GRAPH, DESKTOP],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: [PERF, DESIGN_GRAPH, DESKTOP],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: [PERF, DESIGN_GRAPH, DESKTOP],
    },

    // Its own project, and Chromium only. The §16 budgets are render numbers:
    // they are not comparable between engines, three sets of them would be
    // three sets of flakes, and the code they protect — the pipeline and the
    // React commit — is the same everywhere. Run with `--project=perf`.
    {
      name: 'perf',
      testMatch: PERF,
      testIgnore: [DESIGN_GRAPH, DESKTOP],
      use: { ...devices['Desktop Chrome'] },
      // A performance gate measures one foreground page at a time. Running the
      // three corpus sizes in parallel makes the 45KB row compete with the 1MB
      // parse, which measures the test runner's scheduling rather than LocalMD.
      fullyParallel: false,
      // Timing on a shared runner is noisy in one direction only: a retry that
      // passes means the budget is met and the machine hiccuped, which is worth
      // more than a red build nobody trusts. A strict release sign-off gets no
      // retry: the first reading is the evidence being recorded.
      retries: process.env.PERF_STRICT === '1' ? 0 : 2,
    },
  ],

  // Must be the production build, never `vite dev`: the dev server relaxes CSP
  // for HMR (inline scripts, websocket), so testing against it would prove
  // nothing about the policy that actually ships. See csp.config.mjs.
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
