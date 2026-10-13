import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    'import.meta.env.VITE_USE_MOCKS': JSON.stringify('false'),
  },
  test: {
    root: repoRoot,
    include: ['tests/web-unit/**/*.test.{ts,tsx}', 'apps/web/src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: [fileURLToPath(new URL('../../tests/web-unit/setup.ts', import.meta.url))],
    css: false,
    restoreMocks: true,
    testTimeout: 45000,
    env: {
      VITE_API_BASE_URL: 'http://api.test',
      VITE_LANDING_URL: 'https://landing.test/',
    },
  },
});
