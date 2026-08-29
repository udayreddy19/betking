import { apiFetch } from './apiClient';

/**
 * Standard Browser Web Push Client Utility
 */

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

export function getPushPermissionState() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * User-initiated push subscription flow.
 * NEVER invoked automatically on page load or signup.
 */
export async function subscribeUserToPush() {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications are not supported by this browser.' };
  }

  if (Notification.permission === 'denied') {
    return {
      success: false,
      blocked: true,
      error: 'Notifications are blocked in your browser settings. Please allow notifications for OddsYra to enable this feature.',
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was not granted.' };
    }

    const keyRes = await apiFetch('/api/v1/user/push/vapid-public-key');
    const keyData = await keyRes.json().catch(() => ({}));
    if (!keyData?.vapidPublicKey) {
      return { success: false, error: 'Push service is not currently configured.' };
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const convertedVapidKey = urlBase64ToUint8Array(keyData.vapidPublicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    }

    const subJson = sub.toJSON();
    const saveRes = await apiFetch('/api/v1/user/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    });

    const saveData = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) {
      throw new Error(saveData.error || 'Failed to save push subscription.');
    }

    return { success: true, subscription: saveData.subscription };
  } catch (err) {
    return { success: false, error: err.message || 'Push subscription failed.' };
  }
}

/**
 * Unsubscribe user from browser push
 */
export async function unsubscribeUserFromPush() {
  if (!isPushSupported()) return { success: true };

  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await apiFetch('/api/v1/user/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        }).catch(() => null);
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
