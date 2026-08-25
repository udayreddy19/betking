import { useEffect, useRef } from 'react';
import { DEMO_MODE } from '../../utils/featureFlags';
import { useAuth } from '../../context/AuthContext';
import { SESSION_IDLE_LOGOUT_MS } from '../../config/sessionIdle';

const ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'mousemove',
  'scroll',
  'touchstart',
  'wheel',
  'visibilitychange',
];

/**
 * Logs the user out after SESSION_IDLE_LOGOUT_MS with no pointer/keyboard/scroll activity.
 * Replaces the old timed "reality check" pause modal.
 */
export default function SessionIdleLogout() {
  const { isLoggedIn, logout } = useAuth();
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    if (!isLoggedIn || DEMO_MODE) return undefined;

    let timerId = null;
    let lastMoveAt = 0;

    const arm = () => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        logoutRef.current({
          message: 'Logged out after 30 minutes of inactivity.',
          toastType: 'info',
        });
      }, SESSION_IDLE_LOGOUT_MS);
    };

    const onActivity = (event) => {
      if (event?.type === 'visibilitychange' && document.visibilityState !== 'visible') {
        return;
      }
      if (event?.type === 'mousemove') {
        const now = Date.now();
        if (now - lastMoveAt < 1_000) return;
        lastMoveAt = now;
      }
      arm();
    };

    arm();
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true, capture: true });
    }

    return () => {
      if (timerId) clearTimeout(timerId);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
    };
  }, [isLoggedIn]);

  return null;
}
