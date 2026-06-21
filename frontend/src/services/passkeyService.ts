import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { passkeyAPI } from './api';

/**
 * Browser-side driver for the WebAuthn ceremonies. Wraps @simplewebauthn/browser
 * (which talks to navigator.credentials) and the passkeyAPI transport. See
 * PASSKEY_IMPLEMENTATION.md §8.
 */

/** True when the current browser can perform WebAuthn ceremonies. */
export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn();
}

/** True when a platform authenticator (Touch ID / Face ID / Windows Hello) is available. */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  try {
    if (typeof window.PublicKeyCredential === 'undefined') return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Run the usernameless login ceremony and return the backend's auth response
 * ({ data: { user, accessToken, ... } }). The authenticator offers any
 * discoverable passkey for this site (tap → biometric, no username typing).
 * An optional `username` falls back to the legacy username-first flow.
 * Throws on cancellation or failure.
 */
export async function loginWithPasskey(rememberMe = false, username?: string): Promise<any> {
  const { options, challengeToken } = await passkeyAPI.loginOptions(username);
  const assertion = await startAuthentication({ optionsJSON: options });
  return passkeyAPI.loginVerify({ challengeToken, response: assertion, rememberMe });
}

/**
 * Run the enrollment ceremony for the logged-in user and persist the new passkey
 * under `label`. Throws on cancellation or failure.
 */
export async function enrollPasskey(label: string): Promise<void> {
  const options = await passkeyAPI.registerOptions();
  const attestation = await startRegistration({ optionsJSON: options });
  await passkeyAPI.registerVerify({ ...attestation, label });
}

/**
 * Normalize WebAuthn ceremony errors into a friendly message. The browser throws
 * a DOMException for user cancellation / timeouts; Android's Credential Manager
 * throws a generic "unknown error" when there is simply no passkey to offer.
 */
export function describePasskeyError(err: any): string {
  const name = err?.name;
  const raw = (err?.message || '').toLowerCase();

  // Android Chrome surfaces "no passkey available" as a generic Credential Manager
  // error (often NotReadableError / UnknownError). Treat these as "none enrolled".
  if (
    raw.includes('credential manager') ||
    name === 'NotReadableError' ||
    name === 'UnknownError'
  ) {
    return 'No passkey found on this device yet. Sign in with your password, then add a passkey under Settings → Security.';
  }
  if (name === 'NotAllowedError') {
    // Fires both on user cancel/timeout AND when there are no matching credentials.
    return 'No passkey was used — the prompt was cancelled, timed out, or there is no passkey on this device yet. Add one under Settings → Security.';
  }
  if (name === 'InvalidStateError') {
    return 'This device already has a passkey registered for your account.';
  }
  if (name === 'SecurityError') {
    return 'Passkeys are not available on this domain. Please contact your administrator.';
  }
  if (name === 'AbortError') {
    return 'Passkey sign-in was cancelled.';
  }
  return err?.response?.data?.message || err?.message || 'Passkey operation failed.';
}
