export type ImageScope = 'player-photo' | 'team-logo' | 'team-coach' | 'team-photo' | 'generic';

export interface StoredObject {
  key: string;
  url: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface ProcessedImage {
  key: string;
  thumbKey: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  contentType: 'image/webp';
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export interface ImageProcessOptions {
  scope: ImageScope;
  maxBytes?: number;
}
