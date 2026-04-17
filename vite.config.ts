import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        // jsdom 29 throws "SecurityError: localStorage is not available for
        // opaque origins" without a real URL. Setting one keeps Web Storage
        // (and any other origin-scoped APIs) functional in tests.
        url: 'http://localhost'
      }
    },
    // Polyfill Web Storage — jsdom 29 + Node 22+ native Web Storage is
    // broken without --localstorage-file. The setup file only runs when
    // the environment is jsdom; Node-only tests (netlify, apps-script)
    // that use `// @vitest-environment node` skip it.
    setupFiles: ['./src/test/jsdom-localstorage.ts'],
    globals: true,
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      'netlify/functions/__tests__/**/*.test.ts',
      'apps-script/__tests__/**/*.test.ts'
    ],
    exclude: ['tests/e2e/**'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts']
    }
  }
});
