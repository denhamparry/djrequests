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
        // A non-opaque origin is required for Web Storage APIs. Without
        // `url`, jsdom throws "SecurityError: localStorage is not
        // available for opaque origins" on access.
        url: 'http://localhost'
      }
    },
    // Install a Map-backed Storage shim for jsdom tests — see
    // `src/test/jsdom-localstorage.ts` for the rationale. Node-only
    // tests that opt in via `// @vitest-environment node` skip this.
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
