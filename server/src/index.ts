import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSocketServer } from './sockets/socketManager.js';
import { authenticate, ensureDevUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { startBackupScheduler } from './utils/backup.js';

const app = express();
const server = http.createServer(app);

// Render/Railway/Fly terminate TLS at their proxy. Trust one hop so req.protocol,
// req.secure, req.ip and password-reset links use the public HTTPS origin.
app.set('trust proxy', 1);

const isProd = env.NODE_ENV === 'production';
const serveClient = env.SERVE_CLIENT ?? isProd;

// Public URL supplied by the hosting platform (Render sets RENDER_EXTERNAL_URL).
const publicBaseUrl = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL || env.APP_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if ((net as any).family === 'IPv4' && !(net as any).internal) addrs.push((net as any).address);
    }
  }
  return addrs;
}

function isPrivateLanHost(hostname: string) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

function buildAllowedOriginSet() {
  const configured = env.CORS_ORIGIN === '*'
    ? ['*']
    : env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
  const out = new Set(configured);
  // Ensure LAN/dev/server-port origins commonly used on match day are covered.
  const devPort = Number(process.env.CLIENT_DEV_PORT || 5173);
  const ports = new Set([devPort, env.PORT, 4173, 5173].filter(Boolean));
  for (const ip of getLanAddresses()) {
    for (const p of ports) out.add(`http://${ip}:${p}`);
  }
  out.add(`http://localhost:${devPort}`);
  out.add(`http://127.0.0.1:${devPort}`);
  out.add(`http://localhost:${env.PORT}`);
  out.add(`http://127.0.0.1:${env.PORT}`);
  // Hosting platforms provide the canonical public URL; allow same-origin
  // REST/Socket.IO traffic without requiring CORS_ORIGIN to be set manually.
  if (publicBaseUrl) {
    try { out.add(new URL(publicBaseUrl).origin); } catch {}
  }
  return out;
}

const allowedOriginSet = buildAllowedOriginSet();
const allowAllOrigins = allowedOriginSet.has('*');

const corsOrigin = allowAllOrigins
  ? '*'
  : (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true); // same-origin/non-browser
      if (allowedOriginSet.has(origin)) return cb(null, true);
      try {
        const u = new URL(origin);
        const devPort = Number(process.env.CLIENT_DEV_PORT || 5173);
        const allowedPorts = new Set([String(devPort), String(env.PORT), '4173', '5173']);
        // Cover LAN origins actually used (dev port and server port) on private networks.
        if ((u.protocol === 'http:' || u.protocol === 'https:') && isPrivateLanHost(u.hostname) && allowedPorts.has(u.port || (u.protocol === 'https:' ? '443' : '80'))) {
          return cb(null, true);
        }
      } catch {}
      return cb(null, false);
    };

app.use(cors({ origin: corsOrigin as any, credentials: !allowAllOrigins }));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limiting: tighten on auth routes only (login/bootstrap/reset flows and auth mutations).
// Other API routes may have their own protections; avoid a broad mutating limiter that can interfere with match operations.
const authBuckets = new Map<string, { count: number; reset: number }>();
function authRateLimit(max: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
    const key = `${String(ip).split(',')[0].trim()}:${req.method}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const cur = authBuckets.get(key);
    if (!cur || now > cur.reset) authBuckets.set(key, { count: 1, reset: now + windowMs });
    else cur.count += 1;
    const b = authBuckets.get(key)!;
    if (b.count > max) {
      return res.status(429).json({ success: false, error: { message: 'Too many requests, please try again later' }, timestamp: new Date().toISOString() });
    }
    return next();
  };
}
// Stricter limits for sensitive auth endpoints (controller also enforces lockout/generic responses)
app.use('/api/v1/auth/login', authRateLimit(20, 60_000));
app.use('/api/v1/auth/bootstrap', authRateLimit(10, 60_000));
app.use('/api/v1/auth/forgot-password', authRateLimit(10, 60_000));
app.use('/api/v1/auth/reset-password', authRateLimit(15, 60_000));
app.use('/api/v1/auth/change-password', authRateLimit(20, 60_000));
app.use('/api/v1/auth', authRateLimit(120, 60_000)); // general cap for other auth routes

// static uploads (local/offline)
const uploadsPath = path.isAbsolute(env.UPLOADS_DIR) ? env.UPLOADS_DIR : path.resolve(process.cwd(), env.UPLOADS_DIR);
fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

// Request logging middleware
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.url}`);
  next();
});

