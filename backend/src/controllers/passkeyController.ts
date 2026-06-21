import { Request, Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { User, Passkey, SystemConfig } from '../models';
import UserMFA from '../models/UserMFA';
import { config } from '../config';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils';
import { issueSession } from './authController';
import {
  saveRegistrationChallenge,
  getRegistrationChallenge,
  clearRegistrationChallenge,
  saveLoginChallenge,
  consumeLoginChallenge,
} from '../services/passkeyChallengeService';

const rpID = config.webauthnRpId;
const rpName = config.webauthnRpName;
const origins = config.webauthnOrigins;

// ─── Registration (authenticated) ────────────────────────────────────────────

/**
 * Step 1 of enrollment: issue creation options + challenge for the logged-in user.
 */
export const passkeyRegisterOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, 'User not found');

  const existing = await Passkey.find({ userId: user._id });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userDisplayName: `${user.firstName} ${user.lastName}`.trim() || user.username,
    // Stable WebAuthn user handle tied to the Mongo id.
    userID: new TextEncoder().encode(user._id.toString()),
    attestationType: 'none',
    // Prevent registering the same authenticator twice.
    excludeCredentials: existing.map(p => ({
      id: p.credentialID,
      transports: p.transports as any,
    })),
    authenticatorSelection: {
      // 'required' forces a DISCOVERABLE (resident) credential so the user can log
      // in usernameless — the authenticator stores the user handle and offers the
      // passkey at the login screen without us pre-supplying allowCredentials.
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'preferred',
    },
  });

  await saveRegistrationChallenge(user._id, options.challenge);

  res.status(200).json({ success: true, data: options });
};

/**
 * Step 2 of enrollment: verify the attestation and persist the credential.
 */
export const passkeyRegisterVerify = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, 'User not found');

  const expectedChallenge = await getRegistrationChallenge(user._id);
  if (!expectedChallenge) throw new ApiError(400, 'No active passkey challenge. Please restart enrollment.');

  const { label, ...attestation } = req.body || {};

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err: any) {
    logger.warn(`[Passkey] Registration verification error for ${user.username}: ${err?.message}`);
    throw new ApiError(400, 'Passkey verification failed');
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(400, 'Passkey verification failed');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Guard against re-registering an existing credential id.
  const already = await Passkey.findOne({ credentialID: credential.id });
  if (already) {
    await clearRegistrationChallenge(user._id);
    throw new ApiError(409, 'This passkey is already registered');
  }

  await Passkey.create({
    userId: user._id,
    credentialID: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports || [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 100) : 'Passkey',
  });

  await clearRegistrationChallenge(user._id);
  logger.info(`[Passkey] Registered new passkey for ${user.username}`);

  res.status(201).json({ success: true, message: 'Passkey registered' });
};

// ─── Authentication / login (public) ─────────────────────────────────────────

/**
 * Step 1 of login: issue request options + an opaque challenge token.
 *
 * Usernameless by default: with no `username`, we send EMPTY allowCredentials so
 * the authenticator offers any discoverable passkey for this RP (tap → biometric,
 * no typing). An optional `username` still narrows the offered credentials for the
 * legacy username-first flow. Always returns options (even for unknown users) to
 * avoid username enumeration.
 */
export const passkeyLoginOptions = async (req: Request, res: Response): Promise<void> => {
  const { username } = req.body || {};

  const user = username
    ? await User.findOne({ username, isDeleted: false, isActive: true })
    : null;
  const creds = user ? await Passkey.find({ userId: user._id }) : [];

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    // Empty array ⇒ usernameless/discoverable; populated ⇒ username-first.
    allowCredentials: creds.map(c => ({
      id: c.credentialID,
      transports: c.transports as any,
    })),
  });

  const challengeToken = await saveLoginChallenge(user?._id ?? null, options.challenge);

  res.status(200).json({ success: true, data: { options, challengeToken } });
};

/**
 * Step 2 of login: verify the assertion, update the signature counter, and issue
 * the same session a password login would (via issueSession).
 */
