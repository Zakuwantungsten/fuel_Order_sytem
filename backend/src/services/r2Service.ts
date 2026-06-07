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

  // Secondary backup destination (geo/provider redundancy)
  private secondaryClient: S3Client | null = null;
  private secondaryBucket: string;
  private secondaryEnabled: boolean;

  constructor() {
    this.bucketName = config.r2BucketName;
    this.enabled = !!(config.r2Endpoint && config.r2AccessKeyId && config.r2SecretAccessKey);

    if (this.enabled) {
      try {
        this.client = new S3Client({
          region: config.r2Region,
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

    // Optional secondary backup destination. If endpoint/creds are blank, reuse
    // the primary R2 account (same account, different bucket).
    this.secondaryBucket = config.r2BackupBucketNameSecondary;
    const secEndpoint = config.r2SecondaryEndpoint || config.r2Endpoint;
    const secKeyId = config.r2SecondaryAccessKeyId || config.r2AccessKeyId;
    const secSecret = config.r2SecondarySecretAccessKey || config.r2SecretAccessKey;
    this.secondaryEnabled = !!(this.secondaryBucket && secEndpoint && secKeyId && secSecret);

    if (this.secondaryEnabled) {
      try {
        this.secondaryClient = new S3Client({
          // R2 uses 'auto'; Backblaze B2 and other S3 providers require the real
          // region (e.g. 'us-west-004') to match the SigV4 signature.
          region: config.r2SecondaryRegion,
          endpoint: secEndpoint,
          credentials: { accessKeyId: secKeyId, secretAccessKey: secSecret },
        });
        const sameAccount = !config.r2SecondaryEndpoint;
        const provider = /backblazeb2\.com/i.test(secEndpoint) ? 'Backblaze B2' : (sameAccount ? 'same account' : 'separate account/provider');
        logger.info(`Secondary backup destination enabled: bucket "${this.secondaryBucket}" (${provider}, region: ${config.r2SecondaryRegion})`);
      } catch (error) {
        logger.warn('Failed to initialize R2 secondary destination:', error);
        this.secondaryEnabled = false;
      }
    }
  }

  /**
   * Check if R2 is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Whether a secondary backup destination is configured (geo/provider redundancy).
   */
  isSecondaryEnabled(): boolean {
    return this.secondaryEnabled && this.secondaryClient !== null;
  }

  getSecondaryBucketName(): string {
    return this.secondaryBucket;
  }

  /**
   * Replicate an object to the secondary backup destination. No-op (returns false)
   * if no secondary is configured. Never throws — replication failures must not
   * break the primary backup.
   */
  async replicateToSecondary(key: string, body: Buffer, contentType?: string): Promise<boolean> {
    if (!this.isSecondaryEnabled()) return false;
    try {
      const upload = new Upload({
        client: this.secondaryClient!,
        params: {
          Bucket: this.secondaryBucket,
          Key: key,
          Body: body,
          ContentType: contentType || 'application/octet-stream',
          ACL: 'private',
        },
      });
      await upload.done();
      logger.info(`[R2] Replicated to secondary backup destination: ${key}`);
      return true;
    } catch (error) {
      logger.error('[R2] Secondary replication failed (non-fatal):', error);
      return false;
    }
  }

  /**
   * Delete an object from the secondary destination (best-effort, never throws).
   */
  async deleteFromSecondary(key: string): Promise<void> {
    if (!this.isSecondaryEnabled()) return;
    try {
      await this.secondaryClient!.send(new DeleteObjectCommand({
        Bucket: this.secondaryBucket,
        Key: key,
      }));
      logger.info(`[R2] Deleted from secondary backup destination: ${key}`);
    } catch (error) {
      logger.warn('[R2] Secondary delete failed (non-fatal):', error);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Secondary destination READ methods (used for disaster-recovery failover).
  // These mirror the primary read methods but use the secondary client/bucket.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Download an object from the secondary backup destination.
   */
  async downloadFromSecondary(key: string): Promise<Readable> {
    if (!this.isSecondaryEnabled()) {
      throw new Error('Secondary backup destination is not configured');
    }
    const command = new GetObjectCommand({ Bucket: this.secondaryBucket, Key: key });
    const response = await this.secondaryClient!.send(command);
    if (!response.Body) {
      throw new Error('No body in secondary response');
    }
    return response.Body as Readable;
  }

  /**
   * List objects in the secondary backup destination.
   */
  async listSecondary(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    if (!this.isSecondaryEnabled()) {
      throw new Error('Secondary backup destination is not configured');
    }
    const command = new ListObjectsV2Command({ Bucket: this.secondaryBucket, Prefix: prefix });
    const response = await this.secondaryClient!.send(command);
    return (response.Contents || []).map(item => ({
      key: item.Key!,
      size: item.Size!,
      lastModified: item.LastModified!,
    }));
  }

  /**
   * Check whether an object exists in the secondary backup destination.
   */
  async fileExistsSecondary(key: string): Promise<boolean> {
    if (!this.isSecondaryEnabled()) return false;
    try {
      await this.secondaryClient!.send(new GetObjectCommand({ Bucket: this.secondaryBucket, Key: key }));
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') return false;
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Failover-aware backup read methods: try primary R2 first, transparently
  // fall back to the secondary destination (B2) if the primary errors or the
  // object is missing. These are what backup restore/list/verify paths use so
  // the existing "Restore" flow keeps working even during a primary outage.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Download a backup object with automatic primary→secondary failover.
   */
  async downloadBackup(key: string): Promise<Readable> {
    let primaryErr: any;
    if (this.isEnabled()) {
      try {
        return await this.downloadFile(key, config.r2BackupBucketName);
      } catch (error: any) {
        primaryErr = error;
        logger.warn(`[R2] Primary download failed for ${key} — attempting secondary failover: ${error?.message}`);
      }
    }
    if (this.isSecondaryEnabled()) {
      logger.warn(`[R2] Failing over to secondary destination (B2) for ${key}`);
      return await this.downloadFromSecondary(key);
    }
    throw new Error(`Failed to download backup "${key}": primary unavailable${primaryErr ? ` (${primaryErr.message})` : ''} and no secondary configured`);
  }

  /**
   * List backup objects with automatic primary→secondary failover.
   */
  async listBackups(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    if (this.isEnabled()) {
      try {
        return await this.listFiles(prefix, config.r2BackupBucketName);
      } catch (error: any) {
        logger.warn(`[R2] Primary list failed for prefix "${prefix}" — attempting secondary failover: ${error?.message}`);
      }
    }
    if (this.isSecondaryEnabled()) {
      logger.warn(`[R2] Failing over to secondary destination (B2) for list "${prefix}"`);
      return await this.listSecondary(prefix);
    }
    throw new Error('Failed to list backups: primary unavailable and no secondary configured');
  }

  /**
   * Check backup existence across primary then secondary.
   */
  async backupExists(key: string): Promise<boolean> {
    if (this.isEnabled()) {
      try {
        if (await this.fileExists(key, config.r2BackupBucketName)) return true;
      } catch (error: any) {
        logger.warn(`[R2] Primary existence check failed for ${key} — checking secondary: ${error?.message}`);
      }
    }
    if (this.isSecondaryEnabled()) {
      return await this.fileExistsSecondary(key);
    }
    return false;
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
