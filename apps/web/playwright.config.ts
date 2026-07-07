import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Load repo-root .env so apps/server (DATABASE_URL, BETTER_AUTH_SECRET, …)
// boots cleanly when Playwright spawns `pnpm -w dev`.
const ENV_PATH = '../../.env';
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const ADMIN_STORAGE_STATE = '.auth/admin.json';

// When E2E_BASE_URL is set, target a live deployment (UAT) instead of booting a
// local dev stack: use that origin and skip the webServer spawn entirely.
const E2E_BASE_URL = process.env.E2E_BASE_URL;
const BASE_URL = E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/helpers/**', '**/global-setup.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    storageState: ADMIN_STORAGE_STATE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Local runs boot the full dev stack; a remote target (E2E_BASE_URL) skips it.
  webServer: E2E_BASE_URL
    ? undefined
    : {
        // Boots the full dev stack (apps/web + apps/server + apps/dev-mcp-stub) via turbo.
        // Requires Postgres up + migrated + the `sandbox` tenant bootstrapped:
        //   pnpm db:up && pnpm db:migrate && bash scripts/dev/tenant-bootstrap.sh
        // The Playwright global setup creates the planner fixtures (Engineering group,
        // Q2 Infrastructure plan, buckets, tasks) the first time it runs.
        command: 'pnpm -w dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
