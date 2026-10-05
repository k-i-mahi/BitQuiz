import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests use the database from ../.env (or DATABASE_URL in CI) and skip without one.
if (existsSync('../.env')) process.loadEnvFile('../.env');
const hasDatabase = Boolean(process.env.DATABASE_URL);

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      HAS_DATABASE: hasDatabase ? '1' : '',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://unused:unused@localhost:1/unused',
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-secret-that-is-long-enough-for-validation',
      ANSWER_GRACE_MS: '1000',
      LATENCY_CAP_MS: '500',
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
