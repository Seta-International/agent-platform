import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    {
      name: 'strip-dev-routes',
      apply: 'build',
      load(id) {
        if (id.includes('/routes/dev/')) {
          return 'export const Route = { component: () => null };';
        }
        return null;
      },
    },
  ],
});
