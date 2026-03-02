import mongoose, { Schema, Document } from 'mongoose';

export interface IApiToken extends Document {
  name: string;
  description?: string;
  tokenHash: string;       // SHA-256 of the raw token (never stored plain)
  tokenPrefix: string;     // First 8 chars of raw token, shown in UI for identification
  createdBy: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revoked: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  scopes: string[];
  createdAt: Date;
}

const ApiTokenSchema = new Schema<IApiToken>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenPrefix: { type: String, required: true },
    createdBy: { type: String, required: true },
    expiresAt: { type: Date },
    lastUsedAt: { type: Date },
    revoked: { type: Boolean, default: false, index: true },
    revokedAt: { type: Date },
    revokedBy: { type: String },
    scopes: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model<IApiToken>('ApiToken', ApiTokenSchema);
