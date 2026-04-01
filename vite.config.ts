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
    include: [
      'packages/sdk/src/**/*.test.ts',
      'packages/sdk/src/**/__tests__/**/*.test.ts',
      'packages/api/src/**/__tests__/**/*.test.ts',
      'packages/api/src/**/*.test.ts',
      'api/tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
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
      thresholds: {
        lines: 75,
        functions: 60,
        branches: 70,
        statements: 75,
      },
    },
  },
});
