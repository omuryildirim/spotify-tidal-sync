import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['web/src/**/*.test.ts'],
  },
});
