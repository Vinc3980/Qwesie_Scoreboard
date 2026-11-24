import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory or monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const bool = (def: boolean) => z.string().optional().transform(v => v == null || v === '' ? def : v === 'true');

const envSchema = z.object({
  PORT: z.string().default('5000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5433/qwesie_tv?schema=public'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().default('qwesie-tv-development-secret-key-32chars'),
  JWT_COOKIE_NAME: z.string().default('qwesie_token'),
  UPLOADS_DIR: z.string().default('uploads'),
  CLIENT_DIST_DIR: z.string().default(''),
  SERVE_CLIENT: z.string().default('').transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  BACKUP_DIR: z.string().default('backups'),
  BACKUP_INTERVAL_MINUTES: z.string().default('5').transform(Number),
  BACKUP_ON_START: z.string().default('true').transform(v => v !== 'false'),
  BACKUP_KEEP: z.string().default('48').transform(Number),
  BACKUP_KEEP_DAILY_DAYS: z.string().default('7').transform(Number),
  PG_DUMP_PATH: z.string().default('pg_dump'),
  PG_RESTORE_PATH: z.string().default('psql'),
  // Auth/security
  DEV_AUTO_LOGIN: bool(false),
  ALLOW_SCORER_PIN: bool(false),
  BOOTSTRAP_SETUP_TOKEN: z.string().optional().default(''),
  // Optional SMTP (email reset layer)
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.string().optional().default('587').transform(Number),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  SMTP_SECURE: bool(false),
  APP_BASE_URL: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

// Ensure defaults are visible to libraries that read from process.env (e.g. Prisma)
for (const [k, v] of Object.entries(parsed.data)) {
  if (process.env[k] == null || process.env[k] === '') process.env[k] = String(v);
}

export const env = parsed.data;

// Production safety: refuse weak/default JWT secret
if (env.NODE_ENV === 'production') {
  const weakDefault = env.JWT_SECRET === 'qwesie-tv-development-secret-key-32chars';
  if (weakDefault || env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be set to a strong value (>= 32 chars, not the default) in production.');
    process.exit(1);
  }
}
