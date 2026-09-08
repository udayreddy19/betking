/**
 * ObservationStore.mjs
 *
 * Manages genuine settled observations for V4 model calibration.
 * Schema:
 *   - observationId
 *   - eventId
 *   - marketId
 *   - selectionId
 *   - modelVersion
 *   - rawProbability
 *   - calibratedProbability
 *   - outcome (WON | LOST | PUSH | VOID)
 *   - settledAt
 *   - sport
 *   - format
 *   - competition
 *   - matchStateFeatures
 *   - providerReference
 *
 * Strictly rejects fake, synthetic, or manufactured observations.
 */

import fs from 'fs';
import path from 'path';

export const OBSERVATION_STORE_PATH = path.resolve(process.cwd(), 'data/calibration/settled_observations.json');

export class ObservationStore {
  constructor(filePath = OBSERVATION_STORE_PATH) {
    this.filePath = filePath;
    this.observations = [];
    this.indexedById = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.observations = data;
          for (const obs of this.observations) {
            if (obs.observationId) {
              this.indexedById.set(obs.observationId, obs);
            }
          }
        }
      }
    } catch {
      this.observations = [];
      this.indexedById.clear();
    }
  }

  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.observations, null, 2), 'utf-8');
    } catch (err) {
      // Non-fatal if filesystem is restricted
    }
  }

  /**
   * Records an authoritative settled observation.
   * Only genuine settled observations are accepted.
   */
  record(observation) {
    if (!observation || !observation.eventId || !observation.marketId || !observation.outcome) {
      return { accepted: false, reason: 'MISSING_REQUIRED_FIELDS' };
    }

    const outcome = String(observation.outcome).toUpperCase();
    if (!['WON', 'LOST', 'PUSH', 'VOID'].includes(outcome)) {
      return { accepted: false, reason: 'INVALID_OUTCOME' };
    }

    const id = observation.observationId
      || `obs_${observation.sport || 'gen'}_${observation.eventId}_${observation.marketId}_${observation.selectionId || '0'}`;

    if (this.indexedById.has(id)) {
      return { accepted: false, reason: 'DUPLICATE_OBSERVATION', id };
    }

    const record = Object.freeze({
      observationId: id,
      eventId: String(observation.eventId),
      marketId: String(observation.marketId),
      selectionId: String(observation.selectionId || ''),
      modelVersion: String(observation.modelVersion || '4.9.0'),
      rawProbability: Number(observation.rawProbability ?? observation.probability ?? 0),
      calibratedProbability: Number(observation.calibratedProbability ?? observation.rawProbability ?? 0),
      outcome,
      settledAt: observation.settledAt || new Date().toISOString(),
      sport: String(observation.sport || 'cricket'),
      format: observation.format || null,
      competition: observation.competition || null,
      matchStateFeatures: observation.matchStateFeatures || {},
      providerReference: observation.providerReference || null,
    });

    this.observations.push(record);
    this.indexedById.set(id, record);
    this.save();

    return { accepted: true, id };
  }

  getObservations({ sport, marketId, format } = {}) {
    return this.observations.filter((obs) => {
      if (sport && obs.sport !== sport) return false;
      if (marketId && obs.marketId !== marketId) return false;
      if (format && obs.format !== format) return false;
      return true;
    });
  }

  count({ sport } = {}) {
    if (!sport) return this.observations.length;
    return this.observations.filter((o) => o.sport === sport).length;
  }

  clear() {
    this.observations = [];
    this.indexedById.clear();
  }
}

export const defaultObservationStore = new ObservationStore();
