import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dbTestDefaults } from '@seta/shared-config/vitest/db-test-defaults';
import { defineConfig } from 'vitest/config';

// Load the repo-root .env so local eval runs pick up the environment's
// configured model (AGENT_MODELS / AGENT_MODEL_DEFAULT / <PROVIDER>_BASE_URL),
// matching how api/worker run. Existing env vars are never overridden, so
// injected CI/shell values win. .env is git-ignored and absent on CI
// (dev/uat/prod) — this only affects local test runs.
const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
} catch {
  // No .env (e.g. CI) — env vars come from the environment instead.
}

export default defineConfig({
  test: {
    ...dbTestDefaults,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
  },
});
