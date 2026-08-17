import { useState, useEffect } from 'react';
import './TraderConsole.css';

export default function TraderConsole() {
  const [exposure, setExposure] = useState({
    globalBetsCount: 142,
    globalStakedAmount: 384500,
    globalWorstCaseLoss: 721800,
  });
  const [providers, setProviders] = useState({
    healthyProviders: 3,
    totalProviders: 3,
    activeQueue: ['SPORTRADAR', 'BETFAIR', 'CRICAPI'],
  });

  useEffect(() => {
    fetch('/api/v1/admin/trading/exposure')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.success) setExposure(data.exposure);
      })
      .catch(() => {});

    fetch('/api/v1/admin/providers/health')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.success) setProviders(data.providers);
      })
      .catch(() => {});
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
              <p>Total Staked Volume: <strong>₹{exposure.globalStakedAmount.toLocaleString()}</strong></p>
              <p>Worst Case Liability: <strong className="text-danger">₹{exposure.globalWorstCaseLoss.toLocaleString()}</strong></p>
            </div>
          ) : <p>Loading metrics...</p>}
        </div>

        <div className="trader-card">
          <h3>Provider Health & Gateway Failover</h3>
          {providers ? (
            <div className="trader-metrics">
              <p>Healthy Providers: <strong>{providers.healthyProviders} / {providers.totalProviders}</strong></p>
              <p>Active Priority Queue: <strong>{providers.activeQueue.join(' → ')}</strong></p>
            </div>
          ) : <p>Loading provider health...</p>}
        </div>
      </div>
    </div>
  );
}
