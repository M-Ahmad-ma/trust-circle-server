import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://trustcircle:trustcircle@localhost:5433/trustcircle_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    globalSetup: ['tests/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123',
      UPLOAD_DIR: 'uploads-test',
    },
    testTimeout: 15_000,
    hookTimeout: 20_000,
  },
});
