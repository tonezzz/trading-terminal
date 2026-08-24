/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const tradeApiProxy = {
  '/api/trade': {
    target: 'http://tony-omen.local:8080',
    changeOrigin: true,
    rewrite: (requestPath: string) => requestPath.replace(/^\/api\/trade/, '/apps/trade/api'),
    configure: (proxy, options) => {
      proxy.on('error', (err, req, res) => {
        console.log('proxy error', err);
      });
      proxy.on('proxyReq', (proxyReq, req, res) => {
        console.log('proxying:', req.method, req.url, 'to', options.target + req.url);
      });
    },
  },
};

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: tradeApiProxy,
    },
    preview: {
      proxy: tradeApiProxy,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // === Test Configuration ===
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      coverage: {
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'src/test/',
          '**/*.d.ts',
          '**/coverage/**'
        ]
      }
    }
  };
});

