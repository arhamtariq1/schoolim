import { ROUTES } from '@ilm/contracts';
import { initializeApp, getApps } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';

import { mutate } from '@/lib/mutate';

/**
 * Web push through Firebase Cloud Messaging.
 *
 * Every value here is a public identifier that ships to every browser — none is
 * a secret. Unset, `isPushConfigured` is false and the bell hides its control.
 */
const config = {
  apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'],
  authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
  projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
  storageBucket: process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'],
  messagingSenderId: process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
  appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'],
};
const VAPID_KEY = process.env['NEXT_PUBLIC_FIREBASE_VAPID_KEY'];

export const isPushConfigured = Object.values(config).every((value) => value) && Boolean(VAPID_KEY);

export type PushState = 'unsupported' | 'unconfigured' | 'blocked' | 'off' | 'on';

/** Whether this browser can do push at all (not Safari-in-a-tab, not private mode). */
export async function pushSupported(): Promise<boolean> {
  return isPushConfigured && typeof window !== 'undefined' && 'serviceWorker' in navigator && (await isSupported());
}

function messaging() {
  const app = getApps()[0] ?? initializeApp(config);
  return getMessaging(app);
}

async function registerWorker(tenantBase: string): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?base=${encodeURIComponent(tenantBase)}`,
  );
}

/** Where this browser stands, without asking for anything. */
export async function currentPushState(): Promise<PushState> {
  if (!isPushConfigured) return 'unconfigured';
  if (!(await pushSupported())) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' ? 'on' : 'off';
}

/**
 * Ask permission (must follow a click), get this browser's token and give it to
 * the API. Returns the resulting state.
 */
export async function enablePush(tenantBase: string): Promise<PushState> {
  if (!(await pushSupported())) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  return syncPushToken(tenantBase);
}

/** Re-register an already-permitted browser — tokens rotate, and sign-in changes the user. */
export async function syncPushToken(tenantBase: string): Promise<PushState> {
  const registration = await registerWorker(tenantBase);
  const token = await getToken(messaging(), {
    vapidKey: VAPID_KEY as string,
    serviceWorkerRegistration: registration,
  });
  const result = await mutate(ROUTES.notifications.devices, 'POST', { token, platform: 'web' });
  return result.ok ? 'on' : 'off';
}

/** Stop pushing to this browser. Called on sign-out; never blocks it. */
export async function disablePush(tenantBase: string): Promise<void> {
  try {
    if (!(await pushSupported()) || Notification.permission !== 'granted') return;
    const registration = await registerWorker(tenantBase);
    const instance = messaging();
    const token = await getToken(instance, {
      vapidKey: VAPID_KEY as string,
      serviceWorkerRegistration: registration,
    });
    await mutate(ROUTES.notifications.devices, 'DELETE', { token });
    await deleteToken(instance);
  } catch {
    // Signing out must work offline; the API forgets the device on its own when
    // Firebase reports the token dead or it goes unseen for 60 days.
  }
}

/** Run `handler` when a push arrives while the page is open. Returns the unsubscribe. */
export function onForegroundPush(handler: () => void): () => void {
  try {
    return onMessage(messaging(), handler);
  } catch {
    return () => undefined;
  }
}
