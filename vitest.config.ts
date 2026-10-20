import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws by design outside a React Server Component build.
      // Tests exercise those modules directly, so it resolves to a no-op here.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    pool: 'forks', // better-sqlite3 is a native addon; forks keep each file isolated
    testTimeout: 30_000,
    coverage: { provider: 'v8', reportsDirectory: './coverage', include: ['src/lib/**'] },
  },
});
