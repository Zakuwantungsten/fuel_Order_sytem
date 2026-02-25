/**
 * File Upload Validation Middleware
 * 
 * Comprehensive file security validation including:
 * - Magic byte verification (actual file type, not just extension)
 * - UUID-based filename renaming (prevent traversal/overwrite attacks)
 * - File size limits
 * - MIME type whitelist
 * - Excel/CSV structure validation
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fileTypeFromBuffer } from 'file-type';
import logger from '../utils/logger';

/**
 * Allowed file types with their magic bytes
 */
const ALLOWED_FILE_TYPES = {
  xlsx: {
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    magicBytes: [0x50, 0x4b, 0x03, 0x04], // PK..
    extensions: ['.xlsx'],
  },
  xls: {
    mimeTypes: ['application/vnd.ms-excel'],
    magicBytes: [0xd0, 0xcf, 0x11, 0xe0], // D0CF
    extensions: ['.xls'],
  },
  csv: {
    // CSV is text, magic bytes are not reliable for CSV
    // Just verify it's text
    mimeTypes: ['text/csv', 'text/plain', 'application/csv', 'application/octet-stream'],
    extensions: ['.csv'],
  },
  pdf: {
    mimeTypes: ['application/pdf'],
    magicBytes: [0x25, 0x50, 0x44, 0x46], // %PDF
    extensions: ['.pdf'],
  },
  jpeg: {
    mimeTypes: ['image/jpeg'],
    magicBytes: [0xff, 0xd8, 0xff], // FFD8FF
    extensions: ['.jpg', '.jpeg'],
  },
  png: {
    mimeTypes: ['image/png'],
    magicBytes: [0x89, 0x50, 0x4e, 0x47], // .PNG
    extensions: ['.png'],
  },
};

/**
 * Check if buffer matches expected magic bytes
 */
function checkMagicBytes(buffer: Buffer, type: keyof typeof ALLOWED_FILE_TYPES): boolean {
  const config = ALLOWED_FILE_TYPES[type];
  
  // CSV files are text, magic bytes not reliable
  if (type === 'csv') {
    try {
      const text = buffer.toString('utf8', 0, Math.min(100, buffer.length));
      // Basic check: should be readable text
      return !text.includes('\x00'); // No null bytes in text file
    } catch {
      return false;
    }
  }

  // For binary files, check magic bytes
  const magicBytes = (config as any).magicBytes;
  if (!magicBytes) return true;

  return magicBytes.every((byte: number, index: number) => buffer[index] === byte);
}

/**
 * Get file extension from buffer using file-type library
 */
async function detectFileType(buffer: Buffer): Promise<{ ext: string; mime: string } | null> {
  try {
    const fileTypeResult = await fileTypeFromBuffer(buffer);
    if (fileTypeResult) {
      return {
        ext: `.${fileTypeResult.ext}`,
        mime: fileTypeResult.mime,
      };
    }
  } catch (error) {
    logger.warn('Error detecting file type:', error);
  }
  return null;
}

/**
 * Sanitize filename - remove dangerous characters
 */
function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  
  // Remove special characters, keep only alphanumeric, dash, underscore, dot
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
  
  // Limit length
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }
  
  return sanitized;
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return `.${parts[parts.length - 1].toLowerCase()}`;
  }
  return '';
}

/**
 * Validate Excel/CSV file structure (basic check for corrupted files)
 */
function validateExcelStructure(buffer: Buffer): boolean {
  // For ZIP-based files (XLSX), check PK header exists
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    // Should have reasonable size
    return buffer.length > 100 && buffer.length < 100 * 1024 * 1024; // 100MB max
  }
  
  // For XLS (OLE compound), check header
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf) {
    return buffer.length > 100 && buffer.length < 100 * 1024 * 1024;
  }
  
  // For CSV, just check it's not too large
  return buffer.length < 100 * 1024 * 1024;
}

/**
 * Main file upload validation middleware
 * 
 * Adds to req.file:
 * - safeFilename: UUID-based safe filename
 * - detectedType: Actual detected MIME type
 * - validated: boolean flag
 */
