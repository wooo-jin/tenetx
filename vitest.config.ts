import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        // v3 현실 기준. 매 릴리즈마다 상향. 장기 목표 60%.
        lines: 35,
        branches: 33,
        functions: 42,
        statements: 35,
      },
    },
  },
});
