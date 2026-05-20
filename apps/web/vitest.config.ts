import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    css: false,
    // Playwright e2e specs live under test/e2e/ and require @playwright/test, which is not
    // installed until the runner-provisioning slice lands. Exclude them so Vitest doesn't
    // attempt to resolve the missing package.
    exclude: ['test/e2e/**', 'node_modules/**'],
  },
});
