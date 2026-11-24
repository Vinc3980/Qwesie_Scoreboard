import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from '../config/database.js';

function pad(n: number) { return String(n).padStart(2, '0'); }
function timestamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function resolveBackupDir() {
  return path.isAbsolute(env.BACKUP_DIR) ? env.BACKUP_DIR : path.resolve(process.cwd(), env.BACKUP_DIR);
}

function isWindows() { return process.platform === 'win32'; }

function resolvePgDumpCommand(): { cmd: string; argsPrefix: string[] } {
  // Allow explicit path/command (absolute, relative, or on PATH). On Windows, prefer .exe if a bare name is given.
  let cmd = (env.PG_DUMP_PATH || 'pg_dump').trim() || 'pg_dump';
  if (isWindows() && !path.extname(cmd) && !cmd.includes('/') && !cmd.includes('\\')) {
    // keep as-is for PATH resolution; spawn handles it
  }
  return { cmd, argsPrefix: [] };
}

function toPgDumpUrl(dbUrl: string) {
  try {
    const u = new URL(dbUrl);
    u.searchParams.delete('schema'); // Prisma query param not understood by pg_dump
    return u.toString();
  } catch {
    return dbUrl;
  }
}

function visibleBackupLog(level: 'info' | 'warn' | 'error', msg: string) {
  const line = `[backup] ${msg}`;
  try { logger[level](line); } catch {}
  // Also print directly to console so failures/status are visible in interactive terminals/log collectors.
  try {
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
  } catch {}
}

export type BackupResult = { ok: boolean; file?: string; reason: string; error?: string };

export async function runBackup(reason = 'manual'): Promise<string | null> {
  const dir = resolveBackupDir();
  const startedAt = Date.now();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `qwesie-tv-${reason}-${timestamp()}.sql`);
    const pgUrl = toPgDumpUrl(env.DATABASE_URL);
    const { cmd } = resolvePgDumpCommand();
    visibleBackupLog('info', `Starting backup (${reason}) using ${cmd} -> ${file}`);

    await new Promise<void>((resolve, reject) => {
      // Use spawn with argument array (cross-platform). On Windows, pg_dump is an exe; shell not required.
      const child = spawn(cmd, [pgUrl], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      const out = fs.createWriteStream(file);
      let err = '';
      child.stdout.pipe(out);
      child.stderr.on('data', (d) => { err += String(d); });
      child.on('error', (e) => reject(e));
      child.on('close', (code) => {
        out.end();
        if (code === 0) resolve();
        else reject(new Error((err || '').trim() || `pg_dump exited with code ${code}`));
      });
    });

    visibleBackupLog('info', `Backup created (${reason}) in ${Date.now() - startedAt}ms: ${file}`);
    try { await pruneBackups(dir); } catch (e: any) { visibleBackupLog('warn', `Retention/prune skipped: ${e?.message || e}`); }
    return file;
  } catch (e: any) {
    const msg = e?.message || String(e);
    // Log failures visibly in console (not only server logs)
    visibleBackupLog('error', `Backup FAILED (${reason}): ${msg}`);
    visibleBackupLog('error', `Backup config: PG_DUMP_PATH=${env.PG_DUMP_PATH || 'pg_dump'}, BACKUP_DIR=${dir}, platform=${process.platform}`);
    return null;
  }
}

function parseBackupFileTime(name: string): Date | null {
  // qwesie-tv-<reason>-YYYYMMDD-HHMMSS.sql
  const m = name.match(/-(\d{8})-(\d{6})\.sql$/i);
  if (!m) return null;
  const y = Number(m[1].slice(0, 4)), mo = Number(m[1].slice(4, 6)) - 1, d = Number(m[1].slice(6, 8));
  const hh = Number(m[2].slice(0, 2)), mm = Number(m[2].slice(2, 4)), ss = Number(m[2].slice(4, 6));
  const dt = new Date(y, mo, d, hh, mm, ss);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function pruneBackups(dir = resolveBackupDir()) {
  const keepRecent = Math.max(0, Number(env.BACKUP_KEEP || 48));
  const keepDailyDays = Math.max(0, Number(env.BACKUP_KEEP_DAILY_DAYS || 7));
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir)
    .filter(f => /^qwesie-tv-.*\.sql$/i.test(f))
    .map(f => {
      const full = path.join(dir, f);
      let st: fs.Stats | null = null;
      try { st = fs.statSync(full); } catch { st = null; }
      const t = parseBackupFileTime(f) || (st ? st.mtime : null);
      return { f, full, time: t ? t.getTime() : 0, st };
    })
    .filter(e => e.st && e.st.isFile())
    .sort((a, b) => b.time - a.time);

  const keep = new Set<string>();
  // keep N most recent
  for (const e of entries.slice(0, keepRecent)) keep.add(e.f);

  // keep one per day for last D days (oldest-in-day among available as stable daily representative? choose newest per day)
  if (keepDailyDays > 0) {
    const cutoff = Date.now() - keepDailyDays * 24 * 60 * 60 * 1000;
    const byDay = new Map<string, typeof entries[number]>();
    for (const e of entries) {
      if (e.time < cutoff) continue;
      const k = dayKey(new Date(e.time));
      const prev = byDay.get(k);
      if (!prev || e.time > prev.time) byDay.set(k, e); // newest per day
    }
    for (const e of byDay.values()) keep.add(e.f);
  }

  const toDelete = entries.filter(e => !keep.has(e.f));
  for (const e of toDelete) {
    try { fs.unlinkSync(e.full); } catch {}
  }
  if (toDelete.length) {
    visibleBackupLog('info', `Retention applied: kept ${keep.size}, removed ${toDelete.length} old backup(s) (keepRecent=${keepRecent}, keepDailyDays=${keepDailyDays}).`);
  }
}

export function startBackupScheduler() {
  const intervalMs = Math.max(1, Number(env.BACKUP_INTERVAL_MINUTES || 5)) * 60 * 1000;
  if (env.BACKUP_ON_START) {
    void runBackup('startup');
  }
  setInterval(async () => {
    try {
      const live = await prisma.match.count({ where: { status: { in: ['LIVE','PAUSED','BETWEEN_SETS','SUSPENDED','READY'] as any } } });
      if (live > 0) await runBackup('live-interval');
    } catch {
      // db may be unavailable
    }
  }, intervalMs);
  visibleBackupLog('info', `Scheduler active (onStart=${env.BACKUP_ON_START}, interval=${env.BACKUP_INTERVAL_MINUTES}m during live/ready matches, keepRecent=${env.BACKUP_KEEP}, keepDailyDays=${env.BACKUP_KEEP_DAILY_DAYS}).`);
}
