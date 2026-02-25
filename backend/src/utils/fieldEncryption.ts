/**
 * Field-Level Encryption Utility
 * Provides mongoose pre/post hooks for encrypting/decrypting specific fields
 * Enables transparent encryption at the model level
 */

import { encryptData, decryptData } from './cryptoUtils';
import logger from './logger';

/**
 * Create a mongoose pre-save hook for field encryption
 * Encrypts specified fields before saving to database
 */
export function createEncryptionPreSaveHook(fieldsToEncrypt: string[], encryptionKey: string) {
  return function (this: any, next: any) {
    try {
      // Encrypt specified fields
      for (const field of fieldsToEncrypt) {
        if (this[field] && this.isModified(field)) {
          const encrypted = encryptData(this[field], encryptionKey);
          // Store encrypted value with marker prefix
          this[field] = `encrypted:${encrypted}`;
        }
      }
      next();
    } catch (error: any) {
      logger.error('[ENCRYPTION] Pre-save encryption failed:', error.message);
      next(error);
    }
  };
}

/**
 * Create a mongoose post-fetch hook for field decryption
 * Decrypts specified fields after retrieving from database
 */
export function createDecryptionPostFindHook(fieldsToDecrypt: string[], encryptionKey: string) {
  return function (docs: any, next: any) {
    try {
      // Handle single document or array of documents
      const docArray = Array.isArray(docs) ? docs : docs ? [docs] : [];

      for (const doc of docArray) {
        if (doc && typeof doc === 'object') {
          for (const field of fieldsToDecrypt) {
            if (doc[field] && typeof doc[field] === 'string' && doc[field].startsWith('encrypted:')) {
              try {
                const encryptedPayload = doc[field].substring(10); // Remove 'encrypted:' prefix
                doc[field] = decryptData(encryptedPayload, encryptionKey);
              } catch (error: any) {
                logger.warn(
                  `[ENCRYPTION] Failed to decrypt field ${field}:`,
                  error.message
                );
                // Leave field as-is if decryption fails
              }
            }
          }
        }
      }
      next();
    } catch (error: any) {
      logger.error('[ENCRYPTION] Post-find decryption failed:', error.message);
      next(error);
    }
  };
}

/**
 * Create a mongoose method to explicitly decrypt a field
 * Useful for fields that need to remain encrypted in most queries
 */
export function createDecryptFieldMethod(fieldName: string, encryptionKey: string) {
  return function (this: any): string | null {
    try {
      if (this[fieldName] && typeof this[fieldName] === 'string' && this[fieldName].startsWith('encrypted:')) {
        const encryptedPayload = this[fieldName].substring(10);
        return decryptData(encryptedPayload, encryptionKey);
      }
      return this[fieldName];
    } catch (error: any) {
      logger.warn(`[ENCRYPTION] Failed to decrypt ${fieldName}:`, error.message);
      return null;
    }
  };
}

/**
 * Helper to check if a field value is encrypted
 */
export function isEncrypted(value: any): boolean {
  return typeof value === 'string' && value.startsWith('encrypted:');
}

/**
 * Get encryption key from environment with validation
 */
export function getFieldEncryptionKey(): string {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) {
    logger.warn('[ENCRYPTION] FIELD_ENCRYPTION_KEY not set - field-level encryption disabled');
    return '';
  }
  if (key.length < 12) {
    throw new Error('FIELD_ENCRYPTION_KEY must be at least 12 characters long');
  }
  return key;
}
