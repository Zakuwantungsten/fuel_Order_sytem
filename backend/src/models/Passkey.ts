import mongoose, { Schema, Document } from 'mongoose';

/**
 * A single WebAuthn / FIDO2 credential (passkey) belonging to a user.
 *
 * One user may register multiple passkeys (laptop, phone, work desktop), so each
 * credential is its own document — revoking one is a single delete. The stored
 * public key is, by design, NOT a secret, so no field-level encryption is needed
 * (unlike UserMFA.totpSecret). See PASSKEY_IMPLEMENTATION.md §5.
 */
export interface IPasskey extends Document {
  userId: mongoose.Types.ObjectId;
  /** base64url credential id reported by the authenticator (primary lookup key). */
  credentialID: string;
  /** base64url-encoded COSE public key used to verify assertions. */
  publicKey: string;
  /** Signature counter — used for cloned-authenticator detection. */
  counter: number;
  /** Transport hints, e.g. ['internal','hybrid','usb','nfc','ble']. */
  transports: string[];
  /** 'singleDevice' | 'multiDevice'. */
  deviceType: string;
  /** Whether the credential is backed up / synced to a cloud keychain. */
  backedUp: boolean;
  /** User-facing label, e.g. "Pixel 8" / "Work laptop". */
  label: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PasskeySchema = new Schema<IPasskey>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    credentialID: {
      type: String,
      required: true,
      unique: true,
    },
    publicKey: {
      type: String,
      required: true,
    },
    counter: {
      type: Number,
      required: true,
      default: 0,
    },
    transports: {
      type: [String],
      default: [],
    },
    deviceType: {
      type: String,
      default: 'singleDevice',
    },
    backedUp: {
      type: Boolean,
      default: false,
    },
    label: {
      type: String,
      default: 'Passkey',
      trim: true,
      maxlength: [100, 'Label cannot exceed 100 characters'],
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IPasskey>('Passkey', PasskeySchema);
