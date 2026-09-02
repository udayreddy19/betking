import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';

/**
 * Global system status strip showing provider / infra health.
 * Uses admin-health-* class names (not admin-status-dot) to avoid
 * colliding with Header.css's tiny red .admin-status-dot indicator.
 */
function titleCaseStatus(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'Unknown';
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeServices(payload) {
  if (!payload || typeof payload !== 'object') return [];

  let raw = payload.providers || payload.matrix || payload.providerHealth || payload.services || null;

  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    raw = Object.entries(raw).map(([key, info]) => ({
      name: key,
      ...(typeof info === 'string' ? { status: info } : (info || {})),
    }));
  }

  if (!Array.isArray(raw)) return [];

  return raw
    .map((svc, idx) => {
      const name = String(
        svc.providerName || svc.name || svc.service || svc.id || `Service ${idx + 1}`,
      ).trim();
      const status = String(svc.status || svc.state || svc.freshnessStatus || '').toUpperCase();
      const isOk = ['OK', 'HEALTHY', 'UP', 'ACTIVE', 'CONFIGURED', 'FRESH'].includes(status);
      const isDegraded = ['DEGRADED', 'SLOW', 'STALE', 'DELAYED'].includes(status);
      const isDown = ['DOWN', 'OFFLINE', 'ERROR', 'FAILED', 'UNHEALTHY', 'UNREACHABLE'].includes(status);
      let tone = 'unknown';
      if (isOk) tone = 'healthy';
      else if (isDegraded) tone = 'degraded';
      else if (isDown || status) tone = 'down';
      return { name, status: status || 'UNKNOWN', tone };
    })
    .filter((s) => s.name && !['success', 'timestamp', 'mappedMatches', 'activeFallback'].includes(s.name));
}

export default function AdminStatusBar() {
  const [health, setHealth] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [emergency, setEmergency] = useState(null);
  const [serverTime, setServerTime] = useState(() => new Date().toISOString().slice(0, 16).replace('T', ' '));

  useEffect(() => {
    let cancelled = false;

    const loadHealth = () => {
      adminApiClient.get('/providers/health-matrix')
        .then((data) => {
          if (cancelled) return;
          setHealth(data);
          setLoadError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setHealth(null);
          setLoadError(true);
        });
      adminApiClient.get('/emergency/state')
        .then((data) => {
          if (!cancelled) setEmergency(data);
        })
        .catch(() => {
          if (!cancelled) setEmergency(null);
        });
    };

    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    const clockInterval = setInterval(() => {
      setServerTime(new Date().toISOString().slice(0, 16).replace('T', ' '));
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  const services = useMemo(() => {
    const parsed = normalizeServices(health);
    if (parsed.length) return parsed;
    const tone = loadError ? 'down' : 'unknown';
    const status = loadError ? 'UNREACHABLE' : 'UNKNOWN';
    return [
      { name: 'API', status, tone },
      { name: 'Database', status, tone },
      { name: 'WebSocket', status, tone },
    ];
  }, [health, loadError]);

  return (
    <footer className="admin-healthbar" role="status" aria-label="System health">
      <div className="admin-healthbar__items">
        {emergency && !emergency.isNormal && (
          <div
            className="admin-health-chip admin-health-chip--down"
            title={emergency.systemStatus || 'Emergency pause active'}
          >
            <span className="admin-health-chip__dot" aria-hidden="true" />
            <span className="admin-health-chip__name">Kill switch</span>
            <span className="admin-health-chip__status">{titleCaseStatus(emergency.systemStatus || 'ACTIVE')}</span>
          </div>
        )}
        {services.map((svc) => (
          <div
            key={svc.name}
            className={`admin-health-chip admin-health-chip--${svc.tone}`}
            title={`${svc.name}: ${svc.status}`}
          >
            <span className="admin-health-chip__dot" aria-hidden="true" />
            <span className="admin-health-chip__name">{svc.name}</span>
            {svc.tone !== 'healthy' && (
              <span className="admin-health-chip__status">{titleCaseStatus(svc.status)}</span>
            )}
          </div>
        ))}
      </div>
      <div className="admin-healthbar__clock">{serverTime} UTC</div>
    </footer>
  );
}
