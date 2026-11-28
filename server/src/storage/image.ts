import crypto from 'crypto';
import sharp from 'sharp';
import { AppError } from '../utils/errors.js';
import type { ImageScope, ProcessedImage } from './types.js';

const ALLOWED = new Map<string, 'jpeg' | 'png' | 'webp'>([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const SCOPE_SIZE: Record<ImageScope, { width: number; height: number; thumb: number }> = {
  'player-photo': { width: 900, height: 1200, thumb: 160 },
  'team-logo': { width: 512, height: 512, thumb: 160 },
  'team-coach': { width: 512, height: 512, thumb: 160 },
  'team-photo': { width: 1200, height: 675, thumb: 320 },
  generic: { width: 1200, height: 1200, thumb: 160 },
};

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function processImageUpload(input: {
  buffer: Buffer;
  mimeType: string;
  scope: ImageScope;
  originalName?: string;
}): Promise<{ main: Buffer; thumb: Buffer; width: number; height: number; mainKey: string; thumbKey: string }> {
  const kind = ALLOWED.get(String(input.mimeType || '').toLowerCase());
  if (!kind) {
    throw new AppError('Only JPEG, PNG, and WebP images are allowed', 400);
  }
  if (!input.buffer?.length) throw new AppError('Empty image upload', 400);
  if (input.buffer.length > IMAGE_MAX_BYTES) {
    throw new AppError('Image exceeds 5 MB limit', 400);
  }

  const dims = SCOPE_SIZE[input.scope] || SCOPE_SIZE.generic;
  let meta;
  try {
    meta = await sharp(input.buffer, { failOn: 'error' }).rotate().metadata();
  } catch {
    throw new AppError('Invalid or unsupported image file', 400);
  }
  const srcW = meta.width || 0;
  const srcH = meta.height || 0;
  if (srcW < 64 || srcH < 64) throw new AppError('Image dimensions are too small', 400);
  if (srcW > 8000 || srcH > 8000) throw new AppError('Image dimensions are too large', 400);

  const id = crypto.randomUUID();
  const prefix = scopePrefix(input.scope);
  const mainKey = `${prefix}/${id}.webp`;
  const thumbKey = `${prefix}/${id}.thumb.webp`;

  const base = sharp(input.buffer, { failOn: 'error' }).rotate();
  const main = await base.clone()
    .resize(dims.width, dims.height, { fit: 'cover', position: 'centre', withoutEnlargement: false })
    .webp({ quality: 82 })
    .toBuffer();
  const thumb = await sharp(input.buffer, { failOn: 'error' }).rotate()
    .resize(dims.thumb, dims.thumb, { fit: 'cover', position: 'centre', withoutEnlargement: false })
    .webp({ quality: 78 })
    .toBuffer();

  const mainMeta = await sharp(main).metadata();
  return {
    main,
    thumb,
    width: mainMeta.width || dims.width,
    height: mainMeta.height || dims.height,
    mainKey,
    thumbKey,
  };
}

function scopePrefix(scope: ImageScope): string {
  switch (scope) {
    case 'player-photo': return 'players/photos';
    case 'team-logo': return 'teams/logos';
    case 'team-coach': return 'teams/coaches';
    case 'team-photo': return 'teams/photos';
    default: return 'uploads';
  }
}

export function isAllowedImageMime(mimeType: string): boolean {
  return ALLOWED.has(String(mimeType || '').toLowerCase());
}
