import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

export interface IStorageService {
  uploadFile(filePath: string, destinationName: string): Promise<string>;
}

export class LocalStorageService implements IStorageService {
  private storagePath: string;

  constructor(storagePath: string = 'recordings') {
    this.storagePath = path.resolve(storagePath);
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async uploadFile(filePath: string, destinationName: string): Promise<string> {
    const destPath = path.join(this.storagePath, destinationName);
    logger.info(`LocalStorage: Moving ${filePath} to ${destPath}`);

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    await fs.promises.rename(filePath, destPath);
    return destinationName; // Return filename relative to storage root
  }
}

export class S3StorageService implements IStorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET || '';
    if (!this.bucketName) {
      throw new Error('AWS_S3_BUCKET is not defined');
    }

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      endpoint: process.env.AWS_ENDPOINT, // Optional, for S3 compatible storage like MinIO
      forcePathStyle: process.env.AWS_FORCE_PATH_STYLE === 'true',
    });
  }

  async uploadFile(filePath: string, destinationName: string): Promise<string> {
    logger.info(`S3Storage: Uploading ${filePath} to ${this.bucketName}/${destinationName}`);

    const fileStream = fs.createReadStream(filePath);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucketName,
        Key: destinationName,
        Body: fileStream,
      },
    });

    await upload.done();

    // Clean up local file after successful upload
    try {
        await fs.promises.unlink(filePath);
        logger.info(`S3Storage: Deleted local file ${filePath} after upload.`);
    } catch (err) {
        logger.warn(`S3Storage: Failed to delete local file ${filePath}: ${err}`);
    }

    return `s3://${this.bucketName}/${destinationName}`;
  }
}

export function getStorageService(): IStorageService {
  if (process.env.STORAGE_DRIVER === 's3') {
    return new S3StorageService();
  }
  return new LocalStorageService(process.env.LOCAL_STORAGE_PATH || 'recordings');
}
