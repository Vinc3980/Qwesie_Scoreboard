import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import type { StorageDriver } from './types.js';

function safeKey(key: string): string {
  const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) throw new Error('Invalid storage key');
  return normalized;
}

export class S3StorageDriver implements StorageDriver {
  private client: S3Client;
  private bucket: string;
  private baseUrl: string;

  constructor() {
    this.bucket = String(env.STORAGE_BUCKET || '').trim();
    this.baseUrl = String(env.STORAGE_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    this.client = new S3Client({
      region: env.STORAGE_REGION || 'auto',
      endpoint: env.STORAGE_ENDPOINT || undefined,
      forcePathStyle: true,
      credentials: {
        accessKeyId: String(env.STORAGE_ACCESS_KEY_ID || ''),
        secretAccessKey: String(env.STORAGE_SECRET_ACCESS_KEY || ''),
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const k = safeKey(key);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: k,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  }

  async delete(key: string): Promise<void> {
    const k = safeKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: k }));
    } catch (e: any) {
      // Ignore missing-object style errors; S3 delete is usually idempotent anyway.
      const status = e?.$metadata?.httpStatusCode;
      if (status === 404) return;
      throw e;
    }
  }

  publicUrl(key: string): string {
    const k = safeKey(key);
    return `${this.baseUrl}/${k}`;
  }
}
