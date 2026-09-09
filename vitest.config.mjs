import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://oddsyra_app@127.0.0.1:5432/oddsyra',
    },
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/coverage/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'lib/betPlacementEngine.mjs',
        'lib/withdrawalEngine.mjs',
        'lib/depositEngine.mjs',
        'lib/odds-v3/OddsEngineV3.mjs',
      ],
      thresholds: {
        lines: 60,
        functions: 70,
        statements: 60,
        branches: 45,
      },
    },
  },
});
