import mongoose from 'mongoose';
import { emitDataChange } from './websocket';
import logger from '../utils/logger';

/**
 * Map Mongoose model names → WebSocket collection names used by the frontend.
 */
const MODEL_COLLECTION_MAP: Record<string, string> = {
  FuelRecord: 'fuel_records',
  DeliveryOrder: 'delivery_orders',
  // LPOSummary is the single source of truth for LPO entries — emit on the
  // same 'lpo_summaries' channel the frontend subscribes to.
  LPOSummary: 'lpo_summaries',
};

/**
 * Map SystemConfig.configType → WebSocket collection name.
 * External writes (scripts, other servers) to SystemConfig won't go through
 * the controller-level emitDataChange, so this change stream catches them.
 */
const SYSTEM_CONFIG_TYPE_MAP: Record<string, string> = {
  truck_batches: 'truck_batches',
  fuel_stations: 'fuel_stations',
  routes: 'routes',
  standard_allocations: 'standard_allocations',
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
const activeStreams: import('mongodb').ChangeStream[] = [];

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

      activeStreams.push(changeStream as any);
      logger.info(`Change stream started for ${modelName} → ${wsCollection}`);
    } catch (err: any) {
      logger.warn(`Failed to start change stream for ${modelName}: ${err.message}`);
    }
  }

  // Watch SystemConfig for external changes and route by configType.
  // Controller-level emitDataChange already handles API-triggered saves; this
  // catches writes that bypass the API (scripts, direct DB ops, multi-node setups).
  try {
    const SystemConfig = mongoose.model('SystemConfig');
    const configStream = SystemConfig.watch([], { fullDocument: 'updateLookup' });

    configStream.on('change', (change: any) => {
      const actionMap: Record<string, 'create' | 'update' | 'delete'> = {
        insert: 'create',
        update: 'update',
        replace: 'update',
        delete: 'delete',
      };
      const action = actionMap[change.operationType];
      if (!action) return;

      const doc = change.fullDocument ?? null;
      const configType: string = doc?.configType ?? '';
      const wsCollection = SYSTEM_CONFIG_TYPE_MAP[configType];
      if (wsCollection) {
        emitDataChange(wsCollection, action, doc);
      }
    });

    configStream.on('error', (err: any) => {
      logger.error('Change stream error for SystemConfig:', err.message);
    });

    activeStreams.push(configStream as any);
    logger.info('Change stream started for SystemConfig → (routed by configType)');
  } catch (err: any) {
    logger.warn(`Failed to start change stream for SystemConfig: ${err.message}`);
  }
}

export async function stopChangeStreams(): Promise<void> {
  await Promise.all(activeStreams.map(s => s.close().catch(() => {})));
  activeStreams.length = 0;
  logger.info('Change streams closed');
}
