import mongoose, { Schema, Document } from 'mongoose';

/**
 * Short-lived WebAuthn challenge persisted between the two steps of a passkey
 * ceremony (options → verify). The challenge MUST be generated and validated
 * server-side; never trust a challenge echoed back by the client.
 *
 * - Registration ceremonies are tied to an authenticated `userId`.
 * - Authentication (login) ceremonies may have a null `userId` (username-less /
 *   discoverable flow) and are looked up by the opaque `token` returned to the
 *   client. The TTL index auto-expires stale challenges. See
 *   PASSKEY_IMPLEMENTATION.md §5.
 */
export interface IPasskeyChallenge extends Document {
  /** Opaque lookup token handed to the client (login flow). */
  token: string;
  /** Owning user, when known (always set for registration). */
  userId: mongoose.Types.ObjectId | null;
  type: 'registration' | 'authentication';
  /** The base64url challenge issued to the authenticator. */
  challenge: string;
  expiresAt: Date;
  createdAt: Date;
}

const PasskeyChallengeSchema = new Schema<IPasskeyChallenge>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ['registration', 'authentication'],
      required: true,
    },
    challenge: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index — MongoDB auto-deletes when expiresAt is reached
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IPasskeyChallenge>('PasskeyChallenge', PasskeyChallengeSchema);