export const validateFileUpload = (allowedTypes: (keyof typeof ALLOWED_FILE_TYPES)[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
          code: 'NO_FILE',
        });
      }

      const buffer = file.buffer;
      const originalFilename = file.originalname;
      const originalExtension = getFileExtension(originalFilename);

      // Step 1: Check file extension
      if (!originalExtension) {
        return res.status(400).json({
          success: false,
          message: 'File must have a valid extension',
          code: 'NO_EXTENSION',
        });
      }

      // Step 2: Detect actual file type from magic bytes
      const detectedType = await detectFileType(buffer);
      
      if (!detectedType) {
        logger.warn(`[FILE_UPLOAD] Could not detect file type for: ${originalFilename}`);
        return res.status(400).json({
          success: false,
          message: 'Could not determine file type. File may be corrupted.',
          code: 'TYPE_DETECTION_FAILED',
        });
      }

      // Step 3: Validate against allowed types
      const isAllowedType = allowedTypes.some(type => {
        const typeConfig = ALLOWED_FILE_TYPES[type];
        const mimeMatches = typeConfig.mimeTypes.includes(detectedType.mime);
        const extMatches = typeConfig.extensions.includes(detectedType.ext.toLowerCase());
        
        return mimeMatches || extMatches;
      });

      if (!isAllowedType) {
        logger.warn(
          `[FILE_UPLOAD] File type not allowed - Original: ${originalFilename}, Detected: ${detectedType.mime}${detectedType.ext}, User: ${(req as any).user?.username}`
        );
        return res.status(400).json({
          success: false,
          message: `File type not permitted. Allowed: ${allowedTypes.join(', ')}. Detected: ${detectedType.mime}`,
          code: 'TYPE_NOT_ALLOWED',
        });
      }

      // Step 4: Verify magic bytes for binary files
      const typeKey = allowedTypes.find(t => {
        const typeConfig = ALLOWED_FILE_TYPES[t];
        return typeConfig.extensions.includes(detectedType.ext.toLowerCase());
      });

      if (typeKey && typeKey !== 'csv') {
        if (!checkMagicBytes(buffer, typeKey)) {
          logger.warn(
            `[FILE_UPLOAD] Magic bytes mismatch - Original: ${originalFilename}, Expected: ${typeKey}, User: ${(req as any).user?.username}`
          );
          return res.status(400).json({
            success: false,
            message: 'File appears to be corrupted or is a different type than indicated',
            code: 'MAGIC_BYTES_MISMATCH',
          });
        }
      }

      // Step 5: Validate file structure (for Excel/CSV)
      if (['xlsx', 'xls', 'csv'].includes(typeKey || '')) {
        if (!validateExcelStructure(buffer)) {
          logger.warn(
            `[FILE_UPLOAD] Invalid file structure - Original: ${originalFilename}, User: ${(req as any).user?.username}`
          );
          return res.status(400).json({
            success: false,
            message: 'File structure is invalid or corrupted',
            code: 'INVALID_STRUCTURE',
          });
        }
      }

      // Step 6: Create safe filename with UUID
      // Format: {uuid}_{original-filename-sanitized}.{detected-extension}
      const sanitized = sanitizeFilename(originalFilename.replace(/\.[^/.]+$/, '')); // Remove extension
      const uuid = uuidv4();
      const safeFilename = `${uuid}_${sanitized || 'file'}${detectedType.ext}`;

      // Step 7: Add validation results to request
      (req.file as any).safeFilename = safeFilename;
      (req.file as any).originalFilename = originalFilename;
      (req.file as any).detectedType = detectedType.mime;
      (req.file as any).detectedExtension = detectedType.ext;
      (req.file as any).validated = true;
      (req.file as any).uuid = uuid;

      logger.info(
        `[FILE_UPLOAD] ✅ File validated - Original: ${originalFilename}, Safe: ${safeFilename}, Size: ${buffer.length} bytes, Type: ${detectedType.mime}`
      );

      return next();
    } catch (error: any) {
      logger.error('[FILE_UPLOAD] Validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'File validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};

/**
 * Middleware to apply consistent file size limit
 */
export const fileSizeLimit = (maxSizeBytes: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.file && req.file.size > maxSizeBytes) {
      const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(2);
      logger.warn(
        `[FILE_UPLOAD] File too large - Size: ${(req.file.size / (1024 * 1024)).toFixed(2)}MB, Max: ${maxSizeMB}MB, User: ${(req as any).user?.username}`
      );
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size is ${maxSizeMB}MB`,
        code: 'FILE_TOO_LARGE',
      });
    }
    return next();
  };
};

export default {
  validateFileUpload,
  fileSizeLimit,
  ALLOWED_FILE_TYPES,
};
