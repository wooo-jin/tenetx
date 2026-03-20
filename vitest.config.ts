import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/dashboard/**'],
      thresholds: {
        lines: 40,
        branches: 34,
        functions: 50,
        statements: 40,
      },
    },
  },
});
