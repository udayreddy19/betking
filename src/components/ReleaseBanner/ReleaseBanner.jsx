import { useEffect, useState } from 'react';
import './ReleaseBanner.css';

const KEY = 'oddsyra_release_sha';

/**
 * Soft prompt when a new deploy is live but this tab still has an old shell.
 */
export default function ReleaseBanner() {
  const [show, setShow] = useState(false);
  const buildSha = String(import.meta.env.VITE_RELEASE_SHA || '').slice(0, 12);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r2 = await fetch(`/release.json?_=${Date.now()}`, { cache: 'no-store' });
        if (!r2.ok) return;
        const remote = await r2.json().catch(() => ({}));
        const remoteSha = String(remote?.sha || remote?.releaseSha || '').slice(0, 12);
        if (!remoteSha) return;
        const local = (buildSha || localStorage.getItem(KEY) || '').slice(0, 12);
        if (!cancelled && local && remoteSha !== local) {
          setShow(true);
        }
        if (remoteSha) localStorage.setItem(KEY, remoteSha);
      } catch {
        // optional endpoint
      }
    })();
    return () => { cancelled = true; };
  }, [buildSha]);

  if (!show) return null;

  return (
    <div className="release-banner" role="status">
      <span>A newer OddsYra version is live.</span>
      <button type="button" className="release-banner__btn" onClick={() => window.location.reload()}>
        Refresh
      </button>
      <button
        type="button"
        className="release-banner__dismiss"
        aria-label="Dismiss"
        onClick={() => setShow(false)}
      >
        ×
      </button>
    </div>
  );
}
