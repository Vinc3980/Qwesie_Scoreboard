import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { LocalStorageDriver } from './local.driver.js';
import { isObjectKey, resolveStoredUrl } from './index.js';
import sharp from 'sharp';
import { processImageUpload } from './image.js';

const origUploadsDir = env.UPLOADS_DIR;
const origDriver = env.STORAGE_DRIVER;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qwesie-storage-'));
  (env as any).UPLOADS_DIR = tmpDir;
  (env as any).STORAGE_DRIVER = 'local';
});

afterEach(async () => {
  (env as any).UPLOADS_DIR = origUploadsDir;
  (env as any).STORAGE_DRIVER = origDriver;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('LocalStorageDriver', () => {
  it('puts, resolves, and deletes an object', async () => {
    const driver = new LocalStorageDriver();
    const key = 'players/photos/test.webp';
    const body = Buffer.from('hello-image');
    await driver.put(key, body, 'image/webp');

    const full = path.join(tmpDir, 'players/photos/test.webp');
    await expect(fs.readFile(full)).resolves.toEqual(body);
    expect(driver.publicUrl(key)).toBe('/uploads/players/photos/test.webp');

    await driver.delete(key);
    await expect(fs.stat(full)).rejects.toBeTruthy();
  });

  it('delete is idempotent for missing objects', async () => {
    const driver = new LocalStorageDriver();
    await expect(driver.delete('missing/file.webp')).resolves.toBeUndefined();
  });

  it('rejects path traversal keys', async () => {
    const driver = new LocalStorageDriver();
    await expect(driver.put('../evil.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow();
    expect(() => driver.publicUrl('../evil.webp')).toThrow();
  });
});

describe('storage url helpers', () => {
  it('treats keys and legacy urls correctly', () => {
    expect(isObjectKey('teams/logos/a.webp')).toBe(true);
    expect(isObjectKey('/uploads/teams/a.webp')).toBe(false);
    expect(isObjectKey('https://cdn.example.com/a.webp')).toBe(false);
    expect(resolveStoredUrl('/uploads/a.webp')).toBe('/uploads/a.webp');
    expect(resolveStoredUrl('https://cdn.example.com/a.webp')).toBe('https://cdn.example.com/a.webp');
  });
});

describe('processImageUpload', () => {
  it('rejects unsupported mime type', async () => {
    await expect(processImageUpload({ buffer: Buffer.from('not-image'), mimeType: 'image/gif', scope: 'player-photo' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects oversized files', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    await expect(processImageUpload({ buffer: big, mimeType: 'image/png', scope: 'team-logo' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('generates main and thumb webp images', async () => {
    const input = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: { r: 20, g: 120, b: 220 } },
    }).png().toBuffer();

    const out = await processImageUpload({ buffer: input, mimeType: 'image/png', scope: 'player-photo' });
    expect(out.mainKey).toMatch(/^players\/photos\/.+\.webp$/);
    expect(out.thumbKey).toMatch(/^players\/photos\/.+\.thumb\.webp$/);
    const mainMeta = await sharp(out.main).metadata();
    const thumbMeta = await sharp(out.thumb).metadata();
    expect(mainMeta.format).toBe('webp');
    expect(thumbMeta.format).toBe('webp');
    expect(mainMeta.width).toBe(900);
    expect(mainMeta.height).toBe(1200);
    expect(thumbMeta.width).toBe(160);
    expect(thumbMeta.height).toBe(160);
  });
});
