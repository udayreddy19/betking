import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';

/**
 * Global system status strip showing API/DB/WebSocket/Settlement/Odds/Payments health.
 * Uses existing backend health endpoints.
 */
export default function AdminStatusBar() {
  const [health, setHealth] = useState(null);
  const [serverTime, setServerTime] = useState(new Date().toISOString().slice(0, 16).replace('T', ' '));

  useEffect(() => {
    let cancelled = false;

    const loadHealth = () => {
      adminApiClient.get('/providers/health-matrix')
        .then((data) => {
          if (!cancelled) setHealth(data);
        })
        .catch(() => {
          if (!cancelled) setHealth(null);
        });
    };

    loadHealth();
    const interval = setInterval(loadHealth, 30000);

    // Update clock every 30s
    const clockInterval = setInterval(() => {
      setServerTime(new Date().toISOString().slice(0, 16).replace('T', ' '));
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  const services = [];
  if (health) {
    const matrix = health.matrix || health;
    const entries = Array.isArray(matrix) ? matrix : Object.entries(matrix).map(([name, info]) => ({
      name,
      ...(typeof info === 'string' ? { status: info } : info),
    }));

    entries.forEach((svc) => {
      const name = svc.name || svc.service || 'Unknown';
      const status = String(svc.status || svc.state || '').toUpperCase();
      const isOk = status === 'OK' || status === 'HEALTHY' || status === 'UP' || status === 'ACTIVE' || status === 'CONFIGURED';
      const isDegraded = status === 'DEGRADED' || status === 'SLOW';
      services.push({
        name,
        className: isOk ? 'admin-status-dot--healthy' : isDegraded ? 'admin-status-dot--degraded' : 'admin-status-dot--down',
      });
    });
  }

  // Fallback defaults when health matrix unavailable
  if (!services.length) {
    ['API', 'Database', 'WebSocket'].forEach((name) => {
      services.push({ name, className: 'admin-status-dot--stale' });
    });
  }

  return (
    <div className="admin-shell__statusbar">
      {services.map((svc) => (
        <div key={svc.name} className={`admin-status-dot ${svc.className}`}>
          <span className="admin-status-dot__circle" />
          <span>{svc.name}</span>
        </div>
      ))}
      <div style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
        {serverTime} UTC
      </div>
    </div>
  );
}
