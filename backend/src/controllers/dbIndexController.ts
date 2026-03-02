import { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthRequest } from '../middleware/auth';

/**
 * GET /api/system-admin/db-indexes
 * Lists all indexes for every collection in the current database
 */
export const listIndexes = async (req: AuthRequest, res: Response): Promise<void> => {
  const db = mongoose.connection.db;
  if (!db) {
    res.status(503).json({ success: false, message: 'Database not connected' });
    return;
  }

  const collections = await db.listCollections().toArray();
  const results = await Promise.all(
    collections.map(async (col) => {
      const indexes = await db.collection(col.name).indexes();
      const stats = await db.collection(col.name).estimatedDocumentCount().catch(() => 0);
      return {
        collection: col.name,
        documentCount: stats,
        indexes: indexes.map((idx) => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false,
          expireAfterSeconds: idx.expireAfterSeconds,
          background: idx.background || false,
        })),
      };
    })
  );

  results.sort((a, b) => a.collection.localeCompare(b.collection));

  res.json({
    success: true,
    data: {
      collections: results,
      totalCollections: results.length,
      totalIndexes: results.reduce((s, c) => s + c.indexes.length, 0),
    },
  });
};

