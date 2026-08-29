/**
 * Canonical Cricket Match Snapshot Engine (Backend / CommonJS / ESM)
 */

export {
  normalizeTeamToken,
  teamNameMatches,
  isPlaceholderPlayer,
  buildCanonicalMatchSnapshot,
  deriveSelectedInningsView,
  detectCricketMatchFormat,
  getCricketFormatBanner,
  isTestMatch,
} from '../src/utils/cricketSnapshot.js';
