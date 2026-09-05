import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Cap forks so local release/CI do not spawn ~availableParallelism() multi-GB workers.
    maxWorkers: Math.max(
      1,
      Number.parseInt(process.env.VITEST_MAX_WORKERS ?? '4', 10) || 4,
    ),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts', '.pi/extensions/smart-router/**/*.ts'],
      exclude: ['spine-tasks/**'],
      // Combined gate (src + extension). Measured 2026-09-05: lines 91.45%,
      // statements 91.45%, functions 96.42%, branches 87.64% (SP-258 / #144).
      // Extension-only baseline: lines 82.28%, branches 79.4%.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
