import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local first (Neon writes branch credentials there; gitignored), then
// .env. Existing process env vars always win, so hosting platforms and explicit
// overrides take precedence over files.
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const bool = (def: boolean) => z.string().optional().transform(v => v == null || v === '' ? def : v === 'true');

const envSchema = z.object({
  PORT: z.string().default('5000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5433/qwesie_tv?schema=public'),
  // Direct (non-pooled) URL used by Prisma Migrate and pg_dump. Optional: falls
  // back to DATABASE_URL so local Postgres and single-URL hosts keep working.
  // DIRECT_URL is the preferred name (Prisma convention); DATABASE_URL_UNPOOLED
  // remains accepted for older deployments.
  DIRECT_URL: z.string().optional().default(''),
  DATABASE_URL_UNPOOLED: z.string().optional().default(''),
  // How many sockets the app pool may open against Neon. PgBouncer fans these
  // out, so keep it small on a single Render instance.
  DB_CONNECTION_LIMIT: z.string().default('5').transform(Number),
  DB_POOL_TIMEOUT_SECONDS: z.string().default('10').transform(Number),
  // Opt-in diagnostics: Prisma query durations + every request logged.
  DIAGNOSTICS: bool(false),
  PERF_LOG: bool(false),
  PERF_SLOW_MS: z.string().default('500').transform(Number),
  // Opt-in keep-warm ping for match/event days (Neon autosuspend).
  KEEPWARM_ENABLED: bool(false),
  KEEPWARM_INTERVAL_MINUTES: z.string().default('4').transform(Number),
  // Trust N proxy hops (Render terminates TLS in front of the app).
  TRUST_PROXY: z.string().default('1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().default('qwesie-tv-development-secret-key-32chars'),
  JWT_COOKIE_NAME: z.string().default('qwesie_token'),
  UPLOADS_DIR: z.string().default('uploads'),
  CLIENT_DIST_DIR: z.string().default(''),
  SERVE_CLIENT: z.string().default('').transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_ENDPOINT: z.string().optional().default(''),
  STORAGE_REGION: z.string().optional().default('auto'),
  STORAGE_ACCESS_KEY_ID: z.string().optional().default(''),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_PUBLIC_BASE_URL: z.string().optional().default(''),
  BACKUP_DIR: z.string().default('backups'),
  // Local pg_dump backups are OFF by default: hosted databases (Neon) should
  // use branching / point-in-time restore, and pg_dump may not exist on Render.
  BACKUP_ENABLED: bool(false),
  BACKUP_INTERVAL_MINUTES: z.string().default('60').transform(Number),
  BACKUP_ON_START: bool(false),
  BACKUP_KEEP: z.string().default('48').transform(Number),
  BACKUP_KEEP_DAILY_DAYS: z.string().default('7').transform(Number),
  PG_DUMP_PATH: z.string().default('pg_dump'),
  PG_RESTORE_PATH: z.string().default('psql'),
  // Auth/security
  DEV_AUTO_LOGIN: bool(false),
  ALLOW_SCORER_PIN: bool(false),
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

const envData = parsed.data;

// S3-compatible storage: Neon Object Storage injects AWS-standard variable
// names. Accept them as fallbacks so the same credentials work here, and derive
// the public base URL for public_read buckets when it is not set explicitly.
if (envData.STORAGE_DRIVER === 's3') {
  if (!envData.STORAGE_ENDPOINT) {
    envData.STORAGE_ENDPOINT = String(process.env.AWS_ENDPOINT_URL_S3 || '').trim();
  }
  const awsRegion = String(process.env.AWS_REGION || '').trim();
  if ((!envData.STORAGE_REGION || envData.STORAGE_REGION === 'auto') && awsRegion) {
    envData.STORAGE_REGION = awsRegion;
  }
  if (!envData.STORAGE_ACCESS_KEY_ID) {
    envData.STORAGE_ACCESS_KEY_ID = String(process.env.AWS_ACCESS_KEY_ID || '').trim();
  }
  if (!envData.STORAGE_SECRET_ACCESS_KEY) {
    envData.STORAGE_SECRET_ACCESS_KEY = String(process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  }
  if (!envData.STORAGE_PUBLIC_BASE_URL && envData.STORAGE_ENDPOINT && envData.STORAGE_BUCKET) {
    envData.STORAGE_PUBLIC_BASE_URL = `${envData.STORAGE_ENDPOINT.replace(/\/+$/, '')}/${envData.STORAGE_BUCKET}`;
  }
}

// Ensure defaults are visible to libraries that read from process.env (e.g. Prisma)
for (const [k, v] of Object.entries(envData)) {
  if (process.env[k] == null || process.env[k] === '') process.env[k] = String(v);
}

// Prisma Migrate needs a direct connection. Prefer DIRECT_URL, then the older
// DATABASE_URL_UNPOOLED name, then the pooled URL (local Postgres / single-URL
// hosts). Resolve it before the client is constructed.
const directUrl =
  process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || envData.DATABASE_URL;
process.env.DIRECT_URL = directUrl;
process.env.DATABASE_URL_UNPOOLED = directUrl;
envData.DIRECT_URL = directUrl;
envData.DATABASE_URL_UNPOOLED = directUrl;

// Neon's PgBouncer endpoint needs pgbouncer=true (disables prepared statements)
// and a small pool. Add them only for a "-pooler" host so local/other hosts are
// untouched. Explicit query params always win.
function normalizePooledUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('-pooler')) return raw;
    if (!u.searchParams.has('sslmode')) u.searchParams.set('sslmode', 'require');
    if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true');
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', String(Math.max(1, envData.DB_CONNECTION_LIMIT || 5)));
    }
    if (!u.searchParams.has('pool_timeout')) {
      u.searchParams.set('pool_timeout', String(Math.max(1, envData.DB_POOL_TIMEOUT_SECONDS || 10)));
    }
    if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '10');
    return u.toString();
  } catch {
    return raw;
  }
}

const pooledUrl = normalizePooledUrl(process.env.DATABASE_URL || envData.DATABASE_URL);
process.env.DATABASE_URL = pooledUrl;
envData.DATABASE_URL = pooledUrl;

export const env = envData;

// Production safety: refuse weak/default JWT secret
if (env.NODE_ENV === 'production') {
  const weakDefault = env.JWT_SECRET === 'qwesie-tv-development-secret-key-32chars';
  if (weakDefault || env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be set to a strong value (>= 32 chars, not the default) in production.');
    process.exit(1);
  }
  if (env.STORAGE_DRIVER === 'local') {
    // Render's free filesystem is ephemeral; uploads survive until the next
    // deploy/restart. Warn instead of blocking startup so the app stays usable.
    console.warn('WARNING: STORAGE_DRIVER=local in production. Uploaded files are ephemeral (lost on redeploy). Configure S3-compatible storage for durable uploads.');
  }
  if (env.STORAGE_DRIVER === 's3') {
    const missing = ['STORAGE_BUCKET', 'STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY', 'STORAGE_PUBLIC_BASE_URL']
      .filter((k) => !String((env as any)[k] || '').trim());
    if (missing.length) {
      console.error(`FATAL: Missing storage config in production: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
}
