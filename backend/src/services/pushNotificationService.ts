/**
 * pushNotificationService.ts
 *
 * Sends Web Push notifications to subscribed browsers.
 * Recipients are either a specific userId (MongoDB ObjectId string) or a role name.
 * Subscriptions are looked up from the PushSubscription collection.
 */

import webPush from 'web-push';
import { config } from '../config';
import { PushSubscription } from '../models/PushSubscription';
import logger from '../utils/logger';

// Known role identifiers (kept in sync with websocket.ts ROLE_NAMES)
const ROLE_NAMES = new Set([
  'super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'boss',
  'clerk', 'fuel_order_maker', 'driver', 'officer', 'accountant',
  'dar_yard', 'msa_yard', 'tanga_yard',
]);

let _initialized = false;

function ensureVapidConfigured(): boolean {
  if (_initialized) return true;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    logger.warn('VAPID keys not configured — browser push notifications disabled. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env');
    return false;
  }
  webPush.setVapidDetails(config.vapidEmail, config.vapidPublicKey, config.vapidPrivateKey);
  _initialized = true;
  return true;
}

/**
 * Send a push notification to all subscriptions that match the given recipients.
 * Each recipient is either a userId (MongoDB ObjectId) or a role name.
 * Silently skips if VAPID keys are not configured.
 */
export async function sendPushToRecipients(
  recipients: string[],
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!ensureVapidConfigured()) return;

  try {
    // Build the query: match by userId OR role
    const userIds = recipients.filter((r) => !ROLE_NAMES.has(r));
    const roles   = recipients.filter((r) => ROLE_NAMES.has(r));

    const orClauses: any[] = [];
    if (userIds.length) orClauses.push({ userId: { $in: userIds } });
    if (roles.length)   orClauses.push({ role:   { $in: roles   } });
    if (!orClauses.length) return;

    const subscriptions = await PushSubscription.find({ $or: orClauses }).lean();
    if (!subscriptions.length) return;

    const pushPayload = JSON.stringify({
      title: payload.title,
      body:  payload.body,
      url:   payload.url || '/',
      tag:   payload.tag || 'fuel-order-notification',
    });

    const sends = subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          pushPayload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired — delete it
          await PushSubscription.deleteOne({ _id: sub._id });
          logger.info(`Removed expired push subscription: ${sub.endpoint}`);
        } else {
          logger.error(`Push send failed for endpoint ${sub.endpoint}:`, err.message);
        }
      }
    });

    await Promise.allSettled(sends);
    logger.info(`Push notifications sent to ${subscriptions.length} subscription(s) for recipients: ${recipients.join(', ')}`);
  } catch (error) {
    logger.error('Failed to send push notifications:', error);
    // Never throw — push failure must not break the main notification flow
  }
}
