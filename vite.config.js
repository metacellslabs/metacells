import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    svgr(),
  ],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3400',
        changeOrigin: true,
        timeout: 300000,
      },
      '/artifacts': {
        target: 'http://localhost:3400',
        changeOrigin: true,
      },
      '/channel-events': {
        target: 'http://localhost:3400',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      'simple-yenc': path.resolve(__dirname, 'node_modules/simple-yenc/dist/esm.js'),
    },
  },
  optimizeDeps: {
    exclude: [
      'imapflow',
      '@whiskeysockets/baileys',
    ],
  },
});
