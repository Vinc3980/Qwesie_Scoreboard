import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env.js';
import type { StorageDriver } from './types.js';

function uploadsRoot() {
  return path.isAbsolute(env.UPLOADS_DIR) ? env.UPLOADS_DIR : path.resolve(process.cwd(), env.UPLOADS_DIR);
}

function safeKey(key: string): string {
  const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) throw new Error('Invalid storage key');
  return normalized;
}

export class LocalStorageDriver implements StorageDriver {
  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const k = safeKey(key);
    const full = path.join(uploadsRoot(), k);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async delete(key: string): Promise<void> {
    const k = safeKey(key);
    const full = path.join(uploadsRoot(), k);
    try { await fs.unlink(full); } catch (e: any) { if (e?.code !== 'ENOENT') throw e; }
  }

  publicUrl(key: string): string {
    const k = safeKey(key);
    return `/uploads/${k}`;
  }
}
