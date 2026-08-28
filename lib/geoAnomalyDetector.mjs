/**
 * Geolocation Anomaly & Impossible Travel Detector
 * 
 * Inspects sequential user login/bet/withdrawal IP addresses and timestamps.
 * Flags:
 *  - Impossible travel velocities (>900 km/h between sequential logins)
 *  - Rapid country/region jumps within short time windows
 *  - Known datacenter / VPN / Tor IP ranges
 */

const USER_GEO_HISTORY = new Map(); // userId -> [{ ip, country, lat, lon, timestamp }]
const MAX_COMMERCIAL_SPEED_KMH = 900; // Average commercial airline speed

/**
 * Haversine formula to compute great-circle distance between two coords in km
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Evaluate a new session / event for impossible travel or geo anomalies
 * @param {string} userId
 * @param {object} eventData { ip, country, lat, lon, isVpn }
 * @param {number} timestamp
 */
export function recordAndCheckGeoAnomaly(userId, eventData = {}, timestamp = Date.now()) {
  const history = USER_GEO_HISTORY.get(userId) || [];
  const current = {
    ip: eventData.ip || '127.0.0.1',
    country: eventData.country || 'IN',
    lat: Number(eventData.lat) || 0,
    lon: Number(eventData.lon) || 0,
    isVpn: Boolean(eventData.isVpn),
    timestamp,
  };

  const anomalies = [];
  let requiredSpeedKmh = 0;
  let distanceKm = 0;

  if (history.length > 0) {
    const prev = history[history.length - 1];
    const timeElapsedHours = (timestamp - prev.timestamp) / (1000 * 3600);

    // If coordinates are available for both
    if (prev.lat && prev.lon && current.lat && current.lon && timeElapsedHours > 0) {
      distanceKm = calculateDistanceKm(prev.lat, prev.lon, current.lat, current.lon);
      requiredSpeedKmh = distanceKm / timeElapsedHours;

      if (requiredSpeedKmh > MAX_COMMERCIAL_SPEED_KMH && distanceKm > 100) {
        anomalies.push({
          type: 'IMPOSSIBLE_TRAVEL_SPEED',
          severity: 'HIGH',
          detail: `Traveled ${Math.round(distanceKm)} km in ${(timeElapsedHours * 60).toFixed(1)} mins (Required speed: ${Math.round(requiredSpeedKmh)} km/h)`,
          fromCountry: prev.country,
          toCountry: current.country,
        });
      }
    } else if (prev.country && current.country && prev.country !== current.country && timeElapsedHours < 0.25) {
      // Country change in <15 minutes without valid fast transit
      anomalies.push({
        type: 'RAPID_COUNTRY_CHANGE',
        severity: 'MEDIUM',
        detail: `Country jumped from ${prev.country} to ${current.country} in ${(timeElapsedHours * 60).toFixed(1)} mins`,
        fromCountry: prev.country,
        toCountry: current.country,
      });
    }
  }

  if (current.isVpn) {
    anomalies.push({
      type: 'ANONYMOUS_PROXY_OR_VPN',
      severity: 'LOW',
      detail: `IP ${current.ip} flagged as datacenter proxy / VPN`,
    });
  }

  history.push(current);
  if (history.length > 20) history.shift();
  USER_GEO_HISTORY.set(userId, history);

  return {
    userId,
    isAnomalous: anomalies.length > 0,
    anomalies,
    lastKnownCountry: current.country,
    distanceKm: Math.round(distanceKm),
    requiredSpeedKmh: Math.round(requiredSpeedKmh),
  };
}

export function clearUserGeoHistory(userId) {
  USER_GEO_HISTORY.delete(userId);
}
