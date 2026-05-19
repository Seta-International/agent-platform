import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
