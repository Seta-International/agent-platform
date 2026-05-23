import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Load repo-root .env so apps/server (DATABASE_URL, BETTER_AUTH_SECRET, …)
// boots cleanly when Playwright spawns `pnpm -w dev`.
const ENV_PATH = '../../.env';
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const ADMIN_STORAGE_STATE = '.auth/admin.json';

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/helpers/**', '**/global-setup.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
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
  webServer: {
    // Boots the full dev stack (apps/web + apps/server + apps/dev-mcp-stub) via turbo.
    // Requires Postgres already running (`pnpm db:up && pnpm db:migrate && pnpm db:seed`).
    command: 'pnpm -w dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
