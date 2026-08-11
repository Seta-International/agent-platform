import { stylexVitePlugin } from '@seta/shared-ui/testing/vitest-preset';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [stylexVitePlugin(), react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    css: false,
    // Heavy RTL flows (dialog with many Astryx fields, 30-row×12-col tables) run 100–430ms
    // locally but blow the 5000ms default in CI, where the full-monorepo `pnpm test` starves
    // CPU with parallel backend testcontainers. Give the RTL suites realistic headroom.
    //
    // 20000 was too tight: on main's own CI run, create-worker-dialog's malformed-email case
    // passed at 18279ms — 91% of the budget — so any extra load tipped it into a timeout.
    // The CI/local factor measured ~48x (382ms local vs 18279ms there), which no plausible
    // micro-optimisation absorbs; size the budget for the starved runner instead.
    testTimeout: 45000,
  },
});
