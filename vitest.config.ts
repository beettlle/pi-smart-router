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
      include: ['src/**/*.ts'],
      exclude: ['spine-tasks/**'],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 45,
        statements: 50,
      },
    },
  },
});
