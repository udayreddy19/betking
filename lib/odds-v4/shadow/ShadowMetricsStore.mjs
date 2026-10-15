/**
 * Durable shadow metrics (V3 vs V4 same-fav), file-backed under data/calibration.
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_PATH = path.resolve(
  process.env.CALIBRATION_DATA_DIR || path.resolve(process.cwd(), 'data/calibration'),
  'shadow_metrics.json',
);

const MAX_RECENT = 200;

function emptyStore() {
  return {
    updatedAt: null,
    cricket: { samples: 0, sameFav: 0, sameFavRate: null, shortDeltaAbsSum: 0, medianShortDeltaHint: null, recent: [] },
    otherSports: { samples: 0, sameFav: 0, sameFavRate: null, recent: [] },
  };
}

export class ShadowMetricsStore {
  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
    this.data = emptyStore();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        if (raw && typeof raw === 'object') {
          this.data = { ...emptyStore(), ...raw };
        }
      }
    } catch {
      this.data = emptyStore();
    }
  }

  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.data.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch {
      // non-fatal
    }
  }

  recordCricketCompare(row = {}) {
    const c = this.data.cricket;
    c.samples += 1;
    if (row.sameFav) c.sameFav += 1;
    c.sameFavRate = c.samples > 0 ? Number((c.sameFav / c.samples).toFixed(4)) : null;
    if (Number.isFinite(Number(row.shortDeltaAbs))) {
      c.shortDeltaAbsSum += Number(row.shortDeltaAbs);
      c.medianShortDeltaHint = Number((c.shortDeltaAbsSum / c.samples).toFixed(4));
    }
    c.recent.push({
      at: new Date().toISOString(),
      matchId: row.matchId || null,
      sameFav: !!row.sameFav,
      v3: row.v3 || null,
      v4: row.v4 || null,
      shortDeltaAbs: row.shortDeltaAbs ?? null,
    });
    if (c.recent.length > MAX_RECENT) c.recent.splice(0, c.recent.length - MAX_RECENT);
    this.save();
    return { samples: c.samples, sameFavRate: c.sameFavRate };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }
}

export const defaultShadowMetricsStore = new ShadowMetricsStore();
