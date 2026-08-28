import { describe, it, expect, beforeEach } from 'vitest';
import { recordAndCheckGeoAnomaly, calculateDistanceKm, clearUserGeoHistory } from '../../lib/geoAnomalyDetector.mjs';

describe('Security & Fraud — Geolocation & Impossible Travel Detection', () => {
  beforeEach(() => {
    clearUserGeoHistory('user_geo_1');
  });

  it('calculates great-circle distance accurately', () => {
    // Mumbai (19.0760, 72.8777) to Delhi (28.7041, 77.1025) ≈ 1148 km
    const dist = calculateDistanceKm(19.076, 72.8777, 28.7041, 77.1025);
    expect(dist).toBeGreaterThan(1100);
    expect(dist).toBeLessThan(1200);
  });

  it('detects impossible travel velocity across continents within short time', () => {
    const t0 = Date.now();
    // 1st login in Mumbai
    recordAndCheckGeoAnomaly('user_geo_1', {
      ip: '103.21.124.1',
      country: 'IN',
      lat: 19.076,
      lon: 72.8777,
    }, t0);

    // 2nd login in London (51.5074, -0.1278) just 10 minutes later (600,000 ms)
    const t1 = t0 + (10 * 60 * 1000);
    const result = recordAndCheckGeoAnomaly('user_geo_1', {
      ip: '185.86.151.1',
      country: 'GB',
      lat: 51.5074,
      lon: -0.1278,
    }, t1);

    expect(result.isAnomalous).toBe(true);
    expect(result.anomalies[0].type).toBe('IMPOSSIBLE_TRAVEL_SPEED');
  });

  it('flags datacenter VPN / proxy connections', () => {
    const res = recordAndCheckGeoAnomaly('user_geo_1', {
      ip: '198.51.100.1',
      country: 'US',
      isVpn: true,
    });
    expect(res.isAnomalous).toBe(true);
    expect(res.anomalies[0].type).toBe('ANONYMOUS_PROXY_OR_VPN');
  });
});
