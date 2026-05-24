import { dbTestDefaults } from '@seta/shared-config/vitest/db-test-defaults';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...dbTestDefaults,
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
  },
});
