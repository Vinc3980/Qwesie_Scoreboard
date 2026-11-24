import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';

const uploadsPath = path.isAbsolute(env.UPLOADS_DIR) ? env.UPLOADS_DIR : path.resolve(process.cwd(), env.UPLOADS_DIR);
fs.mkdirSync(uploadsPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const base = path.basename(file.originalname || 'upload', ext).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

export const uploadMiddleware = multer({ storage }).single('file');

export class UploadsController {
  static upload(req: Request, res: Response) {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ success: false, error: { message: 'file is required' }, timestamp: new Date().toISOString() });
    const url = `/uploads/${file.filename}`;
    res.json({ success: true, data: { url, filename: file.filename, originalName: file.originalname, size: file.size, mimetype: file.mimetype }, timestamp: new Date().toISOString() });
  }
}
