/**
 * Vitest config for E2E tests.
 * These tests require a running server + database.
 *
 * Run: npx vitest run --config vitest.e2e.config.ts
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    // E2E tests can take longer — give them more time
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run E2E tests sequentially to avoid port/DB conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporter: ['verbose'],
  },
});
