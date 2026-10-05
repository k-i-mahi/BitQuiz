import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required (use the same value as DATABASE_URL without a pooler)'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  /** Falls back to the URL Render assigns the service, so a fresh deploy needs no extra setting. */
  PUBLIC_URL: z.url().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173'),
  ANSWER_GRACE_MS: z.coerce.number().int().min(0).max(5000).default(1000),
  LATENCY_CAP_MS: z.coerce.number().int().min(0).max(2000).default(500),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Directory of the built web app; served when present. */
  WEB_DIST: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Fail fast at startup with a readable message instead of a stack trace deep inside a request.
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
