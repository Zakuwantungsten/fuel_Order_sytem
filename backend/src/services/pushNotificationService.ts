/**
 * pushNotificationService.ts
 *
 * Sends Web Push notifications to subscribed browsers.
 * Recipients are either a specific userId (MongoDB ObjectId string) or a role name.
 * Subscriptions are looked up from the PushSubscription collection.
 */

import webPush from 'web-push';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { config } from '../config';
import { PushSubscription } from '../models/PushSubscription';
import { enqueuePush } from './notificationQueue';
import logger from '../utils/logger';

// Known role identifiers (kept in sync with websocket.ts ROLE_NAMES)
const ROLE_NAMES = new Set([
  'super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'boss',
  'clerk', 'fuel_order_maker', 'driver', 'officer', 'accountant',
  'dar_yard', 'msa_yard', 'tanga_yard',
]);

let _initialized = false;

const expo = new Expo();

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
 * Tries to enqueue via BullMQ (async, non-blocking). Falls back to direct send
 * if Redis/BullMQ is not available.
 *
 * This is the function all controllers should call — it never blocks the HTTP response.
 */
export async function sendPushToRecipients(
  recipients: string[],
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  // NOTE: do NOT gate on VAPID here. VAPID is only needed for *browser* web-push;
  // Expo (mobile) push uses FCM/APNs and must still fire when VAPID is unset
  // (e.g. the self-hosted backend has no browser-push keys configured).

  // Try async queue first (returns false if queue is unavailable)
  const enqueued = await enqueuePush(recipients, payload);
  if (enqueued) {
    logger.debug(`Push notification enqueued for recipients: ${recipients.join(', ')}`);
    return;
  }

  // Fallback: send directly (blocks, but only when Redis is down)
  await sendPushDirect(recipients, payload);
}

/**
 * Direct push send — called by the BullMQ worker or as a fallback.
 * This is the actual push-sending logic. Do NOT call from request handlers
 * unless the queue is unavailable.
 */
export async function sendPushDirect(
  recipients: string[],
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  // Web-push needs VAPID; Expo push does not. Resolve VAPID availability once and
  // skip only the browser sends if it's missing — Expo sends always proceed.
  const vapidOk = ensureVapidConfigured();

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

    const webSubs  = subscriptions.filter((s) => (s.platform || 'web') === 'web');
    const expoSubs = subscriptions.filter((s) => s.platform === 'expo' && s.expoPushToken);

    const pushPayload = JSON.stringify({
      title: payload.title,
      body:  payload.body,
      url:   payload.url || '/',
      tag:   payload.tag || 'fuel-order-notification',
    });

    // --- Web Push (VAPID) — only when keys are configured ---
    const webSends = (vapidOk ? webSubs : []).map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          pushPayload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
          logger.info(`Removed expired push subscription: ${sub.endpoint}`);
        } else {
          logger.error(`Push send failed for endpoint ${sub.endpoint}:`, err.message);
        }
      }
    });

    // --- Expo Push (FCM/APNs) ---
    const expoMessages: ExpoPushMessage[] = expoSubs
      .filter((sub) => Expo.isExpoPushToken(sub.expoPushToken))
      .map((sub) => ({
        to: sub.expoPushToken,
        title: payload.title,
        body:  payload.body,
        data:  { url: payload.url || '/' },
        // Custom tone bundled in the app (iOS uses this filename; Android uses the
        // 'default' channel's sound). Invalid/missing falls back to the system sound.
        sound: 'notification.wav',
        channelId: 'default',
        // 'high' priority bypasses Android Doze mode so the device wakes immediately
        // instead of deferring until the next maintenance window.
        priority: 'high' as const,
      }));

    const expoSend = (async () => {
      if (!expoMessages.length) return;
      try {
        const chunks = expo.chunkPushNotifications(expoMessages);
        for (const chunk of chunks) {
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          // Log any ticket-level errors and clean up bad tokens
          for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            if (ticket.status === 'error') {
              logger.error(`Expo push error for token ${(chunk[i] as any).to}: ${ticket.message}`);
              if (ticket.details?.error === 'DeviceNotRegistered') {
                await PushSubscription.deleteOne({ expoPushToken: (chunk[i] as any).to });
                logger.info(`Removed unregistered Expo token: ${(chunk[i] as any).to}`);
              }
            }
          }
        }
      } catch (err) {
        logger.error('Expo push batch send failed:', err);
      }
    })();

    await Promise.allSettled([...webSends, expoSend]);
    logger.info(`Push notifications sent to ${subscriptions.length} subscription(s) for recipients: ${recipients.join(', ')}`);
  } catch (error) {
    logger.error('Failed to send push notifications:', error);
    // Never throw — push failure must not break the main notification flow
  }
}
