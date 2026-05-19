import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const identityRoot = resolve(__dirname, '../identity/src');

export default defineConfig({
  resolve: {
    alias: [
      { find: '@seta/identity/register', replacement: `${identityRoot}/register.ts` },
      { find: '@seta/identity/auth', replacement: `${identityRoot}/backend/auth.ts` },
      { find: '@seta/identity/events', replacement: `${identityRoot}/events/index.ts` },
      { find: '@seta/identity/testing', replacement: `${identityRoot}/testing/index.ts` },
      { find: '@seta/identity', replacement: `${identityRoot}/index.ts` },
    ],
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
