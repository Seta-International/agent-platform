import path from 'node:path';
import stylex from '@stylexjs/unplugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src',
      virtualRouteConfig: './src/routes.virtual.ts',
    }),
    stylex.vite({
      useCSSLayers: true,
      dev: process.env.NODE_ENV !== 'production',
      runtimeInjection: false,
    }),
    react(),
    tailwindcss(),
    visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'],
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
