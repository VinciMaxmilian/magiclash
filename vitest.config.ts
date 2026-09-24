import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/tests/**/*.test.ts', 'frontend/tests/**/*.test.ts', 'realtime/tests/**/*.test.ts'],
    environment: 'node',
  },
});
