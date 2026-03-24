import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    // Include tests from SDK package, API routes, and packages/api services
    include: [
      'packages/sdk/src/**/*.test.ts',
      'packages/sdk/src/**/__tests__/**/*.test.ts',
      'packages/api/src/**/__tests__/**/*.test.ts',
      'packages/api/src/**/*.test.ts',
      'api/tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'packages/sdk/src/core/**',
        'packages/sdk/src/sdk/**',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/examples/**',
      ],
      // Thresholds based on current coverage baseline
      // (functions lower due to untested SDK modules: audit-logger, kill-switch, main-wrapper)
      thresholds: {
        lines: 60,
        functions: 45,
        branches: 65,
        statements: 60,
      },
    },
  },
});
