import { env } from '../config/env.js';
import { LocalStorageDriver } from './local.driver.js';
import { S3StorageDriver } from './s3.driver.js';
import type { StorageDriver } from './types.js';

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  // STORAGE_DRIVER=local is allowed in production as a fallback (ephemeral
  // files, lost on redeploy); env.ts logs a warning at boot.
  driver = env.STORAGE_DRIVER === 's3' ? new S3StorageDriver() : new LocalStorageDriver();
  return driver;
}

export function isObjectKey(value: string | null | undefined): value is string {
  const v = String(value || '').trim();
  if (!v) return false;
  if (/^(https?:\/\/|data:|\/)/i.test(v)) return false;
  return !v.includes('..');
}

export function resolveStoredUrl(keyOrUrl: string | null | undefined): string | null {
  const v = String(keyOrUrl || '').trim();
  if (!v) return null;
  if (/^(https?:\/\/|data:)/i.test(v)) return v;
  if (v.startsWith('/')) return v;
  // Treat as object key
  try { return getStorage().publicUrl(v); } catch { return null; }
}

export function resolveImageFields(fields: {
  key?: string | null;
  thumbKey?: string | null;
  legacyUrl?: string | null;
}) {
  const url = resolveStoredUrl(fields.key) || resolveStoredUrl(fields.legacyUrl);
  const thumbUrl = resolveStoredUrl(fields.thumbKey) || url;
  return { url, thumbUrl };
}

export function publicUrlForKey(key: string | null | undefined): string | null {
  const v = String(key || '').trim();
  if (!v) return null;
  return resolveStoredUrl(v);
}

export * from './types.js';
export * from './image.js';
