import path from 'node:path';
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // SSE pass-through: drop any framing/encoding from upstream that would let
        // http-proxy accumulate chunks, and signal proxies to disable buffering so
        // assistant tokens stream progressively instead of arriving all at once.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const ct = proxyRes.headers['content-type'];
            if (typeof ct === 'string' && ct.includes('text/event-stream')) {
              delete proxyRes.headers['content-encoding'];
              delete proxyRes.headers['content-length'];
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