export const passkeyLoginVerify = async (req: AuthRequest, res: Response): Promise<void> => {
  const { challengeToken, response, rememberMe } = req.body || {};
  if (!challengeToken || !response) {
    throw new ApiError(400, 'Challenge token and response are required');
  }

  const stored = await consumeLoginChallenge(challengeToken);
  if (!stored) throw new ApiError(401, 'Invalid or expired challenge');

  const passkey = await Passkey.findOne({ credentialID: response.id });
  if (!passkey) throw new ApiError(401, 'Unknown passkey');

  // If the challenge was bound to a specific user, the credential must belong to them.
  if (stored.userId && passkey.userId.toString() !== stored.userId.toString()) {
    throw new ApiError(401, 'Passkey does not match this login attempt');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialID,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: passkey.transports as any,
      },
      requireUserVerification: false,
    });
  } catch (err: any) {
    logger.warn(`[Passkey] Authentication verification error: ${err?.message}`);
    throw new ApiError(401, 'Authentication failed');
  }

  if (!verification.verified) throw new ApiError(401, 'Authentication failed');

  // Persist new counter (clone detection) and last-used timestamp.
  passkey.counter = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();

  const user = await User.findById(passkey.userId).select('+refreshToken');
  if (!user || user.isDeleted || !user.isActive) {
    throw new ApiError(403, 'Account is not available');
  }
  if (user.isBanned) {
    throw new ApiError(403, 'Account is banned');
  }

  // Resolve session settings the same way the MFA-verified path does.
  const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
  const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
  const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
  const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
  const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;
  const allowMultipleSessions = sessionConfig?.systemSettings?.session?.allowMultipleSessions ?? true;

  // Record that this login satisfied MFA via a phishing-resistant passkey
  // (best-effort, audit only — never block login on this). See PASSKEY_IMPLEMENTATION.md §9.
  UserMFA.updateOne(
    { userId: user._id },
    { $set: { lastMFAVerification: new Date(), failedMFAAttempts: 0 } }
  ).catch(() => { /* audit-only; ignore */ });

  logger.info(`[Passkey] User ${user.username} authenticated via passkey`);

  await issueSession(user, req, res, {
    message: 'Login successful',
    rememberMe: !!rememberMe,
    sessionConfig,
    accessExpiry,
    refreshExpiry,
    refreshExpiryDays,
    allowMultipleSessions,
    sessionKillContext: 'new passkey login',
    loginMethod: 'passkey',
    guardDriverRememberMe: true,
  });
};

// ─── Management (authenticated) ──────────────────────────────────────────────

/** List the current user's registered passkeys (no secrets exposed). */
export const listPasskeys = async (req: AuthRequest, res: Response): Promise<void> => {
  const passkeys = await Passkey.find({ userId: req.user!.userId })
    .select('credentialID label deviceType backedUp transports lastUsedAt createdAt')
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: passkeys });
};

/** Revoke (delete) one of the current user's passkeys. */
export const deletePasskey = async (req: AuthRequest, res: Response): Promise<void> => {
  const deleted = await Passkey.findOneAndDelete({
    _id: req.params.id,
    userId: req.user!.userId,
  });
  if (!deleted) throw new ApiError(404, 'Passkey not found');
  logger.info(`[Passkey] Removed passkey ${req.params.id} for user ${req.user!.username}`);
  res.status(200).json({ success: true, message: 'Passkey removed' });
};

/** Rename one of the current user's passkeys. */
export const renamePasskey = async (req: AuthRequest, res: Response): Promise<void> => {
  const { label } = req.body || {};
  if (!label || typeof label !== 'string' || !label.trim()) {
    throw new ApiError(400, 'A non-empty label is required');
  }
  const updated = await Passkey.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { label: label.trim().slice(0, 100) },
    { new: true }
  );
  if (!updated) throw new ApiError(404, 'Passkey not found');
  res.status(200).json({ success: true, message: 'Passkey renamed', data: { label: updated.label } });
};
