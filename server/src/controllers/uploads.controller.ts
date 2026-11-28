import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { IMAGE_MAX_BYTES, isAllowedImageMime, processImageUpload } from '../storage/image.js';
import { getStorage } from '../storage/index.js';
import type { ImageScope } from '../storage/types.js';
import { AppError } from '../utils/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedImageMime(file.mimetype)) return cb(null, true);
    return cb(new AppError('Only JPEG, PNG, and WebP images are allowed', 400));
  },
});

const rawUpload = upload.single('file');
export function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  rawUpload(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: { message: 'Image exceeds 5 MB limit' }, timestamp: new Date().toISOString() });
    }
    if (err instanceof AppError) {
      return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message }, timestamp: new Date().toISOString() });
    }
    return next(err);
  });
}

function parseScope(req: Request): ImageScope {
  const raw = String((req.body?.scope || req.query?.scope || 'generic') as string).toLowerCase();
  const allowed: ImageScope[] = ['player-photo', 'team-logo', 'team-coach', 'team-photo', 'generic'];
  return (allowed.includes(raw as ImageScope) ? raw : 'generic') as ImageScope;
}

export class UploadsController {
  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ success: false, error: { message: 'file is required' }, timestamp: new Date().toISOString() });
      if (!file.buffer?.length) return res.status(400).json({ success: false, error: { message: 'Empty image upload' }, timestamp: new Date().toISOString() });

      const scope = parseScope(req);
      const processed = await processImageUpload({
        buffer: file.buffer,
        mimeType: file.mimetype,
        scope,
        originalName: file.originalname,
      });

      const storage = getStorage();
      await storage.put(processed.mainKey, processed.main, 'image/webp');
      await storage.put(processed.thumbKey, processed.thumb, 'image/webp');

      const url = storage.publicUrl(processed.mainKey);
      const thumbUrl = storage.publicUrl(processed.thumbKey);
      return res.json({
        success: true,
        data: {
          url,
          thumbUrl,
          key: processed.mainKey,
          thumbKey: processed.thumbKey,
          width: processed.width,
          height: processed.height,
          contentType: 'image/webp',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      return next(e);
    }
  }
}
