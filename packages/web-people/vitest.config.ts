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
  },
});