// Authentication middleware (injects user context if token present)
app.use(authenticate);

// API routes
app.use('/api', apiRouter);

function resolveClientDist() {
  if (env.CLIENT_DIST_DIR) return path.resolve(env.CLIENT_DIST_DIR);
  const candidates = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(process.cwd(), '../../client/dist'),
  ];
  return candidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || candidates[0];
}

async function printStartupInfo(port: number) {
  const lanHosts = getLanAddresses();
  const devPort = Number(process.env.CLIENT_DEV_PORT || 5173);
  const uiPort = serveClient ? port : devPort;
  const lan = lanHosts[0] || 'localhost';
  const court = '1';
  const base = publicBaseUrl || `http://${lan}:${uiPort}`;
  const outUrls = {
    scorebug: `${base}/out/court/${encodeURIComponent(court)}/scorebug`,
    graphics: `${base}/out/court/${encodeURIComponent(court)}/graphics`,
    all: `${base}/out/court/${encodeURIComponent(court)}/all`,
  };
  const lines: string[] = [];
  lines.push('');
  lines.push('Qwesie TV ready');
  lines.push(`  Console:    ${base}/`);
  lines.push(`  Live:       ${base}/live`);
  lines.push(`  Mode:       ${serveClient ? 'production (server port)' : `dev (Vite port ${uiPort})`}`);
  lines.push('  Stable court outputs (configure once in OBS):');
  lines.push(`    Scorebug: ${outUrls.scorebug}`);
  lines.push(`    Graphics: ${outUrls.graphics}`);
  lines.push(`    All:      ${outUrls.all}`);
  if (lanHosts.length > 1) lines.push(`  Other LAN IPv4: ${lanHosts.slice(1).join(', ')}`);
  logger.info(lines.join('\n'));

  try {
    // @ts-ignore
    const mod = await import('qrcode-terminal');
    const qrcode = (mod as any).default || mod;
    for (const [label, url] of Object.entries(outUrls)) {
      await new Promise<void>((resolve) => {
        qrcode.generate(url, { small: true }, (qr: string) => {
          // eslint-disable-next-line no-console
          console.log(`\n${label.toUpperCase()} URL: ${url}\n${qr}`);
          resolve();
        });
      });
    }
  } catch {
    logger.info(`Output URLs: ${JSON.stringify(outUrls)}`);
  }
}

if (serveClient) {
  const clientDist = resolveClientDist();
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
    logger.info(`Serving client from ${clientDist}`);
  } else {
    logger.warn(`Client dist not found at ${clientDist} (build client to enable same-port serving).`);
  }
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'Qwesie TV Broadcast & Scoring API',
      version: '1.0.0',
      status: 'online',
      docs: '/api/v1/health',
    });
  });
}

// Global error handler (must be registered after routes)
app.use(errorHandler);

// Initialize real-time Socket.IO
initSocketServer(server, allowAllOrigins ? '*' : Array.from(allowedOriginSet).join(','));

// Start server
async function start() {
  try {
    try {
      await connectDatabase();
      await ensureDevUser();
      void import('./utils/setupToken.js').then(m => m.ensureSetupTokenIfNeeded?.()).catch(() => {});
    } catch (dbErr) {
      logger.warn('Database connection warning: PostgreSQL may be unavailable. Server will continue with lazy connection attempts where possible.');
    }

    server.listen(env.PORT, () => {
      logger.info(`Qwesie TV Server listening on port ${env.PORT} (${env.NODE_ENV})`);
      logger.info(`Socket.IO server ready on port ${env.PORT}`);
      logger.info(`REST API base path: http://localhost:${env.PORT}/api/v1`);
      void printStartupInfo(env.PORT);
      startBackupScheduler();
      void import('./services/broadcast.service.js').then(m => m.recoverBroadcastTimers?.()).catch((e) => logger.warn(`Broadcast recovery skipped: ${(e as Error)?.message || e}`));
    });
  } catch (error) {
    logger.error('Fatal server startup error:', error);
    process.exit(1);
  }
}

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('HTTP and Socket.IO servers closed.');
      process.exit(0);
    });
  });
});

start();
