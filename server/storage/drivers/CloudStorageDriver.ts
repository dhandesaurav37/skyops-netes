import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { IStorageDriver, StorageCategory, StorageObjectMetadata, StorageUploadResult } from '../types';
import { MemoryStorageDriver } from './MemoryStorageDriver';

export interface CloudStorageConfig {
  bucketName: string;
  projectId?: string;
  apiKey?: string;
  accessToken?: string;
  useFallbackOnFailure?: boolean;
}

/** Server-only Google Cloud Storage driver. Admin credentials bypass client rules;
 * authorization remains at the API boundary and Storage rules stay restrictive. */
export class CloudStorageDriver implements IStorageDriver {
  public readonly driverName = 'firebase-cloud-storage';
  private readonly bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>;
  private readonly fallbackDriver: MemoryStorageDriver;
  private readonly useFallbackOnFailure: boolean;

  constructor(config: CloudStorageConfig) {
    const bucketName = config.bucketName.replace(/^gs:\/\//, '').trim();
    const app = getApps()[0] || initializeApp({
      projectId: config.projectId || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
      credential: applicationDefault(),
      storageBucket: bucketName
    });
    this.bucket = getStorage(app).bucket(bucketName);
    this.useFallbackOnFailure = config.useFallbackOnFailure ?? process.env.NODE_ENV !== 'production';
    this.fallbackDriver = new MemoryStorageDriver(bucketName);
  }

  public async upload(storagePath: string, buffer: Buffer, metadata: StorageObjectMetadata): Promise<StorageUploadResult> {
    try {
      const file = this.bucket.file(storagePath);
      const customMetadata: Record<string, string> = {
        orgId: metadata.orgId,
        category: metadata.category,
        filename: metadata.filename,
        checksumSha256: metadata.checksumSha256
      };
      for (const [key, value] of Object.entries(metadata.customMetadata || {})) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') customMetadata[key] = String(value);
      }
      await file.save(buffer, {
        resumable: false,
        validation: 'crc32c',
        metadata: { contentType: metadata.contentType, metadata: customMetadata }
      });
      return {
        storagePath,
        storageBucket: this.bucket.name,
        sizeBytes: buffer.length,
        checksumSha256: metadata.checksumSha256,
        contentType: metadata.contentType,
        publicUrl: `gs://${this.bucket.name}/${storagePath}`,
        metadata: customMetadata
      };
    } catch (err) {
      if (this.useFallbackOnFailure) return this.fallbackDriver.upload(storagePath, buffer, metadata);
      throw err;
    }
  }

  public async download(storagePath: string): Promise<Buffer> {
    try {
      const [contents] = await this.bucket.file(storagePath).download();
      return contents;
    } catch (err) {
      if (this.useFallbackOnFailure && await this.fallbackDriver.exists(storagePath)) return this.fallbackDriver.download(storagePath);
      throw err;
    }
  }

  public async delete(storagePath: string): Promise<boolean> {
    try {
      await this.bucket.file(storagePath).delete({ ignoreNotFound: true });
      await this.fallbackDriver.delete(storagePath);
      return true;
    } catch (err) {
      if (this.useFallbackOnFailure) return this.fallbackDriver.delete(storagePath);
      throw err;
    }
  }

  public async exists(storagePath: string): Promise<boolean> {
    try {
      const [exists] = await this.bucket.file(storagePath).exists();
      return exists;
    } catch (err) {
      if (this.useFallbackOnFailure) return this.fallbackDriver.exists(storagePath);
      throw err;
    }
  }

  public async getMetadata(storagePath: string): Promise<StorageObjectMetadata | null> {
    try {
      const [metadata] = await this.bucket.file(storagePath).getMetadata();
      const customMetadata = metadata.metadata || {};
      return {
        orgId: String(customMetadata.orgId || ''),
        category: String(customMetadata.category || 'incident-artifacts') as StorageCategory,
        filename: String(customMetadata.filename || storagePath.split('/').pop() || storagePath),
        contentType: metadata.contentType || 'application/octet-stream',
        sizeBytes: Number(metadata.size || 0),
        checksumSha256: String(customMetadata.checksumSha256 || '')
      };
    } catch (err: any) {
      if (err?.code === 404) return this.useFallbackOnFailure ? this.fallbackDriver.getMetadata(storagePath) : null;
      if (this.useFallbackOnFailure) return this.fallbackDriver.getMetadata(storagePath);
      throw err;
    }
  }

  public async getDownloadUrl(storagePath: string): Promise<string> {
    const [url] = await this.bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000
    });
    return url;
  }
}
