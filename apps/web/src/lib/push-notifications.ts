import { api } from './api.js';

export function supportsPush() {
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function applicationServerKey(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (character) =>
    character.charCodeAt(0),
  );
  return bytes.buffer;
}

export async function enablePushNotifications() {
  // Ask permission directly from the button gesture (required on iOS).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Permita as notificações nas configurações do navegador para receber os avisos.',
    );
  const { publicKey } = await api.getPushConfig();
  if (!publicKey) throw new Error('Os avisos no celular ainda não estão disponíveis.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    }));
  try {
    await api.savePushSubscription(subscription.toJSON());
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

export async function disablePushNotifications() {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await api.deletePushSubscription(subscription.endpoint);
  } finally {
    // Also revoke locally when the API is unreachable, including on logout.
    await subscription.unsubscribe();
  }
}

export async function hasPushSubscription() {
  if (!supportsPush()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const { enabled } = await api.getPushSubscriptionStatus(subscription.endpoint);
  if (!enabled) await subscription.unsubscribe();
  return enabled;
}
