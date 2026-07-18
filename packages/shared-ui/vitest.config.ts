import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { stylexVitePlugin } from './src/testing/vitest-preset';

export default defineConfig({
  plugins: [stylexVitePlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    css: false,
    // RTL suites are correct but slow under CI CPU contention: the full-monorepo `pnpm test`
    // fans out ~10 vitest processes on a 2-vCPU runner, so give them headroom past the 5s default.
    testTimeout: 20000,
  },
});
