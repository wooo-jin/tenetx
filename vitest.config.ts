import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      // dashboard는 Ink/React TUI로 단위테스트 부적합 — 별도 통합테스트 필요
      exclude: ['src/**/*.d.ts', 'src/dashboard/**'],
      thresholds: {
        // 현실 기준 (2026-03-25 측정: stmts 36.5%, branches 34.4%, funcs 43.2%, lines 36.4%)
        // 목표: 매 릴리즈마다 2-3%p 상향. 장기 목표 60%.
        lines: 35,
        branches: 33,
        functions: 42,
        statements: 35,
      },
    },
  },
});
