import { resolve } from 'node:path';
import { dbTestDefaults } from '@seta/shared-config/vitest/db-test-defaults';
import { defineConfig } from 'vitest/config';

const identityRoot = resolve(__dirname, '../identity/src');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@seta/identity/agent-tools',
        replacement: `${identityRoot}/backend/agent-tools/index.ts`,
      },
      { find: '@seta/identity/auth', replacement: `${identityRoot}/backend/auth.ts` },
      { find: '@seta/identity/events', replacement: `${identityRoot}/events/index.ts` },
      { find: '@seta/identity/http', replacement: `${identityRoot}/backend/http/index.ts` },
      {
        find: '@seta/identity/internal/activity-subject-paths',
        replacement: `${identityRoot}/backend/domain/activity-subject-paths.ts`,
      },
      { find: '@seta/identity/register', replacement: `${identityRoot}/register.ts` },
      { find: '@seta/identity/testing', replacement: `${identityRoot}/testing/index.ts` },
      { find: '@seta/identity', replacement: `${identityRoot}/index.ts` },
    ],
  },
  test: {
    ...dbTestDefaults,
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
  },
});
