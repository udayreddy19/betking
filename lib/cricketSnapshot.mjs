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
  getCricketFormatCardBadge,
  isMatchSRL,
  isTestMatch,
} from '../src/utils/cricketSnapshot.js';
