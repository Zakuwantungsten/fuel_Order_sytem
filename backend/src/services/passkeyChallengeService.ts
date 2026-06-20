import * as crypto from 'crypto';
import mongoose from 'mongoose';
import PasskeyChallenge from '../models/PasskeyChallenge';

/**
 * Server-side store for short-lived WebAuthn challenges, mirroring the
 * `tempSessionToken` pattern used by the MFA login flow. Challenges are persisted
 * in MongoDB with a TTL index so they auto-expire; they are also single-use
 * (consumed on verify). See PASSKEY_IMPLEMENTATION.md §5.
 */

/** Default challenge lifetime: 10 minutes (generous for biometric prompts). */
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/**
 * Persist a registration challenge for an authenticated user. Any prior
 * registration challenge for the same user is replaced so only one is ever live.
 */
export async function saveRegistrationChallenge(
  userId: mongoose.Types.ObjectId | string,
  challenge: string,
  ttlMs: number = CHALLENGE_TTL_MS
): Promise<void> {
  await PasskeyChallenge.deleteMany({ userId, type: 'registration' });
  await PasskeyChallenge.create({
    token: crypto.randomBytes(32).toString('hex'),
    userId,
    type: 'registration',
    challenge,
    expiresAt: new Date(Date.now() + ttlMs),
  });
}

/** Read (without consuming) the current registration challenge for a user. */
export async function getRegistrationChallenge(
  userId: mongoose.Types.ObjectId | string
): Promise<string | null> {
  const doc = await PasskeyChallenge.findOne({
    userId,
    type: 'registration',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  return doc?.challenge ?? null;
}

/** Delete the registration challenge(s) for a user once the ceremony completes. */
export async function clearRegistrationChallenge(
  userId: mongoose.Types.ObjectId | string
): Promise<void> {
  await PasskeyChallenge.deleteMany({ userId, type: 'registration' });
}

/**
 * Persist an authentication (login) challenge and return an opaque token the
 * client must send back at verify time. `userId` may be null for the
 * username-less / discoverable-credential flow.
 */
export async function saveLoginChallenge(
  userId: mongoose.Types.ObjectId | string | null,
  challenge: string,
  ttlMs: number = CHALLENGE_TTL_MS
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await PasskeyChallenge.create({
    token,
    userId,
    type: 'authentication',
    challenge,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

/**
 * Consume a login challenge by its token (single-use): returns the challenge and
 * associated userId, then deletes it. Returns null if missing or expired.
 */
export async function consumeLoginChallenge(
  token: string
): Promise<{ challenge: string; userId: mongoose.Types.ObjectId | null } | null> {
  if (!token) return null;
  const doc = await PasskeyChallenge.findOneAndDelete({
    token,
    type: 'authentication',
    expiresAt: { $gt: new Date() },
  });
  if (!doc) return null;
  return { challenge: doc.challenge, userId: doc.userId };
}
