import mongoose, { Schema, Document } from 'mongoose';

/**
 * Edit lock — transient, concurrency-control metadata kept OUT of the domain
 * documents it guards.
 *
 * Previously locks were embedded as an `editLock` subdocument on each domain
 * model (LPOSummary, DeliveryOrder, FuelRecord). Writing a lock therefore looked
 * identical to a real data change, which leaked into the WebSocket/change-stream
 * feed and made clients refetch — destroying in-progress edits. Storing locks in
 * their own collection keeps the domain documents untouched when a lock is taken
 * or released, so nothing is broadcast and no client reloads.
 *
 * A lock is uniquely identified by (collectionName, documentId). The TTL index on
 * `lockedUntil` lets MongoDB auto-purge abandoned locks (e.g. a user who closed
 * their browser mid-edit) without any manual cleanup. Application code still
 * checks `lockedUntil` explicitly for correctness — the TTL is just garbage
 * collection and runs on a ~60s cadence.
 */
export interface IEditLockDocument extends Document {
  collectionName: string;
  documentId: string;
  lockedBy: string;
  lockedByName?: string;
  lockedAt: Date;
  lockedUntil: Date;
}

const editLockSchema = new Schema<IEditLockDocument>(
  {
    collectionName: { type: String, required: true },
    documentId: { type: String, required: true },
    lockedBy: { type: String, required: true },
    lockedByName: { type: String },
    lockedAt: { type: Date, default: Date.now },
    lockedUntil: { type: Date, required: true },
  },
  { timestamps: false }
);

// One live lock per (collection, document). The acquire path relies on this
// unique index: an attempt to insert a second lock for the same record fails
// with a duplicate-key error, which we translate into a 423 "locked" response.
editLockSchema.index({ collectionName: 1, documentId: 1 }, { unique: true });

// TTL: MongoDB removes the lock document once `lockedUntil` has passed.
editLockSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 0 });

export const EditLock = mongoose.model<IEditLockDocument>('EditLock', editLockSchema);
