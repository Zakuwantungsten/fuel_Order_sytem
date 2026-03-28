import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import logger from '../utils/logger';
import { Readable } from 'stream';

class R2Service {
  private client: S3Client | null = null;
  private bucketName: string;
  private enabled: boolean;

  constructor() {
    this.bucketName = config.r2BucketName;
    this.enabled = !!(config.r2Endpoint && config.r2AccessKeyId && config.r2SecretAccessKey);
    
    if (this.enabled) {
      try {
        this.client = new S3Client({
          region: 'auto',
          endpoint: config.r2Endpoint,
          credentials: {
            accessKeyId: config.r2AccessKeyId,
            secretAccessKey: config.r2SecretAccessKey,
          },
        });
        logger.info('R2 service initialized successfully');
      } catch (error) {
        logger.warn('Failed to initialize R2 service:', error);
        this.enabled = false;
      }
    } else {
      logger.debug('R2 service is not configured. Backup functionality will be limited.');
    }
  }

  /**
   * Check if R2 is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Upload a file to R2
   * ✅ SECURITY: Enforces private ACL to prevent public file exposure
   * @param bucket Optional bucket override (defaults to the assets bucket). Pass
   *   `config.r2BackupBucketName` to route backups to the dedicated backup bucket.
   */
  async uploadFile(key: string, body: Buffer | Readable, contentType?: string, bucket?: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('R2 service is not configured. Please set R2 credentials in .env file.');
    }

    try {
      const upload = new Upload({
        client: this.client!,
        params: {
          Bucket: bucket ?? this.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType || 'application/gzip',
          ACL: 'private', // ✅ SECURITY: Ensure files are private by default
        },
      });

      await upload.done();
      logger.info(`File uploaded to R2: ${key}`);
      return key;
    } catch (error) {
      logger.error('Error uploading to R2:', error);
      throw new Error('Failed to upload file to cloud storage');
    }
  }

  /**
   * Download a file from R2
   * @param bucket Optional bucket override (defaults to the assets bucket).
   */
  async downloadFile(key: string, bucket?: string): Promise<Readable> {
    if (!this.isEnabled()) {
      throw new Error('R2 service is not configured');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: bucket ?? this.bucketName,
        Key: key,
      });

      const response = await this.client!.send(command);
      
      if (!response.Body) {
        throw new Error('No body in response');
      }

      return response.Body as Readable;
    } catch (error) {
      logger.error('Error downloading from R2:', error);
      throw new Error('Failed to download file from cloud storage');
    }
  }

  /**
   * Delete a file from R2
   * @param bucket Optional bucket override (defaults to the assets bucket).
   */
  async deleteFile(key: string, bucket?: string): Promise<void> {
    if (!this.isEnabled()) {
      throw new Error('R2 service is not configured');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket ?? this.bucketName,
        Key: key,
      });

      await this.client!.send(command);
      logger.info(`File deleted from R2: ${key}`);
    } catch (error) {
      logger.error('Error deleting from R2:', error);
      throw new Error('Failed to delete file from cloud storage');
    }
  }

  /**
   * Get a signed URL for downloading
   * @param bucket Optional bucket override (defaults to the assets bucket).
   */
  async getSignedDownloadUrl(key: string, expiresIn: number = 3600, bucket?: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('R2 service is not configured');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: bucket ?? this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.client!, command, { expiresIn });
      return url;
    } catch (error) {
      logger.error('Error generating signed URL:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * List files in R2
   * @param bucket Optional bucket override (defaults to the assets bucket).
   */
  async listFiles(prefix?: string, bucket?: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    if (!this.isEnabled()) {
      throw new Error('R2 service is not configured');
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: bucket ?? this.bucketName,
        Prefix: prefix,
      });

      const response = await this.client!.send(command);
      
      return (response.Contents || []).map(item => ({
        key: item.Key!,
        size: item.Size!,
        lastModified: item.LastModified!,
      }));
    } catch (error) {
      logger.error('Error listing files from R2:', error);
      throw new Error('Failed to list files from cloud storage');
    }
  }

  /**
   * Upload a public asset (e.g. company logo) to R2 and return its public URL.
   * Requires R2_PUBLIC_URL to be set in env.
   */
  async uploadLogoToR2(buffer: Buffer, key: string, contentType: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('R2 service is not configured');
    }

    const publicBase = config.r2PublicUrl?.replace(/\/$/, '');
    if (!publicBase) {
      throw new Error('R2_PUBLIC_URL is not set. Cannot serve uploaded logo publicly.');
    }

    const upload = new Upload({
      client: this.client!,
      params: {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
      },
    });

    await upload.done();
    const publicUrl = `${publicBase}/${key}`;
    logger.info(`Logo uploaded to R2: ${publicUrl}`);
    return publicUrl;
  }

  /**
   * Check if file exists
   * @param bucket Optional bucket override (defaults to the assets bucket).
   */
  async fileExists(key: string, bucket?: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: bucket ?? this.bucketName,
        Key: key,
      });

      await this.client!.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }
}

export default new R2Service();
