import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const setupDbTest = fileURLToPath(
  new URL('../../node_modules/@seta/shared-config/vitest/setup-db-test.ts', import.meta.url),
);

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: true,
    maxWorkers: 4,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    setupFiles: [setupDbTest],
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
  },
});
