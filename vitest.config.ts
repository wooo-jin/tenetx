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
        // v3.0.0 실측 기준 (2026-03-31). 매 릴리즈마다 상향. 장기 목표 70%.
        lines: 47,
        branches: 45,
        functions: 54,
        statements: 47,
      },
    },
  },
});
