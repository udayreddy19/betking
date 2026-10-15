import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { storageGet, storageSet } from '../../utils/browserCompat';
import {
  getPushPermissionState,
  isPushSupported,
  subscribeUserToPush,
} from '../../utils/webPushClient';
import './PushOptInBanner.css';

const DISMISS_KEY = 'oddsyra_push_optin_dismissed_v1';

export default function PushOptInBanner() {
  const { isLoggedIn, showToast } = useAuth();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const refreshVisibility = useCallback(() => {
    if (!isLoggedIn || !isPushSupported()) {
      setVisible(false);
      return;
    }
    if (storageGet(DISMISS_KEY) === '1') {
      setVisible(false);
      return;
    }
    const perm = getPushPermissionState();
    if (perm !== 'default') {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [isLoggedIn]);

  useEffect(() => {
    refreshVisibility();
  }, [refreshVisibility]);

  const dismiss = () => {
    storageSet(DISMISS_KEY, '1');
    setVisible(false);
  };

  const onEnable = async () => {
    setEnabling(true);
    try {
      const res = await subscribeUserToPush();
      if (res.success) {
        showToast?.('Push alerts enabled for settlements & deposits.', 'success');
        setVisible(false);
        return;
      }
      if (res.blocked) {
        showToast?.('Notifications are blocked in browser settings.', 'error');
      } else {
        showToast?.(res.error || 'Could not enable notifications.', 'error');
      }
      refreshVisibility();
    } finally {
      setEnabling(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="push-opt-in-banner container" role="region" aria-label="Notification opt-in">
      <p className="push-opt-in-banner__copy">Get settlement &amp; deposit alerts</p>
      <div className="push-opt-in-banner__actions">
        <button type="button" className="push-opt-in-banner__enable" onClick={onEnable} disabled={enabling}>
          {enabling ? 'Enabling…' : 'Enable'}
        </button>
        <button type="button" className="push-opt-in-banner__dismiss" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
