/**
 * State Snapshot & Time-Travel Debugging Engine
 * Periodically creates recoverable state snapshots and supports historical time-travel inspection.
 */

import { canonicalMatchStateEngine } from './canonicalMatchState.mjs';

class StateSnapshotEngine {
  constructor() {
    this.snapshots = new Map(); // snapshotId -> Snapshot Object
    this.matchSnapshotsIndex = new Map(); // matchId -> Array of snapshotIds
  }

  /** Capture state snapshot for a live match */
  captureMatchSnapshot(matchId) {
    const currentState = canonicalMatchStateEngine.getMatchState(matchId);
    if (!currentState) return null;

    const snapshotId = `snp_${matchId}_v${currentState.matchVersion}_${Date.now()}`;
    const snapshot = {
      snapshotId,
      matchId,
      version: currentState.matchVersion || 1,
      eventSequence: currentState.eventSequence || 1,
      timestamp: new Date().toISOString(),
      stateData: JSON.parse(JSON.stringify(currentState)),
    };

    this.snapshots.set(snapshotId, snapshot);

    const index = this.matchSnapshotsIndex.get(matchId) || [];
    index.push(snapshotId);
    if (index.length > 50) index.shift();
    this.matchSnapshotsIndex.set(matchId, index);

    return snapshot;
  }

  /** Read-only time-travel inspection of historical match state */
  getHistoricalStateAtVersion(matchId, targetVersion) {
    const snapshotIds = this.matchSnapshotsIndex.get(matchId) || [];
    for (let i = snapshotIds.length - 1; i >= 0; i--) {
      const snp = this.snapshots.get(snapshotIds[i]);
      if (snp && snp.version === targetVersion) {
        return snp.stateData;
      }
    }
    return null;
  }

  getSnapshotHistory(matchId) {
    const ids = this.matchSnapshotsIndex.get(matchId) || [];
    return ids.map((id) => this.snapshots.get(id)).filter(Boolean);
  }
}

export const stateSnapshotEngine = new StateSnapshotEngine();
