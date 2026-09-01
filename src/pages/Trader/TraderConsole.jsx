import { useState, useEffect } from 'react';
import { adminApiClient } from '../Admin/api/adminApiClient';
import './TraderConsole.css';

export default function TraderConsole() {
  const [exposure, setExposure] = useState(null);
  const [providers, setProviders] = useState(null);
  const [exposureError, setExposureError] = useState('');
  const [providersError, setProvidersError] = useState('');
  const [matchId, setMatchId] = useState('');
  const [marketId, setMarketId] = useState('');
  const [reason, setReason] = useState('TRADER_MANUAL');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    adminApiClient.get('/trading/exposure')
      .then((data) => {
        if (data && data.success) {
          setExposure(data.exposure);
          setExposureError('');
        } else {
          setExposure(null);
          setExposureError(data?.error || 'Could not load exposure.');
        }
      })
      .catch(() => {
        setExposure(null);
        setExposureError('Could not load exposure.');
      });

    fetch('/api/v1/admin/providers/health', {
      credentials: 'include',
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.success) {
          setProviders(data.providers);
          setProvidersError('');
        } else {
          setProviders(null);
          setProvidersError(data?.error || 'Could not load provider health.');
        }
      })
      .catch(() => {
        setProviders(null);
        setProvidersError('Could not load provider health.');
      });
  }, []);

  const run = async (fn, ok) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage(ok);
    } catch (err) {
      setMessage(err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="trader-console-page">
      <header className="trader-header">
        <h1>OddsYra trader console</h1>
        <span className="trader-status">LIVE</span>
      </header>

      <div className="trader-grid">
        <div className="trader-card">
          <h3>Global risk & exposure</h3>
          {exposure ? (
            <div className="trader-metrics">
              <p>Total active bets: <strong>{exposure.globalBetsCount}</strong></p>
              <p>Staked volume: <strong>₹{Number(exposure.globalStakedAmount || 0).toLocaleString()}</strong></p>
              <p>Worst-case liability: <strong className="text-danger">₹{Number(exposure.globalWorstCaseLoss || 0).toLocaleString()}</strong></p>
            </div>
          ) : <p>{exposureError || 'Loading metrics...'}</p>}
        </div>

        <div className="trader-card">
          <h3>Provider health</h3>
          {providers ? (
            <div className="trader-metrics">
              <p>Healthy: <strong>{providers.healthyProviders} / {providers.totalProviders}</strong></p>
              <p>Queue: <strong>{(providers.activeQueue || []).join(' → ') || '—'}</strong></p>
            </div>
          ) : <p>{providersError || 'Loading provider health...'}</p>}
        </div>

        <div className="trader-card trader-card--span">
          <h3>Kill switch</h3>
          <p className="trader-hint">Halt a match or a single market. Prices go off the board and placement refuses. Thaw restores the match.</p>
          <div className="trader-kill-row">
            <label>
              Match id
              <input value={matchId} onChange={(e) => setMatchId(e.target.value)} placeholder="match id" />
            </label>
            <label>
              Market id
              <input value={marketId} onChange={(e) => setMarketId(e.target.value)} placeholder="optional, e.g. match_winner" />
            </label>
            <label>
              Reason
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
          <div className="trader-kill-actions">
            <button
              type="button"
              disabled={busy || !matchId.trim()}
              onClick={() => run(
                () => adminApiClient.post('/operations/freeze-match', { matchId: matchId.trim(), reason }),
                'Match frozen',
              )}
            >
              Freeze match
            </button>
            <button
              type="button"
              disabled={busy || !matchId.trim()}
              onClick={() => run(
                () => adminApiClient.post('/operations/thaw-match', { matchId: matchId.trim(), reason }),
                'Match thawed',
              )}
            >
              Thaw match
            </button>
            <button
              type="button"
              disabled={busy || !marketId.trim()}
              onClick={() => run(
                () => adminApiClient.post('/trading/suspend-market', {
                  marketId: marketId.trim(),
                  matchId: matchId.trim() || undefined,
                  reason,
                }),
                'Market suspended',
              )}
            >
              Suspend market
            </button>
          </div>
          {message && <p className="trader-message">{message}</p>}
        </div>
      </div>
    </div>
  );
}
