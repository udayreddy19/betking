import { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/apiClient';
import { DEMO_MODE } from '../../utils/featureFlags';
import { useAuth } from '../../context/AuthContext';
import './RealityCheckModal.css';

export default function RealityCheckModal() {
  const { isLoggedIn } = useAuth();
  const [due, setDue] = useState(false);
  const [intervalMins, setIntervalMins] = useState(60);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || DEMO_MODE) {
      setDue(false);
      return undefined;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await apiFetch('/api/v1/rg/status');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setDue(Boolean(data.due));
          if (data.intervalMins) setIntervalMins(data.intervalMins);
        }
      } catch {
        // keep last state
      }
    };

    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLoggedIn]);

  if (!due || !isLoggedIn || DEMO_MODE) return null;

  const ack = async () => {
    setAcking(true);
    try {
      const res = await apiFetch('/api/v1/rg/reality-check/ack', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) setDue(false);
    } finally {
      setAcking(false);
    }
  };

  return (
    <div className="reality-check-overlay" role="dialog" aria-modal="true" aria-labelledby="reality-check-title">
      <div className="reality-check-card">
        <h2 id="reality-check-title">Reality check</h2>
        <p>
          You have been playing for {intervalMins} minutes. Betting and deposits stay paused until you confirm you want to continue.
        </p>
        <button type="button" className="reality-check-btn" onClick={ack} disabled={acking}>
          {acking ? 'Saving…' : 'I understand — continue'}
        </button>
      </div>
    </div>
  );
}
