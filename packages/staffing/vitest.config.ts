import { dbTestDefaults } from '@seta/shared-config/vitest/db-test-defaults';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...dbTestDefaults,
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
  },
});
