import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { apiFetch } from '../utils/apiClient';

let cachedNotifications = [];
let cachedUserId = null;
let listeners = new Set();
let pollTimer = null;
let inFlight = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return cachedNotifications;
}

async function fetchNotifications(userId) {
  if (!userId) {
    cachedNotifications = [];
    cachedUserId = null;
    emit();
    return;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await apiFetch('/api/v1/user/notifications');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        cachedNotifications = Array.isArray(data.notifications) ? data.notifications : [];
        cachedUserId = userId;
        emit();
      }
    } catch {
      // keep previous
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function ensurePolling(userId) {
  if (!userId) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    cachedNotifications = [];
    cachedUserId = null;
    emit();
    return;
  }
  if (cachedUserId !== userId) {
    cachedNotifications = [];
    cachedUserId = userId;
    emit();
  }
  fetchNotifications(userId);
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (cachedUserId) fetchNotifications(cachedUserId);
    }, 20000);
  }
}

/**
 * Shared user notifications for header, sidebar, and mobile menu badge.
 * One poll serves all subscribers.
 */
export function useUserNotifications(isLoggedIn, userId) {
  const notifications = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [loading, setLoading] = useState(false);
  const activeUserId = isLoggedIn ? (userId || null) : null;

  useEffect(() => {
    ensurePolling(activeUserId);
  }, [activeUserId]);

  const refresh = useCallback(async () => {
    if (!activeUserId) return;
    setLoading(true);
    try {
      await fetchNotifications(activeUserId);
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = useCallback(async (notificationId) => {
    if (!notificationId) return;
    cachedNotifications = cachedNotifications.map((n) => (
      n.id === notificationId ? { ...n, is_read: true } : n
    ));
    emit();
    try {
      await apiFetch('/api/v1/user/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ notificationId }),
      });
    } catch {
      // optimistic UI already updated
    }
  }, []);

  const markAllRead = useCallback(async () => {
    cachedNotifications = cachedNotifications.map((n) => ({ ...n, is_read: true }));
    emit();
    try {
      await apiFetch('/api/v1/user/notifications/read-all', { method: 'POST', body: '{}' });
    } catch {
      // optimistic
    }
  }, []);

  const clearNotification = useCallback(async (notificationId) => {
    if (!notificationId) return;
    cachedNotifications = cachedNotifications.filter((n) => n.id !== notificationId);
    emit();
    try {
      await apiFetch('/api/v1/user/notifications/clear', {
        method: 'POST',
        body: JSON.stringify({ notificationId }),
      });
    } catch {
      // optimistic
    }
  }, []);

  const clearAll = useCallback(async () => {
    cachedNotifications = [];
    emit();
    try {
      await apiFetch('/api/v1/user/notifications/clear', { method: 'POST', body: '{}' });
    } catch {
      // optimistic
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    clearNotification,
    clearAll,
  };
}
