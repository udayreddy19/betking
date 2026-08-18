import { useState, useEffect } from 'react';
import './TraderConsole.css';

export default function TraderConsole() {
  const [exposure, setExposure] = useState(null);
  const [providers, setProviders] = useState(null);
  const [exposureError, setExposureError] = useState('');
  const [providersError, setProvidersError] = useState('');

  useEffect(() => {
    fetch('/api/v1/admin/trading/exposure')
      .then((r) => r.json())
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

    fetch('/api/v1/admin/providers/health')
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

  return (
    <div className="trader-console-page">
      <header className="trader-header">
        <h1>⚡ OddsYra Professional Trader Console</h1>
        <span className="trader-status">LIVE TRADING SESSION ACTIVE</span>
      </header>

      <div className="trader-grid">
        <div className="trader-card">
          <h3>Global Risk & Exposure Summary</h3>
          {exposure ? (
            <div className="trader-metrics">
              <p>Total Active Bets: <strong>{exposure.globalBetsCount}</strong></p>
              <p>Total Staked Volume: <strong>₹{Number(exposure.globalStakedAmount || 0).toLocaleString()}</strong></p>
              <p>Worst Case Liability: <strong className="text-danger">₹{Number(exposure.globalWorstCaseLoss || 0).toLocaleString()}</strong></p>
            </div>
          ) : <p>{exposureError || 'Loading metrics...'}</p>}
        </div>

        <div className="trader-card">
          <h3>Provider Health & Gateway Failover</h3>
          {providers ? (
            <div className="trader-metrics">
              <p>Healthy Providers: <strong>{providers.healthyProviders} / {providers.totalProviders}</strong></p>
              <p>Active Priority Queue: <strong>{(providers.activeQueue || []).join(' → ') || '—'}</strong></p>
            </div>
          ) : <p>{providersError || 'Loading provider health...'}</p>}
        </div>
      </div>
    </div>
  );
}
