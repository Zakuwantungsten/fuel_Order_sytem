/**
 * Cryptography Utilities
 * Provides AES-256 encryption/decryption for sensitive data at rest
 * Used for backup encryption and field-level encryption
 */

import crypto from 'crypto';
import logger from './logger';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16; // 16 bytes for salt
const IV_LENGTH = 16; // 16 bytes for IV (initialization vector)
const AUTH_TAG_LENGTH = 16; // 16 bytes for authentication tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Derive a key from a password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt data using AES-256-GCM
 * Returns: JSON object with encrypted data, IV, salt, and auth tag for later decryption
 */
export function encryptData(plaintext: string, encryptionKey: string): string {
  try {
    if (!encryptionKey || encryptionKey.length < 12) {
      throw new Error('Encryption key must be at least 12 characters long');
    }

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive encryption key from password
    const key = deriveKey(encryptionKey, salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt plaintext
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return encrypted payload with metadata for decryption
    const encryptedPayload = {
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: ALGORITHM,
    };

    logger.debug('[CRYPTO] Data encrypted successfully');
    return JSON.stringify(encryptedPayload);
  } catch (error: any) {
    logger.error('[CRYPTO] Encryption failed:', error.message);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decryptData(encryptedPayload: string, encryptionKey: string): string {
  try {
    if (!encryptionKey || encryptionKey.length < 12) {
      throw new Error('Encryption key must be at least 12 characters long');
    }

    // Parse encrypted payload
    const payload = JSON.parse(encryptedPayload);

    // Validate payload structure
    if (!payload.encrypted || !payload.iv || !payload.salt || !payload.authTag) {
      throw new Error('Invalid encrypted payload structure');
    }

    // Reconstruct buffers from hex strings
    const salt = Buffer.from(payload.salt, 'hex');
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    const encryptedData = payload.encrypted;

    // Derive key from password using same salt
    const key = deriveKey(encryptionKey, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.debug('[CRYPTO] Data decrypted successfully');
    return decrypted;
  } catch (error: any) {
    logger.error('[CRYPTO] Decryption failed:', error.message);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Encrypt a buffer (for file encryption like backups)
 */
export function encryptBuffer(buffer: Buffer, encryptionKey: string): Buffer {
  try {
    if (!encryptionKey || encryptionKey.length < 12) {
      throw new Error('Encryption key must be at least 12 characters long');
    }

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive encryption key
    const key = deriveKey(encryptionKey, salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt buffer
    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine: salt + iv + authTag + encrypted data
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    logger.debug('[CRYPTO] Buffer encrypted successfully');
    return combined;
  } catch (error: any) {
    logger.error('[CRYPTO] Buffer encryption failed:', error.message);
    throw new Error(`Buffer encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt a buffer (for file decryption like backups)
 * Buffer format: salt(16) + iv(16) + authTag(16) + encrypted data
 */
export function decryptBuffer(encryptedBuffer: Buffer, encryptionKey: string): Buffer {
  try {
    if (!encryptionKey || encryptionKey.length < 12) {
      throw new Error('Encryption key must be at least 12 characters long');
    }

    // Check minimum buffer size
    const minSize = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
    if (encryptedBuffer.length < minSize) {
      throw new Error(`Invalid encrypted buffer: too small (${encryptedBuffer.length} bytes)`);
    }

    // Extract components
    const salt = encryptedBuffer.slice(0, SALT_LENGTH);
    const iv = encryptedBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = encryptedBuffer.slice(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = encryptedBuffer.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from password using same salt
    const key = deriveKey(encryptionKey, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    logger.debug('[CRYPTO] Buffer decrypted successfully');
    return decrypted;
  } catch (error: any) {
    logger.error('[CRYPTO] Buffer decryption failed:', error.message);
    throw new Error(`Buffer decryption failed: ${error.message}`);
  }
}

/**
 * Generate a random encryption key (for default key generation)
 */
export function generateEncryptionKey(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a value using SHA-256 (non-reversible, for comparison)
 */
export function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
