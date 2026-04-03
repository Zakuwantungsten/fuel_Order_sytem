import mongoose from 'mongoose';
import { emitDataChange } from './websocket';
import logger from '../utils/logger';

/**
 * Map Mongoose model names → WebSocket collection names used by the frontend.
 */
const MODEL_COLLECTION_MAP: Record<string, string> = {
  FuelRecord: 'fuel_records',
  DeliveryOrder: 'delivery_orders',
  LPOEntry: 'lpo_entries',
};

/**
 * Start MongoDB Change Streams on key collections.
 * When a document is inserted, updated, or deleted externally (e.g. by another
 * replica-set member or a direct DB write), this broadcasts a `data_changed`
 * event via WebSocket so all connected clients stay in sync.
 *
 * Requires a MongoDB replica set (standalone won't support change streams).
 * Fails silently if change streams are unavailable — the system falls back
 * to controller-level emitDataChange calls.
 */
export function startChangeStreams(): void {
  const db = mongoose.connection;

  if (db.readyState !== 1) {
    logger.warn('Change streams: DB not connected — skipping');
    return;
  }

  for (const [modelName, wsCollection] of Object.entries(MODEL_COLLECTION_MAP)) {
    try {
      const model = mongoose.model(modelName);
      const changeStream = model.watch([], { fullDocument: 'updateLookup' });

      changeStream.on('change', (change: any) => {
        const actionMap: Record<string, 'create' | 'update' | 'delete'> = {
          insert: 'create',
          update: 'update',
          replace: 'update',
          delete: 'delete',
        };
        const action = actionMap[change.operationType];
        if (!action) return;

        const doc = change.fullDocument ?? null;
        emitDataChange(wsCollection, action, doc);
      });

      changeStream.on('error', (err: any) => {
        logger.error(`Change stream error for ${modelName}:`, err.message);
      });

      logger.info(`Change stream started for ${modelName} → ${wsCollection}`);
    } catch (err: any) {
      logger.warn(`Failed to start change stream for ${modelName}: ${err.message}`);
    }
  }
}
