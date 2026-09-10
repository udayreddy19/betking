import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from '../components/AdminToastContext';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { useAdminRole } from '../permissions/AdminRBACGate';
import { startVisibleInterval } from '../utils/visibleInterval';
import {
  ActivityIcon,
  ChartBarIcon,
  ClipboardIcon,
  FlameIcon,
  HandCoinsIcon,
  LayersIcon,
  MegaphoneIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  RefreshCwIcon,
  RocketIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SwordsIcon,
  TriangleAlertIcon,
  UmbrellaIcon,
  UsersIcon,
  WalletIcon,
  ZapIcon,
} from '@animateicons/react/lucide';
import './IPLSRLConsoleView.css';

const ICON_SM = { width: 14, height: 14 };

const TABS = [
  { id: 'desk', label: 'Match Desk', Icon: ActivityIcon },
  { id: 'teams', label: 'Teams', Icon: UsersIcon },
  { id: 'players', label: 'Players', Icon: UsersIcon },
  { id: 'audit', label: 'Audit', Icon: ClipboardIcon },
];

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'league', label: 'League' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done', label: 'Completed' },
];

const BLUEPRINT_PRESETS = [
  { id: 'DEFEND_DEATH_OVER', name: 'Defend Death Over', desc: '6 runs, 1 Wkt (0, 1, W, 0, 1, 0)', Icon: ShieldCheckIcon, balls: [{ type: 'DOT', runs: 0 }, { type: 'SINGLE', runs: 1 }, { type: 'WICKET', runs: 0, subType: 'Bowled' }, { type: 'DOT', runs: 0 }, { type: 'SINGLE', runs: 1 }, { type: 'DOT', runs: 0 }] },
  { id: 'CHASE_CLIMAX', name: 'Chase Climax Thriller', desc: '17 runs, 4-finish (4, 0, 6, 2, 1, 4)', Icon: ZapIcon, balls: [{ type: 'FOUR', runs: 4 }, { type: 'DOT', runs: 0 }, { type: 'SIX', runs: 6 }, { type: 'DOUBLE', runs: 2 }, { type: 'SINGLE', runs: 1 }, { type: 'FOUR', runs: 4 }] },
  { id: 'HAT_TRICK_COLLAPSE', name: 'Hat-trick Collapse', desc: '3 Wickets in an Over (W, W, W, 0, 1, 0)', Icon: FlameIcon, balls: [{ type: 'WICKET', runs: 0, subType: 'Bowled' }, { type: 'WICKET', runs: 0, subType: 'Caught' }, { type: 'WICKET', runs: 0, subType: 'LBW' }, { type: 'DOT', runs: 0 }, { type: 'SINGLE', runs: 1 }, { type: 'DOT', runs: 0 }] },
  { id: 'POWERPLAY_BLITZ', name: 'Powerplay Blitz', desc: '22 runs massacre (4, 6, 4, 2, 6, 0)', Icon: RocketIcon, balls: [{ type: 'FOUR', runs: 4 }, { type: 'SIX', runs: 6 }, { type: 'FOUR', runs: 4 }, { type: 'DOUBLE', runs: 2 }, { type: 'SIX', runs: 6 }, { type: 'DOT', runs: 0 }] },
  { id: 'MAIDEN_OVER', name: 'Maiden Over', desc: '6 Dot Balls (0 runs)', Icon: SparklesIcon, balls: [{ type: 'DOT', runs: 0 }, { type: 'DOT', runs: 0 }, { type: 'DOT', runs: 0 }, { type: 'DOT', runs: 0 }, { type: 'DOT', runs: 0 }, { type: 'DOT', runs: 0 }] },
  { id: 'TIE_SUPER_OVER', name: 'Super Over Thriller', desc: '10 runs / Tie finish (1, 4, 0, 2, 1, 2)', Icon: SwordsIcon, balls: [{ type: 'SINGLE', runs: 1 }, { type: 'FOUR', runs: 4 }, { type: 'DOT', runs: 0 }, { type: 'DOUBLE', runs: 2 }, { type: 'SINGLE', runs: 1 }, { type: 'DOUBLE', runs: 2 }] },
];

const BALL_TYPE_OPTIONS = [
  { type: 'DOT', label: '0 Dot', runs: 0 },
  { type: 'SINGLE', label: '1 Single', runs: 1 },
  { type: 'DOUBLE', label: '2 Double', runs: 2 },
  { type: 'FOUR', label: '4 Four', runs: 4 },
  { type: 'SIX', label: '6 Six', runs: 6 },
  { type: 'WICKET', label: 'Wicket', runs: 0 },
  { type: 'WIDE', label: 'Wide (+1)', runs: 1 },
  { type: 'NO_BALL', label: 'No Ball', runs: 1 },
];

const DIRECTOR_MODE_OPTIONS = [
  { id: 'REALISTIC', label: 'Realistic Normal', desc: 'Standard IPL cricket probabilities', Icon: ActivityIcon },
  { id: 'THRILLER_FINISH', label: 'Thriller Finish', desc: 'Guarantees intense final-over boundary requirement', Icon: SparklesIcon },
  { id: 'IPL_CARNAGE', label: 'IPL Carnage', desc: '215+ boundary blitz with 20+ sixes', Icon: FlameIcon },
  { id: 'COLLAPSE_CLAWBACK', label: 'Collapse & Clawback', desc: 'Early top-order collapse with heroic middle-order recovery', Icon: ChartBarIcon },
  { id: 'SPIN_WEB', label: 'Spin Web Trap', desc: 'Turning pitch with heavy dot-ball pressure', Icon: LayersIcon },
];

const PLAYER_BUFF_OPTIONS = [
  { id: 'GOD_MODE', label: 'God Mode (+45% Boundaries)' },
  { id: 'COLD_SLUMP', label: 'Cold Slump (+Wicket Risk)' },
  { id: 'DEATH_YORKER', label: 'Death Yorker Precision' },
  { id: 'PINCH_HITTER', label: 'Pinch Hitter Blitz' },
];

const MATCH_ZONES = [
  { id: 'control', label: 'Control', Icon: ZapIcon },
  { id: 'whatif', label: 'What-If Matrix', Icon: SparklesIcon },
  { id: 'micromarkets', label: 'Micro-Markets', Icon: ZapIcon },
  { id: 'tactical', label: 'Tactical Radar', Icon: ActivityIcon },
  { id: 'blueprint', label: 'Over Blueprint', Icon: ClipboardIcon },
  { id: 'settle', label: 'Settlement', Icon: ShieldCheckIcon },
  { id: 'preview', label: 'Public Preview', Icon: ActivityIcon },
  { id: 'drift', label: 'Drift Monitor', Icon: TriangleAlertIcon },
  { id: 'report', label: 'Post-Match', Icon: ClipboardIcon },
  { id: 'templates', label: 'Templates', Icon: LayersIcon },
  { id: 'godmode', label: 'God Mode & AI', Icon: SlidersHorizontalIcon },
  { id: 'risk', label: 'Risk & Defense', Icon: ShieldCheckIcon },
  { id: 'cashout', label: 'Cash-Out Desk', Icon: WalletIcon },
  { id: 'wagers', label: 'Wager Tape', Icon: HandCoinsIcon },
  { id: 'toss_squad', label: 'Toss & Lineup', Icon: UsersIcon },
  { id: 'replay', label: 'Ball Replay', Icon: RefreshCwIcon },
  { id: 'weather', label: 'Atmosphere', Icon: UmbrellaIcon },
  { id: 'broadcast', label: 'Broadcast', Icon: MegaphoneIcon },
  { id: 'markets', label: 'Core Markets', Icon: ChartBarIcon },
];

const PHASE_LABEL = {
  pre: 'Pre-match',
  first: '1st innings',
  break: 'Innings break',
  chase: '2nd innings',
  done: 'Finished',
};

function pillClass(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'LIVE') return 'srl-pill srl-pill-live';
  if (v === 'COMPLETED') return 'srl-pill srl-pill-completed';
  if (v === 'PAUSED' || v === 'READY' || v === 'ARMED') return 'srl-pill srl-pill-paused';
  return 'srl-pill srl-pill-muted';
}

function StatusPill({ value }) {
  return <span className={pillClass(value)}>{String(value || '—').toUpperCase()}</span>;
}

function Panel({ title, hint, children }) {
  return (
    <section className="srl-panel">
      <div className="srl-panel-head">
        <h3>{title}</h3>
        {hint && <span className="srl-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h >0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatInr(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** Coerce scorecard player fields (string or { name, ... }) to a safe React text child. */
function playerLabel(value, fallback = '—') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return value.displayName || value.name || value.shortName || fallback;
  }
  return fallback;
}

function fixtureFilter(m, filter) {
  if (filter === 'league') return !m.playoff;
  if (filter === 'playoffs') return !!m.playoff;
  if (filter === 'live') return m.controlStatus === 'LIVE' || m.controlStatus === 'PAUSED';
  if (filter === 'upcoming') return m.controlStatus === 'READY' || m.controlStatus === 'ARMED';
  if (filter === 'done') return m.controlStatus === 'COMPLETED';
  return true;
}

function declarePreview(match, teamId) {
  const book = match?.book || {};
  const home = book.home || { stake: 0, payout: 0, bets: 0 };
  const away = book.away || { stake: 0, payout: 0, bets: 0 };
  const other = book.other || { stake: 0, payout: 0, bets: 0 };
  const isHome = teamId === match.homeTeamId;
  const payout = isHome ? home.payout : away.payout;
  const total = Number(book.totalStake) || (home.stake + away.stake + other.stake);
  const house = total - payout;
  const short = isHome ? match.homeShort : match.awayShort;
  return {
    teamId,
    short,
    payout,
    house,
    total,
    bets: isHome ? home.bets : away.bets,
    heavier: book.heavier === (isHome ? 'home' : 'away'),
  };
}

function pickDefaultMatchId(matches) {
  return matches.find((m) => m.controlStatus === 'LIVE' || m.controlStatus === 'PAUSED')?.matchId
    || matches.find((m) => m.controlStatus === 'READY' || m.controlStatus === 'ARMED')?.matchId
    || matches[0]?.matchId
    || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCOREBOARD HERO — always visible at top of cockpit
   ═══════════════════════════════════════════════════════════════════════════ */
function teamScoreForSide(match, side) {
  const s = match.score || {};
  const i1 = s.innings1 || {};
  const i2 = s.innings2 || {};
  const firstName = String(match.score?.firstTeamName || match.liveDetails?.firstTeamName || '').toLowerCase();
  const chaseName = String(match.score?.chaseTeamName || match.liveDetails?.chaseTeamName || '').toLowerCase();
  const short = String(side === 'home' ? match.homeShort : match.awayShort || '').toLowerCase();
  const full = String(side === 'home' ? match.homeTeam : match.awayTeam || '').toLowerCase();
  const matchesName = (n) => n && (n === short || n === full || n.includes(short) || full.includes(n));

  // Prefer name mapping from live board; fall back to home=1st / away=2nd (sim default).
  if (matchesName(firstName)) return { ...i1, innings: 1 };
  if (matchesName(chaseName)) return { ...i2, innings: 2 };
  return side === 'home' ? { ...i1, innings: 1 } : { ...i2, innings: 2 };
}

function ScoreboardHero({ match }) {
  if (!match) return null;
  const s = match.score || {};
  const clock = match.clock || {};
  const isLive = match.controlStatus === 'LIVE';
  const homeBoard = teamScoreForSide(match, 'home');
  const awayBoard = teamScoreForSide(match, 'away');
  const battingInnings = clock.phase === 'chase' || clock.phase === 'chase-complete' ? 2
    : (clock.phase === 'first' || clock.phase === 'first-complete' ? 1 : null);
  const homeBatting = battingInnings != null && homeBoard.innings === battingInnings;
  const awayBatting = battingInnings != null && awayBoard.innings === battingInnings;

  return (
    <div className="srl-scoreboard-hero">
      <div className={`srl-score-team${homeBatting ? ' is-batting' : ''}`}>
        <span className="srl-score-team-name">
          {match.homeShort}
          {homeBatting && <span className="srl-batting-tag">bat</span>}
        </span>
        <span className="srl-score-runs">{homeBoard.runs || 0}/{homeBoard.wickets || 0}</span>
        <span className="srl-score-overs">{homeBoard.overs || '0.0'} ov</span>
      </div>

      <div className="srl-score-divider">
        <span className="srl-score-vs">vs</span>
        <span className={`srl-phase-pill ${isLive ? ' is-live' : match.controlStatus === 'COMPLETED' ? ' is-completed' : 'is-pre'}`}>
          {isLive && <span className="srl-live-dot" style={{ marginRight: 6 }} />}
          {PHASE_LABEL[clock.phase] || match.controlStatus}
        </span>
        {s.target > 0 && (clock.phase === 'chase' || clock.phase === 'break' || match.dlsTarget) && (
          <span className="srl-score-target">T {s.target}</span>
        )}
      </div>

      <div className={`srl-score-team${awayBatting ? ' is-batting' : ''}`}>
        <span className="srl-score-team-name">
          {match.awayShort}
          {awayBatting && <span className="srl-batting-tag">bat</span>}
        </span>
        <span className="srl-score-runs">{awayBoard.runs || 0}/{awayBoard.wickets || 0}</span>
        <span className="srl-score-overs">{awayBoard.overs || '0.0'} ov</span>
      </div>

      <div className="srl-score-meta-row" style={{ gridColumn: '1 / -1', flexWrap: 'wrap' }}>
        <span>{match.venue} · {match.speed}</span>
        <span>
          Open: <strong>{formatInr(match.book?.totalStake)}</strong>
          {' · '}{(match.book?.home?.bets || 0) + (match.book?.away?.bets || 0) + (match.book?.other?.bets || 0)} bets
        </span>
        {match.toss?.winner && (
          <span className="srl-pill srl-pill-live" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            Toss: {match.toss.winner === match.homeTeamId ? match.homeShort : match.awayShort} ({match.toss.decision})
          </span>
        )}
        {match.autoProfitMaximizer && (
          <span className="srl-pill srl-pill-live" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            Profit Max: {Math.round((match.targetMargin || 0.06) * 100)}%
          </span>
        )}
        {match.incidentQueueLength > 0 && (
          <span className="srl-pill srl-pill-paused" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            {match.incidentQueueLength} queued
            {match.nextQueuedIncident?.type ? ` · next ${match.nextQueuedIncident.type}` : ''}
          </span>
        )}
        {match.scoreAnchorsCount > 0 && (
          <span className="srl-pill srl-pill-live" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            {match.scoreAnchorsCount} anchors active
          </span>
        )}
        {match.scoreDrift?.warning && (
          <span className="srl-pill srl-pill-paused" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            Drift {match.scoreDrift.runsDelta > 0 ? '+' : ''}{match.scoreDrift.runsDelta}r
          </span>
        )}
        {match.integrityHold?.active && (
          <span className="srl-pill srl-pill-completed" style={{ fontSize: '0.68rem', padding: '2px 8px', background: 'var(--srl-danger-bg)', borderColor: 'var(--srl-danger-border)', color: 'var(--srl-danger-text)', fontWeight: 800 }}>
            Integrity hold
          </span>
        )}
        {match.directorMode && match.directorMode !== 'REALISTIC' && (
          <span className="srl-pill srl-pill-live" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            AI Director: {match.directorMode.replace('_', ' ')}
          </span>
        )}
        {match.environment && (
          <span className="srl-pill srl-pill-muted" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            {match.environment.pitchWear?.replace('_', ' ')} · Dew {match.environment.dewFactor}%
          </span>
        )}
        {match.circuitBreaker?.emergencyKillSwitch ? (
          <span className="srl-pill srl-pill-completed" style={{ fontSize: '0.68rem', padding: '2px 8px', background: 'var(--srl-danger-bg)', borderColor: 'var(--srl-danger-border)', color: 'var(--srl-danger-text)', fontWeight: 800 }}>
            Kill Switch Active
          </span>
        ) : match.circuitBreaker?.isTripped ? (
          <span className="srl-pill srl-pill-paused" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
            Circuit Breaker Tripped
          </span>
        ) : null}
        {match.commentary && (
          <span style={{ fontStyle: 'italic', color: 'var(--srl-accent)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.commentary}
          </span>
        )}
      </div>
      {Array.isArray(match.deskAlerts) && match.deskAlerts.length > 0 && (
        <div className="srl-alert-strip" style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {match.deskAlerts.map((a, i) => (
            <span
              key={`${a.code}-${i}`}
              className={`srl-pill ${a.level === 'danger' ? 'srl-pill-completed' : a.level === 'warn' ? 'srl-pill-paused' : 'srl-pill-live'}`}
              style={{ fontSize: '0.68rem', padding: '2px 8px' }}
              title={a.message}
            >
              {a.code}: {a.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function IPLSRLConsoleView() {
  const { showToast } = useAdminToast();
  const { activeRole: adminRole } = useAdminRole();
  const [tab, setTab] = useState('desk');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragMs, setDragMs] = useState(null);
  const [jumpNo, setJumpNo] = useState('1');
  const [jumpAt, setJumpAt] = useState('live');
  const [declareAsk, setDeclareAsk] = useState(null);
  const [marketAsk, setMarketAsk] = useState(null);
  const [clearAnchorsAsk, setClearAnchorsAsk] = useState(false);
  const [killAsk, setKillAsk] = useState(false);
  const [hotkeyHelp, setHotkeyHelp] = useState(false);
  const [injectReason, setInjectReason] = useState('script');
  const [undoCount, setUndoCount] = useState(1);
  const [customPresetName, setCustomPresetName] = useState('');
  const [customPresets, setCustomPresets] = useState([]);
  const [publicPreview, setPublicPreview] = useState(null);
  const [deskCaps, setDeskCaps] = useState(null);
  const [settleTeamId, setSettleTeamId] = useState('');
  const [matchTemplates, setMatchTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [queueRehearsal, setQueueRehearsal] = useState(null);
  const [postMatchReport, setPostMatchReport] = useState(null);
  const [integrityAsk, setIntegrityAsk] = useState(false);
  const [integrityNote, setIntegrityNote] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [shiftNoteDraft, setShiftNoteDraft] = useState('');
  const [soundAlertsOn, setSoundAlertsOn] = useState(true);
  const lastAlertSigRef = useRef('');
  const [marketsDesk, setMarketsDesk] = useState(null);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState(null);
  const [marketFilter, setMarketFilter] = useState('all');
  const [targetInput, setTargetInput] = useState('');
  const [oversReductionInput, setOversReductionInput] = useState('12');
  const [commentaryText, setCommentaryText] = useState('');
  const [commentaryTag, setCommentaryTag] = useState('DRS_REVIEW');
  const [marginBump, setMarginBump] = useState('0.05');
  const [spreadBias, setSpreadBias] = useState('0.00');
  const [showExhibitionModal, setShowExhibitionModal] = useState(false);
  const [exhibitionHome, setExhibitionHome] = useState('csk');
  const [exhibitionAway, setExhibitionAway] = useState('mi');
  const [exhibitionVenue, setExhibitionVenue] = useState('Wankhede Arena');
  const [exhibitionPitch, setExhibitionPitch] = useState('BALANCED');
  const [matchZone, setMatchZone] = useState('control');
  const draggingRef = useRef(false);

  // Over Blueprint & Narrative Presets
  const [selectedBlueprintPreset, setSelectedBlueprintPreset] = useState('DEFEND_DEATH_OVER');
  const [blueprintBalls, setBlueprintBalls] = useState([
    { type: 'DOT', runs: 0 },
    { type: 'SINGLE', runs: 1 },
    { type: 'WICKET', runs: 0, subType: 'Bowled' },
    { type: 'DOT', runs: 0 },
    { type: 'SINGLE', runs: 1 },
    { type: 'DOT', runs: 0 },
  ]);

  // Profit Maximizer
  const [profitMaximizerTarget, setProfitMaximizerTarget] = useState('0.06');

  // Pre-Match Toss & Starting Lineup
  const [tossWinnerKey, setTossWinnerKey] = useState('');
  const [tossDecision, setTossDecision] = useState('BAT');
  const [tossFlipping, setTossFlipping] = useState(false);
  const [homeXIInput, setHomeXIInput] = useState('');
  const [awayXIInput, setAwayXIInput] = useState('');
  const [homeImpactInput, setHomeImpactInput] = useState('');
  const [awayImpactInput, setAwayImpactInput] = useState('');

  // Ball-by-ball Timeline Replay
  const [replayDeliveries, setReplayDeliveries] = useState([]);
  const [replayFallOfWickets, setReplayFallOfWickets] = useState([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayFilter, setReplayFilter] = useState('all');

  // What-If Odds & Liability Matrix
  const [whatIfData, setWhatIfData] = useState(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  // Live Wager Tape & Whale Tracker
  const [wagerTape, setWagerTape] = useState(null);
  const [wagerTapeLoading, setWagerTapeLoading] = useState(false);
  const [selectedBuffPlayer, setSelectedBuffPlayer] = useState('striker');

  // Dynamic Micro-Markets Desk
  const [microMarketsData, setMicroMarketsData] = useState([]);
  const [microMarketsLoading, setMicroMarketsLoading] = useState(false);

  // Tactical Radar (Pitch Map & Wagon Wheel)
  const [tacticalRadar, setTacticalRadar] = useState(null);
  const [tacticalLoading, setTacticalLoading] = useState(false);

  // Live Cash-Out Haircut & Buyback Desk
  const [cashoutData, setCashoutData] = useState(null);
  const [cashoutLoading, setCashoutLoading] = useState(false);

  // Atmosphere Inputs
  const [dewFactorInput, setDewFactorInput] = useState(0);
  const [pitchWearInput, setPitchWearInput] = useState('FRESH_BELTER');
  const [swingIndexInput, setSwingIndexInput] = useState(15);
  const [overcastInput, setOvercastInput] = useState(false);

  // Cashout / Circuit Breaker Inputs
  const [cashoutHaircutInput, setCashoutHaircutInput] = useState('10');
  const [cbVelocityInput, setCbVelocityInput] = useState('100000');
  const [cbPowerplayInput, setCbPowerplayInput] = useState('50000');
  const [cbMiddleInput, setCbMiddleInput] = useState('35000');
  const [cbDeathInput, setCbDeathInput] = useState('15000');

  const applySnap = useCallback((data) =>{
    setSnap(data);
    setSelectedMatchId((prev) =>{
      if (prev && data.matches?.some((m) => m.matchId === prev)) return prev;
      return pickDefaultMatchId(data.matches || []);
    });
  }, []);

  const refresh = useCallback(() =>{
    return adminApiClient.get('/iplsrl/control')
      .then((data) =>{
        applySnap(data);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load SRL control desk'));
  }, [applySnap]);

  useEffect(() =>{
    let cancelled = false;
    setLoading(true);
    refresh().finally(() =>{ if (!cancelled) setLoading(false); });
    const stop = startVisibleInterval(() =>{ refresh().catch(() =>{}); }, 2500, { runImmediately: false });
    adminApiClient.get('/iplsrl/desk-capabilities').then((c) => { if (!cancelled) setDeskCaps(c); }).catch(() => {});
    adminApiClient.get('/iplsrl/script-presets').then((p) => { if (!cancelled) setCustomPresets(p?.custom || []); }).catch(() => {});
    adminApiClient.get('/iplsrl/match-templates').then((t) => { if (!cancelled) setMatchTemplates(t?.templates || []); }).catch(() => {});
    return () =>{
      cancelled = true;
      stop();
    };
  }, [refresh]);

  // Desk presence heartbeat so offline pager knows someone is watching.
  useEffect(() => {
    const beat = () => {
      adminApiClient.post('/iplsrl/desk/heartbeat', {
        matchId: selectedMatchId || null,
      }).catch(() => {});
    };
    beat();
    const stop = startVisibleInterval(beat, 30000, { runImmediately: false });
    return () => stop();
  }, [selectedMatchId]);

  const selected = useMemo(
    () => snap?.matches?.find((m) => m.matchId === selectedMatchId) || null,
    [snap, selectedMatchId],
  );

  useEffect(() => {
    if (!soundAlertsOn || !selected?.deskAlerts?.length) return;
    const critical = selected.deskAlerts.filter((a) => ['AUTO_PAUSE', 'KILL', 'WHALE', 'LIABILITY', 'INTEGRITY'].includes(a.code));
    if (!critical.length) return;
    const sig = critical.map((a) => `${a.code}:${a.message}`).join('|');
    if (sig === lastAlertSigRef.current) return;
    lastAlertSigRef.current = sig;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = critical.some((a) => a.code === 'KILL' || a.code === 'INTEGRITY') ? 880 : 620;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { try { osc.stop(); ctx.close(); } catch { /* ignore */ } }, 180);
    } catch { /* ignore audio failures */ }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const top = critical[0];
      try {
        new Notification(`SRL ${top.code}`, { body: top.message, tag: `srl-${selected.matchId}-${top.code}` });
      } catch { /* ignore */ }
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    showToast(`${critical[0].code}: ${critical[0].message}`, 'error');
  }, [selected?.deskAlerts, selected?.matchId, soundAlertsOn, showToast]);

  useEffect(() =>{
    setDragMs(null);
  }, [selectedMatchId]);

  useEffect(() =>{
    if (!selectedMatchId) {
      setMarketsDesk(null);
      setMarketsError(null);
      return undefined;
    }
    let cancelled = false;
    const loadMarkets = () =>{
      setMarketsLoading(true);
      adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/markets`)
        .then((data) =>{
          if (cancelled) return;
          setMarketsDesk(data);
          setMarketsError(null);
        })
        .catch((err) =>{
          if (cancelled) return;
          setMarketsError(err.message || 'Failed to load markets');
        })
        .finally(() =>{
          if (!cancelled) setMarketsLoading(false);
        });
    };
    loadMarkets();
    const stop = startVisibleInterval(loadMarkets, 5000, { runImmediately: false });
    return () =>{
      cancelled = true;
      stop();
    };
  }, [selectedMatchId]);

  const visibleMarkets = useMemo(() =>{
    const list = marketsDesk?.markets || [];
    if (marketFilter === 'open') {
      return list.filter((m) => String(m.status || '').toUpperCase() === 'OPEN' || (m.book?.bets || 0) >0);
    }
    if (marketFilter === 'staked') return list.filter((m) =>(m.book?.bets || 0) >0);
    if (marketFilter === 'locked') {
      return list.filter((m) => ['SUSPENDED', 'DETERMINED', 'VOID', 'VOIDED', 'SETTLED'].includes(String(m.status || '').toUpperCase()));
    }
    if (marketFilter === 'toss') {
      return list.filter((m) =>/toss|bat_first/i.test(`${m.marketId} ${m.title || ''} ${m.name || ''}`));
    }
    if (marketFilter === 'winner') {
      return list.filter((m) =>/match_winner|winner|most_|top_|h2h/i.test(String(m.marketId || '')));
    }
    if (marketFilter === 'totals') {
      return list.filter((m) =>/total|range|btts|fours|sixes|wickets|ladder/i.test(String(m.marketId || '')));
    }
    if (marketFilter === 'innings') {
      return list.filter((m) =>/^i[12]_/i.test(String(m.marketId || '')) || /innings|team_total|over_|delivery|wicket_in|dismissal/i.test(String(m.marketId || '')));
    }
    return list;
  }, [marketsDesk, marketFilter]);

  const counts = useMemo(() =>{
    const matches = snap?.matches || [];
    return {
      all: matches.length,
      league: matches.filter((m) => fixtureFilter(m, 'league')).length,
      playoffs: matches.filter((m) => fixtureFilter(m, 'playoffs')).length,
      live: matches.filter((m) => fixtureFilter(m, 'live')).length,
      upcoming: matches.filter((m) => fixtureFilter(m, 'upcoming')).length,
      done: matches.filter((m) => fixtureFilter(m, 'done')).length,
    };
  }, [snap]);

  const fixtures = useMemo(() =>{
    const q = query.trim().toLowerCase();
    return (snap?.matches || []).filter((m) =>{
      if (!fixtureFilter(m, filter)) return false;
      if (!q) return true;
      const hay = [
        m.matchNo, m.stageLabel, m.homeShort, m.awayShort, m.homeTeam, m.awayTeam, m.matchId,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [snap, filter, query]);

  const clock = selected?.clock || {};
  const durationMs = Math.max(1, Number(clock.durationMs) || 1);
  const elapsedMs = dragMs != null ? dragMs : Number(clock.elapsedMs) || 0;
  const seasonClock = snap?.seasonClock || {};

  useEffect(() =>{
    if (selected?.matchNo) setJumpNo(String(selected.matchNo));
  }, [selectedMatchId, selected?.matchNo]);

  const run = async (fn, okMsg) =>{
    setBusy(true);
    try {
      const data = await fn();
      if (data?.matches || data?.settings) applySnap(data);
      else if (data?.snapshot) applySnap(data.snapshot);
      else await refresh();
      if (data?.matchId && Array.isArray(data.markets)) setMarketsDesk(data);
      else if (data?.markets?.matchId && Array.isArray(data.markets.markets)) setMarketsDesk(data.markets);
      else if (selectedMatchId) {
        try {
          const md = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/markets`);
          setMarketsDesk(md);
        } catch {
          // keep previous markets desk
        }
      }
      if (okMsg) {
        const board = data?.play?.scoreDisplay ? ` · board ${data.play.scoreDisplay}` : '';
        showToast(`${okMsg}${board}`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() =>{
    const onKey = (e) =>{
      if (!selected?.matchId || busy || selected.controlStatus === 'COMPLETED') return;
      const tag = String(e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setHotkeyHelp((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        run(() => adminApiClient.post('/iplsrl/matches/pause', { matchId: selected.matchId }), 'Paused');
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        run(() => adminApiClient.post('/iplsrl/matches/delivery', { matchId: selected.matchId }), 'Next ball');
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        run(
          () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/undo-inject`, { count: 1 }),
          'Undid last inject',
        );
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        run(
          () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/clear-queue`),
          'Queue cleared',
        );
        return;
      }
      const map = {
        '0': { type: 'DOT', msg: 'Hotkey: Dot' },
        '1': { type: 'SINGLE', msg: 'Hotkey: Single' },
        '4': { type: 'FOUR', msg: 'Hotkey: Four' },
        '6': { type: 'SIX', msg: 'Hotkey: Six' },
        w: { type: 'WICKET', subType: 'Bowled', msg: 'Hotkey: Wicket' },
        W: { type: 'WICKET', subType: 'Bowled', msg: 'Hotkey: Wicket' },
      };
      const hit = map[e.key];
      if (!hit) return;
      e.preventDefault();
      run(
        () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/incident`, {
          type: hit.type,
          ...(hit.subType ? { subType: hit.subType } : {}),
          reasonCode: injectReason,
          instant: true,
        }),
        hit.msg,
      );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected?.matchId, selected?.controlStatus, busy, injectReason]);

  const seek = (body, msg) => run(
    () => adminApiClient.post('/iplsrl/matches/seek', { matchId: selected.matchId, ...body }),
    msg,
  );

  const fetchReplay = useCallback(async () =>{
    if (!selectedMatchId) return;
    setReplayLoading(true);
    try {
      const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/replay`);
      setReplayDeliveries(data?.deliveries || []);
      setReplayFallOfWickets(data?.fallOfWickets || []);
    } catch (err) {
      showToast(err.message || 'Failed to load replay', 'error');
    } finally {
      setReplayLoading(false);
    }
  }, [selectedMatchId, showToast]);

  const fetchWhatIf = useCallback(async () =>{
    if (!selectedMatchId) return;
    setWhatIfLoading(true);
    try {
      const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/what-if`);
      setWhatIfData(data);
    } catch (err) {
      showToast(err.message || 'Failed to calculate What-If matrix', 'error');
    } finally {
      setWhatIfLoading(false);
    }
  }, [selectedMatchId, showToast]);

  const fetchWagers = useCallback(async () =>{
    if (!selectedMatchId) return;
    setWagerTapeLoading(true);
    try {
      const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/wagers`);
      setWagerTape(data);
    } catch (err) {
      showToast(err.message || 'Failed to stream wager tape', 'error');
    } finally {
      setWagerTapeLoading(false);
    }
  }, [selectedMatchId, showToast]);

  const fetchMicroMarkets = useCallback(async () =>{
    if (!selectedMatchId) return;
    setMicroMarketsLoading(true);
    try {
      const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/micro-markets`);
      setMicroMarketsData(data?.markets || []);
    } catch (err) {
      showToast(err.message || 'Failed to load micro-markets', 'error');
    } finally {
      setMicroMarketsLoading(false);
    }
  }, [selectedMatchId, showToast]);

  const fetchTacticalRadar = useCallback(async () =>{
    if (!selectedMatchId) return;
    setTacticalLoading(true);
    try {
      const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/tactical-radar`);
      setTacticalRadar(data);
    } catch (err) {
      showToast(err.message || 'Failed to load tactical radar', 'error');
    } finally {
      setTacticalLoading(false);
    }
  }, [selectedMatchId, showToast]);

  const fetchCashout = useCallback(async () =>{
    if (!selectedMatchId) return;
    setCashoutLoading(true);
    try {
      const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/cashout`);
      setCashoutData(data);
    } catch (err) {
      showToast(err.message || 'Failed to load cashout positions', 'error');
    } finally {
      setCashoutLoading(false);
    }
  }, [selectedMatchId, showToast]);

  useEffect(() =>{
    if (matchZone === 'replay' && selectedMatchId) {
      fetchReplay();
    } else if (matchZone === 'whatif' && selectedMatchId) {
      fetchWhatIf();
    } else if (matchZone === 'wagers' && selectedMatchId) {
      fetchWagers();
    } else if (matchZone === 'micromarkets' && selectedMatchId) {
      fetchMicroMarkets();
    } else if (matchZone === 'tactical' && selectedMatchId) {
      fetchTacticalRadar();
    } else if (matchZone === 'cashout' && selectedMatchId) {
      fetchCashout();
    } else if (matchZone === 'preview' && selectedMatchId) {
      adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/public-preview`)
        .then(setPublicPreview)
        .catch(() => setPublicPreview(null));
    } else if (matchZone === 'report' && selectedMatchId) {
      adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/post-match-report`)
        .then(setPostMatchReport)
        .catch(() => setPostMatchReport(null));
    } else if (matchZone === 'templates') {
      adminApiClient.get('/iplsrl/match-templates')
        .then((t) => setMatchTemplates(t?.templates || []))
        .catch(() => {});
    }
  }, [matchZone, selectedMatchId, fetchReplay, fetchWhatIf, fetchWagers, fetchMicroMarkets, fetchTacticalRadar, fetchCashout]);

  useEffect(() =>{
    if (selected) {
      setTossWinnerKey(selected.toss?.winner || selected.homeTeamId || '');
      setTossDecision(selected.toss?.decision || 'BAT');
      setHomeXIInput((selected.lineup?.homePlayingXI || []).join(', '));
      setAwayXIInput((selected.lineup?.awayPlayingXI || []).join(', '));
      setHomeImpactInput(selected.lineup?.homeImpactPlayer || '');
      setAwayImpactInput(selected.lineup?.awayImpactPlayer || '');
      if (selected.targetMargin) {
        setProfitMaximizerTarget(String(selected.targetMargin));
      }
      if (selected.environment) {
        setDewFactorInput(selected.environment.dewFactor ?? 0);
        setPitchWearInput(selected.environment.pitchWear ?? 'FRESH_BELTER');
        setSwingIndexInput(selected.environment.swingIndex ?? 15);
        setOvercastInput(!!selected.environment.overcast);
      }
      if (selected.cashoutControl) {
        setCashoutHaircutInput(String(Math.round((selected.cashoutControl.globalHaircut ?? 0.10) * 100)));
      }
      if (selected.circuitBreaker) {
        setCbVelocityInput(String(selected.circuitBreaker.velocityLimit ?? 100000));
        setCbPowerplayInput(String(selected.circuitBreaker.stageCaps?.powerplay ?? 50000));
        setCbMiddleInput(String(selected.circuitBreaker.stageCaps?.middle ?? 35000));
        setCbDeathInput(String(selected.circuitBreaker.stageCaps?.death ?? 15000));
      }
    }
  }, [selected?.matchId]);

  const exportAudit = async (format = 'json') =>{
    if (!selected?.matchId) return;
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('oddsyra_admin_token') || '';
      const res = await fetch(`/api/admin/iplsrl/matches/${encodeURIComponent(selected.matchId)}/export${format === 'csv' ? '?format=csv' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `srl_${selected.matchId}_audit.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showToast(`Exported ${format.toUpperCase()} audit log`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const simulateCoinFlip = () =>{
    if (!selected) return;
    setTossFlipping(true);
    setTimeout(() =>{
      const winKey = Math.random() >0.5 ? selected.homeTeamId : selected.awayTeamId;
      const dec = Math.random() >0.4 ? 'BAT' : 'BOWL';
      setTossWinnerKey(winKey);
      setTossDecision(dec);
      setTossFlipping(false);
      const winShort = winKey === selected.homeTeamId ? selected.homeShort : selected.awayShort;
      showToast(`Coin landed! ${winShort} won and elected to ${dec} first.`, 'info');
    }, 500);
  };

  if (loading && !snap) {
    return <div style={{ padding: 40, color: 'var(--admin-text-muted)' }}>Loading OddsYra SRL console…</div>;
  }

  /* ─── RENDER ─── */
  return (
    <div className="srl-console">
      {/* ═══ HERO ═══ */}
      <div className="srl-console-hero">
        <div>
          <p className="srl-console-kicker">Sports · OddsYra SRL</p>
          <h2>Match Control</h2>
          <p>
            Institutional-grade match control cockpit. Select a fixture, manage live play, inject incidents,
            defend margins, and settle markets — all from one screen.
          </p>
          {error && <p className="srl-console-error">{error}</p>}
        </div>
        <div className="srl-console-stats">
          <div className="srl-stat"><strong>{counts.all}</strong><span>Matches</span></div>
          <div className="srl-stat"><strong>{counts.live}</strong><span>Live</span></div>
          <div className="srl-stat"><strong>{counts.upcoming}</strong><span>Upcoming</span></div>
          <div className="srl-stat"><strong>{counts.done}</strong><span>Done</span></div>
        </div>
      </div>

      {/* ═══ TOP TABS ═══ */}
      <div className="srl-tabs">
        {TABS.map((t) =>{
          const TabIcon = t.Icon;
          return (
            <button
              key={t.id}
              type="button"
              className={`srl-tab${tab === t.id ? ' is-on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <TabIcon style={ICON_SM} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════════ MATCH DESK ═══════════════ */}
      {tab === 'desk' && snap && (
        <div className="srl-desk">
          {/* ─── LEFT RAIL: Season + Fixtures ─── */}
          <div className="srl-stack">
            <Panel title="Season"hint={`${snap.season?.name || 'Season'} · Ed ${snap.season?.edition || '—'}`}>
              <div className="srl-settings">
                <label className="srl-field">
                  Speed
                  <select
                    value={snap.settings.speed}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { speed: e.target.value }), `Speed → ${e.target.value}`)}
                  >
                    {(snap.options?.speeds || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="srl-field">
                  Pitch
                  <select
                    value={snap.settings.pitch}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { pitch: e.target.value }), 'Pitch updated')}
                  >
                    {(snap.options?.pitches || []).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="srl-field">
                  Weather
                  <select
                    value={snap.settings.weather}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { weather: e.target.value }), 'Weather updated')}
                  >
                    {(snap.options?.weather || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label className="srl-check">
                <input
                  type="checkbox"
                  checked={!!snap.settings.autoPlay}
                  disabled={busy}
                  onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { autoPlay: e.target.checked }), e.target.checked ? 'Auto-play on' : 'Auto-play off')}
                />
                Auto-play after manual start
              </label>
              <label className="srl-check" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={soundAlertsOn}
                  onChange={(e) => setSoundAlertsOn(e.target.checked)}
                />
                Sound + desktop alerts (pause / kill / whale)
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="srl-btn srl-btn-blue"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => setShowExhibitionModal(true)}
                >
                   Exhibition Match
                </button>
              </div>
            </Panel>

            <Panel title="Season clock"hint={seasonClock.jumped ? 'Offset' : 'Wall clock'}>
              <p className="srl-hint" style={{ margin: '0 0 8px' }}>
                {seasonClock.label || 'Wall clock'}
                {seasonClock.jumped ? ' · users see this time' : ''}
              </p>
              <div className="srl-jump">
                <label className="srl-field">
                  Match #
                  <input
                    className="srl-input"
                    type="number"
                    min={1}
                    max={74}
                    value={jumpNo}
                    disabled={busy}
                    onChange={(e) => setJumpNo(e.target.value)}
                  />
                </label>
                <label className="srl-field">
                  Land at
                  <select
                    className="srl-input"
                    value={jumpAt}
                    disabled={busy}
                    onChange={(e) => setJumpAt(e.target.value)}
                  >
                    <option value="start">Before toss</option>
                    <option value="live">In play</option>
                    <option value="end">Result in</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="srl-btn srl-btn-blue"
                  disabled={busy}
                  onClick={() => run(
                    () => adminApiClient.post('/iplsrl/season/jump', { matchNo: Number(jumpNo), at: jumpAt }),
                    `Season jumped to match #${jumpNo}`,
                  )}
                >
                  Jump
                </button>
                <button
                  type="button"
                  className="srl-btn srl-btn-slate"
                  disabled={busy || !seasonClock.jumped}
                  onClick={() => run(
                    () => adminApiClient.post('/iplsrl/season/reset-clock'),
                    'Season back on wall clock',
                  )}
                >
                  Real time
                </button>
              </div>
            </Panel>

            <Panel
              title="Desk coverage"
              hint={snap.deskCoverage?.seniorOnline ? 'Senior online' : (snap.deskCoverage?.onlineCount ? 'No senior' : 'Offline')}
            >
              <p className="srl-hint" style={{ margin: '0 0 8px' }}>
                {snap.deskCoverage?.onlineCount || 0} online
                {snap.deskCoverage?.seniorOnline ? ' · senior present' : ' · no senior'}
                {snap.deskCoverage?.deskOffline ? ' · pager will fire if LIVE' : ''}
              </p>
              <div className="srl-fixture-list" style={{ maxHeight: 120 }}>
                {(snap.deskCoverage?.online || []).slice(0, 6).map((p) => (
                  <div key={p.adminId} className="srl-hint" style={{ margin: '0 0 4px' }}>
                    <strong>{p.adminId}</strong> · {p.role}{p.matchId ? ` · ${p.matchId}` : ''}
                  </div>
                ))}
                {!snap.deskCoverage?.onlineCount && (
                  <p className="srl-hint" style={{ margin: 0 }}>Heartbeat starts when this console is open.</p>
                )}
              </div>
              <label className="srl-field" style={{ marginTop: 8 }}>
                Shift note
                <textarea
                  className="srl-input"
                  rows={2}
                  value={shiftNoteDraft}
                  placeholder="Hand-off notes for the next operator…"
                  onChange={(e) => setShiftNoteDraft(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="srl-btn srl-btn-slate"
                style={{ marginTop: 6 }}
                disabled={busy || !String(shiftNoteDraft || '').trim()}
                onClick={() => {
                  const text = String(shiftNoteDraft || '').trim();
                  run(
                    () => adminApiClient.post('/iplsrl/desk/shift-notes', { text }),
                    'Shift note saved',
                  ).then(() => setShiftNoteDraft(''));
                }}
              >
                Post shift note
              </button>
              <div style={{ marginTop: 8 }}>
                {(snap.shiftNotes || []).slice(0, 4).map((n) => (
                  <div key={n.id} className="srl-hint" style={{ marginBottom: 4 }}>
                    <strong>{n.admin}</strong>: {n.text}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Fixtures"hint={`${fixtures.length} of ${counts.all}`}>
              <div className="srl-filters" style={{ marginBottom: 8 }}>
                {FILTERS.map((f) =>(
                  <button
                    key={f.id}
                    type="button"
                    className={`srl-filter${filter === f.id ? ' is-on' : ''}`}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label} · {counts[f.id]}
                  </button>
                ))}
              </div>
              <label className="srl-field srl-fixture-search">
                Search
                <input
                  type="search"
                  value={query}
                  placeholder="Team, #, Qualifier…"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="srl-fixture-list">
                {fixtures.map((m) =>(
                  <button
                    key={m.matchId}
                    type="button"
                    className={`srl-fixture${selectedMatchId === m.matchId ? ' is-on' : ''}${m.playoff ? ' is-playoff' : ''}${m.bettingClosed ? ' is-closed' : ''}`}
                    onClick={() => setSelectedMatchId(m.matchId)}
                  >
                    <div className="srl-fixture-top">
                      <strong>
                        {m.matchNo ? `#${m.matchNo} ` : ''}
                        {m.homeShort} vs {m.awayShort}
                      </strong>
                      <StatusPill value={m.bettingClosed ? 'BET OFF' : m.controlStatus} />
                    </div>
                    <div className="srl-fixture-meta">
                      {m.stageLabel || 'League'} · {m.date} · {m.timeDisplay || '—'}
                    </div>
                    <div className="srl-fixture-note" style={{ color: m.forcedWinnerName ? '#34d399' : undefined }}>
                      {m.needsSettlement
                        ? 'Needs settle / pay'
                        : m.controlStatus === 'COMPLETED'
                          ? (m.score?.result || 'Completed')
                          : m.forcedWinnerName
                            ? `Scripted: ${m.forcedWinnerName}`
                            : `${m.score?.innings1?.runs || 0}/${m.score?.innings1?.wickets || 0} → ${m.score?.innings2?.runs || 0}/${m.score?.innings2?.wickets || 0}`}
                    </div>
                    <div className="srl-fixture-meta" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {m.clockDriven && <span className="srl-pill" style={{ fontSize: '0.62rem' }}>Clock</span>}
                      {Number(m.msToStart) > 0 && Number(m.msToStart) <= 15 * 60_000 && (
                        <span className="srl-pill srl-pill-paused" style={{ fontSize: '0.62rem' }}>Soon</span>
                      )}
                      {m.needsSettlement && (
                        <span className="srl-pill srl-pill-live" style={{ fontSize: '0.62rem' }}>Settle</span>
                      )}
                    </div>
                    <div className="srl-progress-mini"aria-hidden="true">
                      <i style={{ width: `${Math.max(0, Math.min(100, m.clock?.progressPct || 0))}%` }} />
                    </div>
                  </button>
                ))}
                {!fixtures.length && (
                  <p className="srl-hint" style={{ margin: 0 }}>No fixtures in this filter.</p>
                )}
              </div>
            </Panel>
          </div>

          {/* ─── RIGHT: Match Cockpit ─── */}
          <div className="srl-stack">
            {!selected ? (
              <Panel title="Select a match"hint="Pick a fixture from the rail">
                <p className="srl-hint" style={{ margin: 0 }}>Select a fixture to open the cockpit.</p>
              </Panel>
            ) : (
              <>
                {/* Scoreboard Hero — always visible */}
                <ScoreboardHero match={selected} />

                <div className="srl-mobile-ops" aria-label="Mobile ops controls">
                  <button type="button" className="srl-btn srl-btn-orange" disabled={busy || selected.controlStatus !== 'LIVE'} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/pause', { matchId: selected.matchId }), 'Paused')}>Pause</button>
                  <button type="button" className="srl-btn srl-btn-teal" disabled={busy || selected.controlStatus !== 'PAUSED'} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/resume', { matchId: selected.matchId }), 'Resumed')}>Resume</button>
                  <button type="button" className="srl-btn srl-btn-blue" disabled={busy || selected.controlStatus === 'COMPLETED'} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/delivery', { matchId: selected.matchId }), 'Next ball')}>Next</button>
                  {['0', '1', '4', '6', 'W'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="srl-btn srl-btn-slate srl-mobile-ops__inject"
                      disabled={busy || selected.controlStatus === 'COMPLETED'}
                      onClick={() => run(
                        () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/incident`, {
                          type: k === 'W' ? 'WICKET' : (k === '0' ? 'DOT' : (k === '1' ? 'SINGLE' : (k === '4' ? 'FOUR' : 'SIX'))),
                          ...(k === 'W' ? { subType: 'Bowled' } : {}),
                          reasonCode: injectReason,
                          instant: true,
                        }),
                        `Inject ${k}`,
                      )}
                    >
                      {k}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="srl-btn srl-btn-amber"
                    disabled={busy || selected.controlStatus === 'COMPLETED' || deskCaps?.canDeclare === false}
                    onClick={() => setDeclareAsk(declarePreview(selected, selected.homeTeamId))}
                  >
                    Dec {selected.homeShort}
                  </button>
                </div>

                {/* Match Zone Tabs */}
                <div className="srl-match-tabs">
                  {MATCH_ZONES.map((z) =>{
                    const ZoneIcon = z.Icon;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        className={`srl-match-tab${matchZone === z.id ? ' is-on' : ''}`}
                        onClick={() => setMatchZone(z.id)}
                      >
                        <ZoneIcon />
                        {z.label}
                      </button>
                    );
                  })}
                </div>

                {/* ═══ ZONE: CONTROL ═══ */}
                {matchZone === 'control' && (
                  <div className="srl-tab-body" key="control">
                    {/* Timeline */}
                    <div className="srl-timeline">
                      <div className="srl-timeline-top">
                        <span>{PHASE_LABEL[clock.phase] || 'Clock'}</span>
                        <span>{formatClock(elapsedMs)} / {formatClock(durationMs)}</span>
                      </div>
                      <input
                        className="srl-slider"
                        type="range"
                        min={0}
                        max={Math.max(1, durationMs - 1)}
                        step={Math.max(1000, Number(clock.msPerBall) || 1000)}
                        value={Math.min(elapsedMs, durationMs - 1)}
                        disabled={busy || selected.controlStatus === 'COMPLETED'}
                        onPointerDown={() =>{
                          draggingRef.current = true;
                          setDragMs(elapsedMs);
                        }}
                        onChange={(e) => setDragMs(Number(e.target.value))}
                        onPointerUp={(e) =>{
                          if (!draggingRef.current) return;
                          draggingRef.current = false;
                          commitSeek(Number(e.currentTarget.value), selected.controlStatus === 'PAUSED');
                        }}
                      />
                      <div className="srl-markers">
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'over_back', pause: true }, 'Rewound one over')}>−1 over</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'ball' }, 'Advanced one ball')}>+1 ball</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'over' }, 'Skipped one over')}>+1 over</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'innings_break', pause: true }, 'Jumped to innings break')}>Innings break</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'second_innings' }, 'Opened 2nd innings')}>2nd innings</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'finish', pause: true }, 'Jumped to the death')}>Death overs</button>
                      </div>
                    </div>

                    {/* Play controls */}
                    <div className="srl-zone" style={{ marginTop: 12 }}>
                      <div className="srl-zone-label --accent">Match Controls</div>
                      <div className="srl-actions">
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          disabled={busy || selected.controlStatus === 'LIVE' || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(() => adminApiClient.post('/iplsrl/matches/start', { matchId: selected.matchId }), 'Match started for users')}
                        >
                          <PlayIcon style={ICON_SM} /> Start
                        </button>
                        {selected.canPause ? (
                          <button type="button" className="srl-btn srl-btn-slate" disabled={busy} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/pause', { matchId: selected.matchId }), 'Paused')}>
                            <PauseIcon style={ICON_SM} /> Pause
                          </button>
                        ) : (
                          <button type="button" className="srl-btn srl-btn-teal" disabled={busy || !selected.canResume} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/resume', { matchId: selected.matchId }), 'Resumed')}>
                            <PlayIcon style={ICON_SM} /> Resume
                          </button>
                        )}
                        <select
                          className="srl-input"
                          value={selected.speed}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onChange={(e) => run(() => adminApiClient.post('/iplsrl/matches/speed', { matchId: selected.matchId, speed: e.target.value }), `Speed ${e.target.value}`)}
                          style={{ height: 36, maxWidth: 120, borderRadius: 999 }}
                        >
                          {(snap.options?.speeds || []).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate"
                          disabled={busy}
                          onClick={() => run(() => adminApiClient.post('/iplsrl/matches/reset', { matchId: selected.matchId }), 'Returned to published clock')}
                        >
                          Reset to clock
                        </button>
                        <button
                          type="button"
                          className={`srl-btn ${selected.bettingClosed ? 'srl-btn-teal' : 'srl-btn-orange'}`}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post('/iplsrl/matches/betting', {
                              matchId: selected.matchId,
                              closed: !selected.bettingClosed,
                            }),
                            selected.bettingClosed ? 'Betting opened' : 'Betting closed for users',
                          )}
                        >
                          {selected.bettingClosed ? 'Open betting' : 'Close betting'}
                        </button>
                      </div>
                    </div>

                    {/* Winner control */}
                    <div className="srl-winner" style={{ marginTop: 12 }}>
                      <div className="srl-winner-label">Winner control</div>
                      <div className="srl-actions" style={{ marginBottom: 8 }}>
                        <button
                          type="button"
                          className={`srl-btn srl-btn-script${selected.forcedWinnerTeamId === selected.homeTeamId ? ' is-on' : ''}`}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: selected.homeTeamId }),
                            `${selected.homeShort} set to win`,
                          )}
                        >
                          Script {selected.homeShort}
                        </button>
                        <button
                          type="button"
                          className={`srl-btn srl-btn-script${selected.forcedWinnerTeamId === selected.awayTeamId ? ' is-on' : ''}`}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: selected.awayTeamId }),
                            `${selected.awayShort} set to win`,
                          )}
                        >
                          Script {selected.awayShort}
                        </button>
                      </div>
                      {selected.forcedWinnerTeamId && selected.controlStatus !== 'COMPLETED' && (
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate srl-btn-wide"
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: null }),
                            'Winner cleared',
                          )}
                          style={{ marginBottom: 8 }}
                        >
                          Clear scripted winner
                        </button>
                      )}
                      <div className="srl-actions" style={{ marginBottom: 0 }}>
                        <button
                          type="button"
                          className="srl-btn srl-btn-amber"
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => {
                            if (deskCaps?.canDeclare === false) {
                              showToast('Senior desk required to declare', 'error');
                              return;
                            }
                            setDeclareAsk(declarePreview(selected, selected.homeTeamId));
                          }}
                        >
                          Declare {selected.homeShort} now
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-amber"
                          disabled={busy || selected.controlStatus === 'COMPLETED' || deskCaps?.canDeclare === false}
                          onClick={() => {
                            if (deskCaps?.canDeclare === false) {
                              showToast('Senior desk required to declare', 'error');
                              return;
                            }
                            setDeclareAsk(declarePreview(selected, selected.awayTeamId));
                          }}
                        >
                          Declare {selected.awayShort} now
                        </button>
                      </div>
                    </div>

                    {/* Open stakes */}
                    <div className="srl-book" style={{ marginTop: 12 }}>
                      <div className="srl-winner-label" style={{ color: 'var(--srl-live)' }}>Open stakes · match winner</div>
                      <div className="srl-book-grid">
                        <div className={`srl-book-side${selected.book?.heavier === 'home' ? ' is-heavy' : ''}`}>
                          <span>{selected.homeShort}</span>
                          <strong>{formatInr(selected.book?.home?.stake)}</strong>
                          <em>{selected.book?.home?.bets || 0} bets · pays {formatInr(selected.book?.home?.payout)}</em>
                        </div>
                        <div className={`srl-book-side${selected.book?.heavier === 'away' ? ' is-heavy' : ''}`}>
                          <span>{selected.awayShort}</span>
                          <strong>{formatInr(selected.book?.away?.stake)}</strong>
                          <em>{selected.book?.away?.bets || 0} bets · pays {formatInr(selected.book?.away?.payout)}</em>
                        </div>
                      </div>
                      {selected.book?.other?.stake >0 && (
                        <p className="srl-hint" style={{ margin: '8px 0 0' }}>
                          Other markets: {formatInr(selected.book.other.stake)} across {selected.book.other.bets} bets
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: WHAT-IF SIMULATOR ═══ */}
                {matchZone === 'whatif' && (
                  <div className="srl-tab-body" key="whatif">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>"What-If"Pre-Flight Odds & Liability Radar</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="srl-btn srl-btn-slate"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            disabled={busy || whatIfLoading}
                            onClick={fetchWhatIf}
                          >
                             Recalculate Matrix
                          </button>
                        </div>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Simulates exact odds drift, board score, and net house profit across all potential ball outcomes before triggering delivery.
                      </p>

                      {whatIfData?.bestHousePick && (
                        <div className="srl-optimal-pick-card" style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              <span className="srl-pill srl-pill-live" style={{ background: 'var(--srl-live-bg)', color: 'var(--srl-live)', borderColor: 'var(--srl-live)' }}>
                                 Optimal House Pick
                              </span>
                              <strong style={{ marginLeft: 8, fontSize: '0.95rem' }}>
                                {whatIfData.bestHousePick.label} → {whatIfData.bestHousePick.marginImpact} House Edge
                              </strong>
                              <p className="srl-hint" style={{ margin: '2px 0 0' }}>
                                New Board: {whatIfData.bestHousePick.projectedScore} (Ov {whatIfData.bestHousePick.projectedOvers}) · {whatIfData.bestHousePick.projectedOdds.homeShort} {whatIfData.bestHousePick.projectedOdds.home} vs {whatIfData.bestHousePick.projectedOdds.awayShort} {whatIfData.bestHousePick.projectedOdds.away}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="srl-btn srl-btn-teal"
                              disabled={busy || selected.controlStatus === 'COMPLETED'}
                              onClick={() =>{
                                run(
                                  () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/what-if/execute`, {
                                    type: whatIfData.bestHousePick.type,
                                    subType: whatIfData.bestHousePick.subType || undefined,
                                    nudgeMarkets: true,
                                  }),
                                  `Executed Optimal Pick: ${whatIfData.bestHousePick.label}!`,
                                ).then(fetchWhatIf);
                              }}
                            >
                               Execute Optimal Pick
                            </button>
                          </div>
                        </div>
                      )}

                      {whatIfLoading && !whatIfData ? (
                        <p className="srl-hint">Computing live liability scenarios…</p>
                      ) : !whatIfData?.scenarios ? (
                        <p className="srl-hint">No scenario matrix available. Click Recalculate to generate.</p>
                      ) : (
                        <div className="srl-whatif-table-wrapper">
                          <table className="srl-whatif-table">
                            <thead>
                              <tr>
                                <th>Delivery Outcome</th>
                                <th>Projected Board</th>
                                <th>Projected Odds</th>
                                <th>House Net P&L</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {whatIfData.scenarios.map((sc) =>{
                                const isPos = sc.projectedHousePnl >= 0;
                                return (
                                  <tr key={sc.type} className={sc.recommended ? ' is-recommended' : ''}>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span className={`srl-ball-chip --${sc.type.toLowerCase().includes('wicket') ? 'wicket' : sc.type.toLowerCase()}`}>
                                          {sc.wicket ? 'W' : sc.runs}
                                        </span>
                                        <strong>{sc.label}</strong>
                                        {sc.recommended && (
                                          <span className="srl-pill srl-pill-live" style={{ fontSize: '0.64rem', padding: '1px 6px' }}>
                                            BEST
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td>
                                      <strong>{sc.projectedScore}</strong>
                                      <span className="srl-hint" style={{ marginLeft: 6 }}>({sc.projectedOvers} ov)</span>
                                    </td>
                                    <td>
                                      <span style={{ fontSize: '0.82rem' }}>
                                        {sc.projectedOdds.homeShort}: <strong>{sc.projectedOdds.home}</strong> · {sc.projectedOdds.awayShort}: <strong>{sc.projectedOdds.away}</strong>
                                      </span>
                                    </td>
                                    <td>
                                      <strong style={{ color: isPos ? 'var(--srl-live)' : 'var(--srl-danger-text)' }}>
                                        {sc.marginImpact}
                                      </strong>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="srl-btn srl-btn-blue"
                                        style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                                        disabled={busy || selected.controlStatus === 'COMPLETED'}
                                        onClick={() =>{
                                          run(
                                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/what-if/execute`, {
                                              type: sc.type,
                                              subType: sc.subType || undefined,
                                              nudgeMarkets: true,
                                            }),
                                            `Executed ${sc.label}!`,
                                          ).then(fetchWhatIf);
                                        }}
                                      >
                                        Execute
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: DYNAMIC MICRO-MARKETS ═══ */}
                {matchZone === 'micromarkets' && (
                  <div className="srl-tab-body" key="micromarkets">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Dynamic Micro-Markets & Rapid Flash Desk</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="srl-btn srl-btn-slate"
                            style={{ height: 30, fontSize: '0.72rem', padding: '0 8px' }}
                            disabled={busy || microMarketsLoading}
                            onClick={fetchMicroMarkets}
                          >
                             Refresh
                          </button>
                          <button
                            type="button"
                            className="srl-btn srl-btn-orange"
                            style={{ height: 30, fontSize: '0.72rem', padding: '0 8px' }}
                            disabled={busy}
                            onClick={() => run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/micro-markets/mass-suspend`, { suspend: true }),
                              'All micro-markets SUSPENDED',
                            ).then(fetchMicroMarkets)}
                          >
                             Mass Suspend All
                          </button>
                          <button
                            type="button"
                            className="srl-btn srl-btn-teal"
                            style={{ height: 30, fontSize: '0.72rem', padding: '0 8px' }}
                            disabled={busy}
                            onClick={() => run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/micro-markets/mass-suspend`, { suspend: false }),
                              'All micro-markets OPENED',
                            ).then(fetchMicroMarkets)}
                          >
                             Open All
                          </button>
                        </div>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Rapid flash markets priced dynamically from in-play match state. Adjust per-market house edge or suspend ahead of volatile deliveries.
                      </p>

                      {microMarketsLoading && !microMarketsData.length ? (
                        <p className="srl-hint">Loading micro-markets...</p>
                      ) : (
                        <div className="srl-micromarket-grid">
                          {microMarketsData.map((mkt) =>{
                            const isSuspended = mkt.status === 'SUSPENDED';
                            return (
                              <div key={mkt.id} className={`srl-micromarket-card${isSuspended ? ' is-suspended' : ''}`}>
                                <div className="srl-micromarket-head">
                                  <div>
                                    <strong style={{ fontSize: '0.92rem', color: 'var(--admin-text)' }}>{mkt.title}</strong>
                                    <p className="srl-hint" style={{ margin: '2px 0 0', fontSize: '0.72rem' }}>{mkt.subtitle}</p>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className={`srl-pill ${isSuspended ? 'srl-pill-paused' : 'srl-pill-live'}`}>
                                      {mkt.status}
                                    </span>
                                    <span className="srl-pill srl-pill-slate">
                                      {Math.round((mkt.holdPercent || 0.08) * 100)}% Juice
                                    </span>
                                  </div>
                                </div>

                                <div className="srl-micromarket-outcomes">
                                  {(mkt.outcomes || []).map((outc) =>(
                                    <div key={outc.id} className="srl-micromarket-outcome-row">
                                      <span className="srl-outcome-name">{outc.label}</span>
                                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                        <span className="srl-outcome-liability"title="Matched Liability">
                                          Liab: {formatInr(outc.liability || 0)}
                                        </span>
                                        <span className="srl-outcome-odds">{Number(outc.odds).toFixed(2)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="srl-micromarket-actions">
                                  <button
                                    type="button"
                                    className={`srl-btn ${isSuspended ? 'srl-btn-teal' : 'srl-btn-orange'}`}
                                    style={{ flex: 1, height: 32, fontSize: '0.75rem' }}
                                    disabled={busy}
                                    onClick={() => run(
                                      () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/micro-markets/toggle`, {
                                        marketId: mkt.id,
                                        status: isSuspended ? 'OPEN' : 'SUSPENDED',
                                      }),
                                      `${mkt.title} is now ${isSuspended ? 'OPEN' : 'SUSPENDED'}`,
                                    ).then(fetchMicroMarkets)}
                                  >
                                    {isSuspended ? 'Resume Market' : 'Suspend'}
                                  </button>

                                  <select
                                    className="srl-input"
                                    style={{ width: 110, height: 32, fontSize: '0.75rem' }}
                                    value={String(mkt.holdPercent || 0.08)}
                                    disabled={busy}
                                    onChange={(e) => run(
                                      () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/micro-markets/margin`, {
                                        marketId: mkt.id,
                                        holdPercent: Number(e.target.value),
                                      }),
                                      `Margin for ${mkt.title} set to ${Math.round(Number(e.target.value) * 100)}%`,
                                    ).then(fetchMicroMarkets)}
                                  >
                                    <option value="0.05">5% Juice</option>
                                    <option value="0.08">8% Standard</option>
                                    <option value="0.10">10% Firm</option>
                                    <option value="0.12">12% High-Edge</option>
                                    <option value="0.15">15% Max Edge</option>
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: 2D TACTICAL RADAR (PITCH MAP & WAGON WHEEL) ═══ */}
                {matchZone === 'tactical' && (
                  <div className="srl-tab-body" key="tactical">
                    <div className="srl-zone">
                      <div className="srl-zone-label --info" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>2D Tactical Pitch Map & Wagon Wheel Visualizer</span>
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate"
                          style={{ height: 30, fontSize: '0.72rem', padding: '0 8px' }}
                          disabled={busy || tacticalLoading}
                          onClick={fetchTacticalRadar}
                        >
                           Refresh Radar
                        </button>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 14px' }}>
                        Real-time delivery trajectory radar tracking pitch length distribution, radial wagon-wheel scoring sectors, and batsman vs bowler duel intelligence.
                      </p>

                      <div className="srl-tactical-layout">
                        {/* 2D Pitch Map */}
                        <div className="srl-tactical-card">
                          <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--srl-accent-strong)' }}>
                             2D Pitch Length Density
                          </h4>
                          <div className="srl-pitch-field">
                            <div className="srl-crease --bowling">Bowling Crease</div>
                            <div className="srl-pitch-zone --short">
                              <span>Short Pitch (Bouncer)</span>
                              <strong>{tacticalRadar?.pitchHeat?.SHORT_PITCH || 0} balls</strong>
                            </div>
                            <div className="srl-pitch-zone --back">
                              <span>Back of Length</span>
                              <strong>{tacticalRadar?.pitchHeat?.BACK_OF_LENGTH || 0} balls</strong>
                            </div>
                            <div className="srl-pitch-zone --good">
                              <span>Good Length (Channel)</span>
                              <strong>{tacticalRadar?.pitchHeat?.GOOD_LENGTH || 0} balls</strong>
                            </div>
                            <div className="srl-pitch-zone --full">
                              <span>Full Length (Drive)</span>
                              <strong>{tacticalRadar?.pitchHeat?.FULL_LENGTH || 0} balls</strong>
                            </div>
                            <div className="srl-pitch-zone --yorker">
                              <span>Yorker Zone (Base of Stumps)</span>
                              <strong>{tacticalRadar?.pitchHeat?.YORKER || 0} balls</strong>
                            </div>
                            <div className="srl-crease --popping">Popping Crease & Stumps</div>
                          </div>
                        </div>

                        {/* Wagon Wheel Radar */}
                        <div className="srl-tactical-card">
                          <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--srl-accent-strong)' }}>
                             360° Radial Wagon Wheel
                          </h4>
                          <div className="srl-wagon-grid">
                            {Object.entries(tacticalRadar?.wagonWheel || {
                              THIRD_MAN: { runs: 0, boundaries: 0 },
                              POINT: { runs: 0, boundaries: 0 },
                              COVER: { runs: 0, boundaries: 0 },
                              MID_OFF: { runs: 0, boundaries: 0 },
                              LONG_ON: { runs: 0, boundaries: 0 },
                              MID_WICKET: { runs: 0, boundaries: 0 },
                              SQUARE_LEG: { runs: 0, boundaries: 0 },
                              FINE_LEG: { runs: 0, boundaries: 0 },
                            }).map(([sector, data]) =>(
                              <div key={sector} className="srl-wagon-sector">
                                <span className="srl-wagon-sector-name">{sector.replace('_', ' ')}</span>
                                <div className="srl-wagon-sector-stats">
                                  <strong>{data.runs ?? 0}r</strong>
                                  <span className="srl-hint" style={{ fontSize: '0.7rem' }}>
                                    {data.boundaries ?? 0} bdry
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Head-to-Head Duel Card */}
                        <div className="srl-tactical-card" style={{ gridColumn: '1 / -1' }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--srl-accent-strong)' }}>
                             Striker vs Bowler Head-to-Head Intelligence
                          </h4>
                          <div className="srl-h2h-duel-box">
                            <div className="srl-h2h-names">
                              <div className="srl-h2h-player">
                                <span className="srl-hint">Striker</span>
                                <strong>{playerLabel(tacticalRadar?.h2hMatchup?.striker || selected.score?.liveDetails?.batsman || selected.score?.liveDetails?.batter1, 'Striker')}</strong>
                              </div>
                              <span className="srl-h2h-vs">VS</span>
                              <div className="srl-h2h-player">
                                <span className="srl-hint">Bowler</span>
                                <strong>{playerLabel(tacticalRadar?.h2hMatchup?.bowler || selected.score?.liveDetails?.bowler, 'Bowler')}</strong>
                              </div>
                            </div>
                            <div className="srl-h2h-metrics">
                              <div className="srl-h2h-metric">
                                <label>Balls Faced</label>
                                <span>{tacticalRadar?.h2hMatchup?.ballsFaced ?? 0}</span>
                              </div>
                              <div className="srl-h2h-metric">
                                <label>Runs Scored</label>
                                <span style={{ color: 'var(--srl-live)' }}>{tacticalRadar?.h2hMatchup?.runsScored ?? 0}</span>
                              </div>
                              <div className="srl-h2h-metric">
                                <label>Strike Rate</label>
                                <span>{tacticalRadar?.h2hMatchup?.strikeRate ?? '0.0'}</span>
                              </div>
                              <div className="srl-h2h-metric">
                                <label>Dismissals</label>
                                <span style={{ color: 'var(--srl-danger-text)' }}>{tacticalRadar?.h2hMatchup?.dismissals ?? 0}</span>
                              </div>
                              <div className="srl-h2h-metric">
                                <label>Dot Ball %</label>
                                <span>{tacticalRadar?.h2hMatchup?.dotBallPercent ?? 0}%</span>
                              </div>
                            </div>
                            <div className="srl-h2h-verdict">
                              <span>Tactical Advantage:</span>
                              <strong>{tacticalRadar?.h2hMatchup?.verdict || 'Awaiting live duel deliveries'}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: OVER BLUEPRINT ═══ */}
                {matchZone === 'blueprint' && (
                  <div className="srl-tab-body" key="blueprint">
                    {/* Narrative Presets */}
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between' }}>
                        <span>Narrative Presets (1-Click 6-Ball Scripts)</span>
                        {selected.incidentQueueLength > 0 && (
                          <span className="srl-pill srl-pill-paused">
                            {selected.incidentQueueLength} queued for later balls
                          </span>
                        )}
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Queue high-drama narrative sequences for TV thriller finishes, batting collapses, or death-over defenses.
                      </p>
                      <div className="srl-blueprint-grid">
                        {BLUEPRINT_PRESETS.map((p) =>{
                          const PresetIcon = p.Icon;
                          return (
                          <div key={p.id} className={`srl-blueprint-card${selectedBlueprintPreset === p.id ? ' is-active' : ''}`}>
                            <div className="srl-blueprint-card__head">
                              <span className="srl-blueprint-icon"><PresetIcon /></span>
                              <div>
                                <strong>{p.name}</strong>
                                <p className="srl-hint" style={{ margin: 0 }}>{p.desc}</p>
                              </div>
                            </div>
                            <div className="srl-blueprint-balls">
                              {p.balls.map((b, idx) =>(
                                <span
                                  key={idx}
                                  className={`srl-ball-chip --${b.type.toLowerCase()}`}
                                >
                                  {b.type === 'WICKET' ? 'W' : (b.type === 'DOT' ? '0' : b.runs)}
                                </span>
                              ))}
                            </div>
                            <div className="srl-blueprint-card__actions">
                              <button
                                type="button"
                                className="srl-btn srl-btn-blue srl-btn-wide"
                                disabled={busy || selected.controlStatus === 'COMPLETED'}
                                onClick={() =>{
                                  setSelectedBlueprintPreset(p.id);
                                  setBlueprintBalls([...p.balls]);
                                  run(
                                    () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/script-over`, { preset: p.id }),
                                    `Narrative Queued: ${p.name}!`,
                                  );
                                }}
                              >
                                Arm {p.name}
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom 6-Ball Sequencer */}
                    <div className="srl-zone" style={{ marginTop: 14 }}>
                      <div className="srl-zone-label --warn" style={{ justifyContent: 'space-between' }}>
                        <span>Custom 6-Ball Sequencer</span>
                        <span className="srl-hint">Sequence ball 1 through 6 manually</span>
                      </div>
                      <div className="srl-sequencer-slots">
                        {blueprintBalls.map((ball, i) =>(
                          <div key={i} className="srl-sequencer-slot">
                            <span className="srl-sequencer-slot-no">Ball {i + 1}</span>
                            <select
                              className="srl-input srl-sequencer-select"
                              value={ball.type}
                              disabled={busy}
                              onChange={(e) =>{
                                const newType = e.target.value;
                                const opt = BALL_TYPE_OPTIONS.find((o) => o.type === newType);
                                const updated = [...blueprintBalls];
                                updated[i] = {
                                  type: newType,
                                  runs: opt ? opt.runs : 0,
                                  subType: newType === 'WICKET' ? 'Bowled' : null,
                                };
                                setBlueprintBalls(updated);
                              }}
                            >
                              {BALL_TYPE_OPTIONS.map((opt) =>(
                                <option key={opt.type} value={opt.type}>{opt.label}</option>
                              ))}
                            </select>
                            <span className={`srl-sequencer-badge --${ball.type.toLowerCase()}`}>
                              {ball.type === 'WICKET' ? 'WICKET' : `${ball.runs} Run${ball.runs === 1 ? '' : 's'}`}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="srl-btn srl-btn-teal"
                          style={{ flex: 1, minWidth: 200 }}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() =>{
                            run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/script-over`, { balls: blueprintBalls }),
                              'Custom 6-Ball Narrative Queued into Match Engine!',
                            );
                          }}
                        >
                           Queue Custom 6-Ball Sequence
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selected.matchId)}/queue-rehearsal`);
                              setQueueRehearsal(data);
                              showToast(`Rehearsal → ${data.projected?.display || '?'} (dry-run)`, 'success');
                            } catch (err) {
                              showToast(err.message || 'Rehearsal failed', 'error');
                            }
                          }}
                        >
                          Rehearse queue
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate"
                          disabled={busy}
                          onClick={() =>{
                            setBlueprintBalls([
                              { type: 'DOT', runs: 0 },
                              { type: 'DOT', runs: 0 },
                              { type: 'DOT', runs: 0 },
                              { type: 'DOT', runs: 0 },
                              { type: 'DOT', runs: 0 },
                              { type: 'DOT', runs: 0 },
                            ]);
                          }}
                        >
                          Reset to 6 Dots
                        </button>
                      </div>
                      {queueRehearsal && (
                        <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--srl-surface-alt)', borderRadius: 8 }}>
                          <strong style={{ fontSize: '0.82rem' }}>Queue rehearsal (not committed)</strong>
                          <div className="srl-hint" style={{ marginTop: 4 }}>
                            Now {queueRehearsal.current?.runs}/{queueRehearsal.current?.wickets} → Projected {queueRehearsal.projected?.display} · {queueRehearsal.queueLength} balls
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {(queueRehearsal.steps || []).map((s, i) => (
                              <span key={s.id || i} className="srl-pill srl-pill-muted" style={{ fontSize: '0.68rem' }}>
                                {s.type} → {s.after.runs}/{s.after.wickets}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <label className="srl-field" style={{ flex: 1, minWidth: 160 }}>
                          Save as named preset
                          <input className="srl-input" style={{ height: 34 }} value={customPresetName} onChange={(e) => setCustomPresetName(e.target.value)} placeholder="e.g. Death defend v2" />
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 34 }}
                          disabled={busy || !customPresetName.trim()}
                          onClick={() => run(
                            async () => {
                              const res = await adminApiClient.post('/iplsrl/script-presets', { name: customPresetName, balls: blueprintBalls });
                              setCustomPresets(res?.presets?.custom || []);
                              return res;
                            },
                            `Saved preset ${customPresetName}`,
                          )}
                        >
                          Save preset
                        </button>
                      </div>
                      {customPresets.length > 0 && (
                        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {customPresets.map((p) => (
                            <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button
                                type="button"
                                className="srl-chip"
                                disabled={busy}
                                onClick={() => {
                                  setBlueprintBalls(p.balls.map((b) => ({ ...b })));
                                  run(
                                    () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/script-over`, { balls: p.balls }),
                                    `Queued ${p.name}`,
                                  );
                                }}
                              >
                                Load {p.name}
                              </button>
                              <button
                                type="button"
                                className="srl-btn srl-btn-slate"
                                style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                                onClick={() => run(
                                  async () => {
                                    const res = await adminApiClient.delete(`/iplsrl/script-presets/${encodeURIComponent(p.id)}`);
                                    setCustomPresets(res?.presets?.custom || []);
                                    return res;
                                  },
                                  'Preset deleted',
                                )}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Armed Incident Queue Viewer */}
                    {Array.isArray(selected.incidentQueue) && selected.incidentQueue.length >0 && (
                      <div className="srl-zone" style={{ marginTop: 14 }}>
                        <div className="srl-zone-label --live" style={{ justifyContent: 'space-between' }}>
                          <span>Armed Deliveries in Queue ({selected.incidentQueue.length})</span>
                          <span className="srl-pill srl-pill-live">Next in line</span>
                        </div>
                        <div className="srl-queued-trail">
                          {selected.incidentQueue.map((inc, qIdx) =>(
                            <div key={inc.id || qIdx} className="srl-queued-ball">
                              <span className="srl-queued-ball-idx">#{qIdx + 1}</span>
                              <span className={`srl-ball-chip --${String(inc.type || '').toLowerCase()}`}>
                                {inc.type === 'WICKET' ? 'W' : (inc.type === 'DOT' ? '0' : (inc.runs ?? inc.type))}
                              </span>
                              <span className="srl-queued-ball-type">{inc.type}{inc.subType ? ` (${inc.subType})` : ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ ZONE: SETTLEMENT WIZARD ═══ */}
                {matchZone === 'settle' && (
                  <div className="srl-tab-body" key="settle">
                    <div className="srl-zone">
                      <div className="srl-zone-label --warn">Settlement wizard</div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        One flow: close betting → settle toss → declare winner → settle innings markets → export audit. Senior desk only.
                      </p>
                      {(deskCaps?.canRunSettlementWizard === false) && (
                        <p className="srl-hint" style={{ color: 'var(--srl-danger-text)' }}>
                          Your role ({adminRole}) cannot run settlement. Need SUPER_ADMIN or TRADING_ADMIN.
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <label className="srl-field" style={{ minWidth: 180 }}>
                          Declare winner
                          <select
                            className="srl-input"
                            style={{ height: 36 }}
                            value={settleTeamId || selected.homeTeamId || ''}
                            onChange={(e) => setSettleTeamId(e.target.value)}
                          >
                            <option value={selected.homeTeamId}>{selected.homeShort}</option>
                            <option value={selected.awayTeamId}>{selected.awayShort}</option>
                          </select>
                        </label>
                        <label className="srl-field" style={{ flex: 1, minWidth: 220 }}>
                          Mandatory note
                          <input
                            className="srl-input"
                            style={{ height: 36 }}
                            value={settleNote}
                            placeholder="Why settle now?"
                            onChange={(e) => setSettleNote(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-teal"
                          style={{ height: 36 }}
                          disabled={busy || deskCaps?.canRunSettlementWizard === false || selected.controlStatus === 'COMPLETED' || !String(settleNote || '').trim()}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/settlement-wizard`, {
                              declareTeamId: settleTeamId || selected.homeTeamId,
                              settleToss: true,
                              settleMatchMarkets: true,
                              closeBetting: true,
                              exportAudit: true,
                              note: String(settleNote || '').trim(),
                            }),
                            'Settlement wizard completed',
                          )}
                        >
                          Run settlement checklist
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: PUBLIC PREVIEW ═══ */}
                {matchZone === 'preview' && (
                  <div className="srl-tab-body" key="preview">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between' }}>
                        <span>What users see</span>
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          disabled={busy}
                          onClick={async () => {
                            try {
                              const data = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selected.matchId)}/public-preview`);
                              setPublicPreview(data);
                            } catch (err) {
                              showToast(err.message || 'Preview failed', 'error');
                            }
                          }}
                        >
                          Refresh preview
                        </button>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Side-by-side check of public score, toss, batting side, and commentary without leaving Match Control.
                      </p>
                      {publicPreview ? (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <strong>{publicPreview.fixture}</strong>
                          <div className="srl-hint">Status: {publicPreview.status} · {publicPreview.time} · Live: {String(publicPreview.isLive)}</div>
                          <div>1st: <strong>{publicPreview.score?.first}</strong> · 2nd: <strong>{publicPreview.score?.chase}</strong></div>
                          <div>Batting now: <strong>{publicPreview.battingNow || '—'}</strong></div>
                          {publicPreview.toss && (
                            <div>Toss: {publicPreview.toss.wonToss || publicPreview.toss.winner} ({publicPreview.toss.decision})</div>
                          )}
                          <p style={{ fontStyle: 'italic', margin: 0 }}>{publicPreview.commentary}</p>
                        </div>
                      ) : (
                        <p className="srl-hint">Click Refresh preview to load the public board snapshot.</p>
                      )}
                    </div>
                  </div>
                )}

                {matchZone === 'drift' && (
                  <div className="srl-tab-body" key="drift">
                    <div className="srl-zone">
                      <div className="srl-zone-label --warn">Natural sim vs anchored board</div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Shows how far injects have pulled the live board away from the natural simulation.
                      </p>
                      {selected.scoreDrift ? (
                        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                          <div className="srl-radar-stat-box">
                            <label>Natural sim</label>
                            <strong>{selected.scoreDrift.natural?.display || '—'}</strong>
                          </div>
                          <div className="srl-radar-stat-box">
                            <label>Anchored / live</label>
                            <strong>{selected.scoreDrift.anchored?.display || '—'}</strong>
                          </div>
                          <div className="srl-radar-stat-box">
                            <label>Runs drift</label>
                            <strong style={{ color: selected.scoreDrift.warning ? 'var(--srl-danger-text)' : 'var(--srl-live)' }}>
                              {selected.scoreDrift.runsDelta > 0 ? '+' : ''}{selected.scoreDrift.runsDelta}r
                              {' · '}
                              {selected.scoreDrift.wicketsDelta > 0 ? '+' : ''}{selected.scoreDrift.wicketsDelta}w
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <p className="srl-hint">No drift data yet.</p>
                      )}
                    </div>
                  </div>
                )}

                {matchZone === 'report' && (
                  <div className="srl-tab-body" key="report">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between' }}>
                        <span>Post-match report card</span>
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          onClick={() => adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selected.matchId)}/post-match-report`).then(setPostMatchReport)}
                        >
                          Refresh
                        </button>
                      </div>
                      {!postMatchReport ? (
                        <p className="srl-hint">Open this tab to load the report, or click Refresh.</p>
                      ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <strong>{postMatchReport.fixture}</strong>
                          <div className="srl-hint">{postMatchReport.status} · {postMatchReport.controlStatus}</div>
                          <div>Result: {postMatchReport.result || '—'}</div>
                          <div>Worst-case liability: <strong>{formatInr(postMatchReport.worstCaseLiability)}</strong></div>
                          <div>Home PnL if win: {formatInr(postMatchReport.projectedPnlHome)} · Away: {formatInr(postMatchReport.projectedPnlAway)}</div>
                          <div>
                            Injects: {postMatchReport.injectCount}
                            {postMatchReport.injectsByReason && Object.keys(postMatchReport.injectsByReason).length > 0 && (
                              <span className="srl-hint"> · {Object.entries(postMatchReport.injectsByReason).map(([k, v]) => `${k}:${v}`).join(', ')}</span>
                            )}
                          </div>
                          <div>Anchors: {postMatchReport.scoreAnchorsCount} · Drift: {postMatchReport.scoreDrift?.runsDelta ?? 0}r</div>
                          {Array.isArray(postMatchReport.settlementSteps) && postMatchReport.settlementSteps.length > 0 && (
                            <div>
                              <strong style={{ fontSize: '0.82rem' }}>Settlement trail</strong>
                              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                                {postMatchReport.settlementSteps.slice(0, 12).map((s, i) => (
                                  <div key={i} className="srl-hint" style={{ fontSize: '0.72rem' }}>{s.action} — {s.detail}</div>
                                ))}
                              </div>
                            </div>
                          )}
                          <button type="button" className="srl-btn srl-btn-teal" style={{ width: 'fit-content' }} onClick={() => exportAudit('json')}>
                            Export full audit JSON
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {matchZone === 'templates' && (
                  <div className="srl-tab-body" key="templates">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent">Desk setup templates</div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Capture director mode, margins, cashout haircut, freeze threshold, and circuit velocity — then apply to another fixture.
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
                        <label className="srl-field" style={{ flex: 1, minWidth: 160 }}>
                          Template name
                          <input className="srl-input" style={{ height: 34 }} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Night death overs" />
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-teal"
                          style={{ height: 34 }}
                          disabled={busy || !templateName.trim()}
                          onClick={() => run(
                            async () => {
                              const res = await adminApiClient.post('/iplsrl/match-templates', {
                                fromMatchId: selected.matchId,
                                name: templateName,
                              });
                              setMatchTemplates(res?.templates || []);
                              return res;
                            },
                            `Saved template ${templateName}`,
                          )}
                        >
                          Capture from this match
                        </button>
                      </div>
                      {matchTemplates.length === 0 ? (
                        <p className="srl-hint">No templates yet.</p>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {matchTemplates.map((t) => (
                            <div key={t.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <strong>{t.name}</strong>
                                <div className="srl-hint" style={{ fontSize: '0.72rem' }}>
                                  {t.config?.directorMode} · freeze ₹{(t.config?.marginDefense?.autoFreezeThreshold || 0).toLocaleString('en-IN')} · haircut {Math.round((t.config?.cashoutControl?.globalHaircut || 0) * 100)}%
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className="srl-btn srl-btn-blue"
                                  style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                                  disabled={busy}
                                  onClick={() => run(
                                    () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/apply-template`, { templateId: t.id }),
                                    `Applied ${t.name}`,
                                  )}
                                >
                                  Apply here
                                </button>
                                <button
                                  type="button"
                                  className="srl-btn srl-btn-slate"
                                  style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                                  onClick={() => run(
                                    async () => {
                                      const res = await adminApiClient.delete(`/iplsrl/match-templates/${encodeURIComponent(t.id)}`);
                                      setMatchTemplates(res?.templates || []);
                                      return res;
                                    },
                                    'Template deleted',
                                  )}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: GOD MODE ═══ */}
                {matchZone === 'godmode' && (
                  <div className="srl-tab-body" key="godmode">
                    <div className="srl-zone">
                      <div className="srl-zone-label --warn" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Instant Ball Inject</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {selected.incidentQueueLength > 0 && (
                            <span className="srl-pill srl-pill-paused">
                              Next: {selected.nextQueuedIncident?.type || 'queued'} ({selected.incidentQueueLength})
                            </span>
                          )}
                          {selected.scoreAnchorsCount > 0 && (
                            <span className="srl-pill srl-pill-live">
                              {selected.scoreAnchorsCount} anchors active
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 10px' }}>
                        Applies immediately. Hotkeys: 0/1/4/6/W · U undo · C clear queue · Space next · Esc pause · ? help
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                        <label className="srl-field" style={{ minWidth: 140 }}>
                          Reason code
                          <select className="srl-input" value={injectReason} onChange={(e) => setInjectReason(e.target.value)} style={{ height: 34 }}>
                            {(snap?.reasonCodes || ['script', 'fix', 'integrity', 'broadcast', 'other']).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        <label className="srl-field" style={{ minWidth: 90 }}>
                          Undo ×
                          <input type="number" min={1} max={20} className="srl-input" value={undoCount} onChange={(e) => setUndoCount(Number(e.target.value) || 1)} style={{ height: 34, width: 72 }} />
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-orange"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', height: 34, alignSelf: 'flex-end' }}
                          disabled={busy || !(selected.scoreAnchorsCount > 0)}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/undo-inject`, { count: undoCount }),
                            `Undid ×${undoCount}`,
                          )}
                        >
                          Undo injects
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', height: 34, alignSelf: 'flex-end' }}
                          disabled={busy || !(selected.scoreAnchorsCount > 0) || deskCaps?.canClearAnchors === false}
                          onClick={() => setClearAnchorsAsk(true)}
                        >
                          Clear all anchors
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', height: 34, alignSelf: 'flex-end' }}
                          onClick={() => setHotkeyHelp(true)}
                        >
                          Hotkeys (?)
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-orange"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', height: 34, alignSelf: 'flex-end' }}
                          disabled={busy || deskCaps?.canIntegrityHold === false}
                          onClick={() => {
                            if (selected.integrityHold?.active) {
                              run(
                                () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/integrity-hold`, { release: true }),
                                'Integrity hold released',
                              );
                            } else {
                              setIntegrityAsk(true);
                            }
                          }}
                        >
                          {selected.integrityHold?.active ? 'Release integrity hold' : 'Integrity hold'}
                        </button>
                      </div>
                      {Array.isArray(selected.injectHistory) && selected.injectHistory.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <strong style={{ fontSize: '0.78rem' }}>Inject history</strong>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: 140, overflow: 'auto' }}>
                            {selected.injectHistory.slice(0, 8).map((h) => (
                              <div key={h.id} className="srl-hint" style={{ fontSize: '0.72rem' }}>
                                {h.type}{h.subType ? `/${h.subType}` : ''} · {h.reasonCode} · {h.boardBefore ? `${h.boardBefore.runs}/${h.boardBefore.wickets}` : '?'} → {h.boardAfter ? `${h.boardAfter.runs}/${h.boardAfter.wickets}` : '?'} · {h.admin || 'ops'}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="srl-incident-grid">
                        {[
                          { type: 'WICKET', subType: 'Bowled', Icon: FlameIcon, label: 'Wicket (Bowled)', msg: 'Bowled Wicket injected!' },
                          { type: 'WICKET', subType: 'Caught Behind', Icon: ShieldCheckIcon, label: 'Wicket (Caught)', msg: 'Caught Wicket injected!' },
                          { type: 'SIX', Icon: RocketIcon, label: 'Boundary SIX', msg: 'Boundary SIX injected!' },
                          { type: 'FOUR', Icon: ZapIcon, label: 'Boundary FOUR', msg: 'Boundary FOUR injected!' },
                          { type: 'SINGLE', Icon: ActivityIcon, label: 'Single (1)', msg: 'Single injected!' },
                          { type: 'DOUBLE', Icon: LayersIcon, label: 'Double (2)', msg: 'Double injected!' },
                          { type: 'DOT', Icon: SparklesIcon, label: 'Dot Ball (0)', msg: 'Dot Ball injected!' },
                          { type: 'WIDE', Icon: TriangleAlertIcon, label: 'Wide (+1 extra)', msg: 'Wide (+1 extra) injected — over not advanced!' },
                          { type: 'NO_BALL', Icon: RadioIcon, label: 'No Ball (+1)', msg: 'No Ball (+1) injected — over not advanced!' },
                        ].map((inc) =>{
                          const IncIcon = inc.Icon;
                          return (
                          <button
                            key={`${inc.type}-${inc.subType || ''}`}
                            type="button"
                            className="srl-incident-btn"
                            disabled={busy || selected.controlStatus === 'COMPLETED'}
                            onClick={() => run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/incident`, {
                                type: inc.type,
                                ...(inc.subType ? { subType: inc.subType } : {}),
                                reasonCode: injectReason,
                                instant: true,
                              }),
                              inc.msg,
                            )}
                          >
                            <span className="srl-incident-icon"><IncIcon /></span>
                            <span className="srl-incident-label">{inc.label}</span>
                          </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="srl-zone">
                      <div className="srl-zone-label --accent">Pinpoint Chase Target & Tie Game</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <label className="srl-field" style={{ flex: 1, minWidth: 140 }}>
                          Chase Target
                          <input
                            type="number"
                            placeholder="e.g. 175"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          />
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-teal"
                          style={{ height: 36 }}
                          disabled={busy || !targetInput}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/target`, { target: Number(targetInput) }),
                            `Target pinned to ${targetInput}`,
                          )}
                        >
                          Set Target
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-orange"
                          style={{ height: 36 }}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/tie-game`),
                            'Match Anchored for Super Over!',
                          )}
                        >
                          <SwordsIcon style={ICON_SM} />Force Tie (Super Over)
                        </button>
                      </div>
                    </div>

                    {/* Autonomous AI Match Director */}
                    <div className="srl-zone" style={{ marginTop: 14 }}>
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Autonomous AI Match Director</span>
                        <span className="srl-pill srl-pill-live">
                          Active: {selected.directorMode || 'REALISTIC'}
                        </span>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Autonomous drama director that shapes in-play delivery probabilities dynamically to fulfill narrative goals without manual intervention.
                      </p>
                      <div className="srl-director-grid">
                        {DIRECTOR_MODE_OPTIONS.map((dm) =>{
                          const isActive = (selected.directorMode || 'REALISTIC') === dm.id;
                          const DmIcon = dm.Icon;
                          return (
                            <div key={dm.id} className={`srl-director-card${isActive ? ' is-active' : ''}`}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="srl-blueprint-icon"><DmIcon /></span>
                                <div>
                                  <strong>{dm.label}</strong>
                                  <p className="srl-hint" style={{ margin: 0, fontSize: '0.72rem' }}>{dm.desc}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                className={`srl-btn ${isActive ? 'srl-btn-teal' : 'srl-btn-blue'}`}
                                style={{ marginTop: 8, width: '100%', fontSize: '0.75rem', padding: '4px 8px' }}
                                disabled={busy}
                                onClick={() =>{
                                  run(
                                    () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/director-mode`, { mode: dm.id }),
                                    `AI Director mode set to ${dm.label}!`,
                                  );
                                }}
                              >
                                {isActive ? 'Active Mode' : 'Activate Mode'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Player Morale & Specialist Buffs */}
                    <div className="srl-zone" style={{ marginTop: 14 }}>
                      <div className="srl-zone-label --warn" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Player Morale & Specialist Buffs</span>
                        {Object.keys(selected.playerBuffs || {}).length >0 && (
                          <span className="srl-pill srl-pill-paused">
                            {Object.keys(selected.playerBuffs).length} Buffs Active
                          </span>
                        )}
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 10px' }}>
                        Overclock specific on-field players with god-mode hitting or death-over yorker precision.
                      </p>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                        <label className="srl-field" style={{ minWidth: 150 }}>
                          Target Player
                          <select
                            className="srl-input"
                            value={selectedBuffPlayer}
                            onChange={(e) => setSelectedBuffPlayer(e.target.value)}
                            style={{ height: 34 }}
                          >
                            <option value="striker">Active Striker</option>
                            <option value="non_striker">Non-Striker</option>
                            <option value="bowler">Active Bowler</option>
                          </select>
                        </label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          {PLAYER_BUFF_OPTIONS.map((pb) =>(
                            <button
                              key={pb.id}
                              type="button"
                              className="srl-chip"
                              disabled={busy}
                              onClick={() =>{
                                run(
                                  () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/player-buff`, {
                                    role: selectedBuffPlayer,
                                    buff: pb.id,
                                  }),
                                  `${pb.label} applied to ${selectedBuffPlayer}!`,
                                );
                              }}
                            >
                              {pb.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="srl-chip"
                            style={{ color: 'var(--srl-text-muted)' }}
                            disabled={busy}
                            onClick={() =>{
                              run(
                                () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/player-buff`, {
                                  role: selectedBuffPlayer,
                                  buff: null,
                                }),
                                `Buff cleared for ${selectedBuffPlayer}`,
                              );
                            }}
                          >
                             Clear Buff
                          </button>
                        </div>
                      </div>

                      {Object.keys(selected.playerBuffs || {}).length >0 && (
                        <div className="srl-active-buffs-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {Object.entries(selected.playerBuffs).map(([role, b]) =>(
                            <span key={role} className="srl-pill srl-pill-live" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                              {role.toUpperCase()}: {b.buff}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: RISK ═══ */}
                {matchZone === 'risk' && (
                  <div className="srl-tab-body" key="risk">
                    <div className="srl-radar-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div className="srl-zone-label --live" style={{ margin: 0 }}>
                           Live Liability Radar
                        </div>
                        <span className={`srl-pill ${selected.book?.riskFlag === 'CRITICAL' ? 'srl-pill-completed' : (selected.book?.riskFlag === 'WARNING' ? 'srl-pill-paused' : 'srl-pill-live')}`}>
                          {selected.book?.riskFlag || 'BALANCED'}
                        </span>
                      </div>

                      <div className="srl-radar-stats">
                        <div className="srl-radar-stat-box">
                          <label>Home ({selected.homeShort}) Win P&L</label>
                          <strong style={{ color: (selected.book?.projectedPnlHome ?? 0) >= 0 ? 'var(--srl-live)' : 'var(--srl-danger-text)' }}>
                            {(selected.book?.projectedPnlHome ?? 0) >= 0 ? '+' : ''}{formatInr(selected.book?.projectedPnlHome || 0)}
                          </strong>
                        </div>
                        <div className="srl-radar-stat-box">
                          <label>Away ({selected.awayShort}) Win P&L</label>
                          <strong style={{ color: (selected.book?.projectedPnlAway ?? 0) >= 0 ? 'var(--srl-live)' : 'var(--srl-danger-text)' }}>
                            {(selected.book?.projectedPnlAway ?? 0) >= 0 ? '+' : ''}{formatInr(selected.book?.projectedPnlAway || 0)}
                          </strong>
                        </div>
                        <div className="srl-radar-stat-box">
                          <label>Worst-Case Liability</label>
                          <strong style={{ color: (selected.book?.worstCaseLiability ?? 0) >20000 ? 'var(--srl-warn)' : 'var(--admin-text)' }}>
                            {formatInr(selected.book?.worstCaseLiability || 0)}
                          </strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <label className="srl-field" style={{ flex: 1, minWidth: 130 }}>
                          Margin Bump (+%)
                          <select
                            value={marginBump}
                            onChange={(e) => setMarginBump(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          >
                            <option value="0.00">+0% Standard</option>
                            <option value="0.03">+3% Defensive</option>
                            <option value="0.05">+5% High-Vol</option>
                            <option value="0.08">+8% Death Overs</option>
                            <option value="0.12">+12% Peak Risk</option>
                          </select>
                        </label>
                        <label className="srl-field" style={{ flex: 1, minWidth: 130 }}>
                          Spread Bias
                          <select
                            value={spreadBias}
                            onChange={(e) => setSpreadBias(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          >
                            <option value="0.00">Neutral (0.00)</option>
                            <option value="0.05">+{selected.homeShort} / -{selected.awayShort}</option>
                            <option value="-0.05">+{selected.awayShort} / -{selected.homeShort}</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36 }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/margin`, {
                              marginBump: Number(marginBump),
                              spreadBias: Number(spreadBias),
                            }),
                            'Margin defense updated',
                          )}
                        >
                          Apply Defense
                        </button>
                      </div>

                      {/* Smart Profit Maximizer Sub-Panel */}
                      <div className="srl-profit-maximizer" style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <div className="srl-zone-label --accent" style={{ margin: 0 }}>
                               Smart Profit Maximizer & Auto-Hedge
                            </div>
                            <p className="srl-hint" style={{ margin: '4px 0 0' }}>
                              Auto-dynamically adjusts market odds towards under-staked selections to balance the house book.
                            </p>
                          </div>
                          <button
                            type="button"
                            className={`srl-btn ${selected.autoProfitMaximizer ? 'srl-btn-teal' : 'srl-btn-slate'}`}
                            disabled={busy}
                            onClick={() =>{
                              const nextState = !selected.autoProfitMaximizer;
                              run(
                                () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/profit-maximizer`, {
                                  enabled: nextState,
                                  targetMargin: Number(profitMaximizerTarget),
                                }),
                                nextState ? 'Profit Maximizer ACTIVE!' : 'Profit Maximizer disabled',
                              );
                            }}
                          >
                            {selected.autoProfitMaximizer ? 'Maximizer ACTIVE' : 'Maximizer OFF'}
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <label className="srl-field" style={{ flex: 1, minWidth: 150 }}>
                            Target House Margin
                            <select
                              className="srl-input"
                              value={profitMaximizerTarget}
                              onChange={(e) => setProfitMaximizerTarget(e.target.value)}
                              disabled={busy}
                              style={{ height: 36 }}
                            >
                              <option value="0.04">4% Standard Edge</option>
                              <option value="0.06">6% Optimized Edge (Default)</option>
                              <option value="0.08">8% Defensive Edge</option>
                              <option value="0.10">10% High Liability Edge</option>
                              <option value="0.15">15% Max Profit Shield</option>
                            </select>
                          </label>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[
                              { label: '+3% Def', bump: 0.03 },
                              { label: '+5% Vol', bump: 0.05 },
                              { label: '+8% Death', bump: 0.08 },
                            ].map((s) =>(
                              <button
                                key={s.label}
                                type="button"
                                className="srl-chip"
                                disabled={busy}
                                onClick={() =>{
                                  run(
                                    () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/margin`, { marginBump: s.bump }),
                                    `Quick Spike ${s.label} applied!`,
                                  );
                                }}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Automated Circuit Breakers & Master Kill-Switch Sub-Panel */}
                      <div className="srl-circuit-breaker-panel" style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <div className="srl-zone-label --warn" style={{ margin: 0 }}>
                               Automated Circuit Breakers & Red Phone Kill-Switch
                            </div>
                            <p className="srl-hint" style={{ margin: '4px 0 0' }}>
                              Auto-trips when unhedged liability spike velocity exceeds threshold. Master Kill-Switch freezes entire fixture instantly.
                            </p>
                          </div>
                          <button
                            type="button"
                            className={`srl-btn ${selected.circuitBreaker?.emergencyKillSwitch ? 'srl-btn-teal' : 'srl-btn-orange'}`}
                            style={{
                              fontWeight: 800,
                              padding: '8px 16px',
                              letterSpacing: '0.04em',
                              background: selected.circuitBreaker?.emergencyKillSwitch ? 'var(--srl-live)' : 'var(--srl-danger)',
                              color: selected.circuitBreaker?.emergencyKillSwitch ? 'var(--srl-on-accent)' : '#f4f1ea',
                              borderColor: 'var(--srl-danger)',
                            }}
                            disabled={busy || deskCaps?.canKillSwitch === false}
                            onClick={() => {
                              if (selected.circuitBreaker?.emergencyKillSwitch) {
                                run(
                                  () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/circuit-breaker/kill-switch`, { active: false }),
                                  'Emergency Kill-Switch DISENGAGED · Betting Resumed',
                                );
                              } else {
                                setKillAsk(true);
                              }
                            }}
                          >
                            {selected.circuitBreaker?.emergencyKillSwitch ? 'Disengage Kill-Switch' : 'RED PHONE KILL-SWITCH'}
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
                          <label className="srl-field">
                            60s Velocity Spike Limit
                            <input
                              type="number"
                              className="srl-input"
                              value={cbVelocityInput}
                              onChange={(e) => setCbVelocityInput(e.target.value)}
                              placeholder="e.g. 100000"
                            />
                          </label>
                          <label className="srl-field">
                            Powerplay Max Stake
                            <input
                              type="number"
                              className="srl-input"
                              value={cbPowerplayInput}
                              onChange={(e) => setCbPowerplayInput(e.target.value)}
                              placeholder="e.g. 50000"
                            />
                          </label>
                          <label className="srl-field">
                            Middle Overs Max Stake
                            <input
                              type="number"
                              className="srl-input"
                              value={cbMiddleInput}
                              onChange={(e) => setCbMiddleInput(e.target.value)}
                              placeholder="e.g. 35000"
                            />
                          </label>
                          <label className="srl-field">
                            Death Overs Max Stake
                            <input
                              type="number"
                              className="srl-input"
                              value={cbDeathInput}
                              onChange={(e) => setCbDeathInput(e.target.value)}
                              placeholder="e.g. 15000"
                            />
                          </label>
                        </div>

                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="srl-btn srl-btn-blue"
                            style={{ height: 32, fontSize: '0.75rem' }}
                            disabled={busy}
                            onClick={() => run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/circuit-breaker/config`, {
                                velocityLimit: Number(cbVelocityInput),
                                stageCaps: {
                                  powerplay: Number(cbPowerplayInput),
                                  middle: Number(cbMiddleInput),
                                  death: Number(cbDeathInput),
                                },
                              }),
                              'Circuit breaker limits updated',
                            )}
                          >
                            Save Safety Limits
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: LIVE CASH-OUT HAIRCUT & BUYBACK DESK ═══ */}
                {matchZone === 'cashout' && (
                  <div className="srl-tab-body" key="cashout">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Live Cash-Out Haircut & Strategic Buyback Desk</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="srl-btn srl-btn-slate"
                            style={{ height: 30, fontSize: '0.72rem', padding: '0 8px' }}
                            disabled={busy || cashoutLoading}
                            onClick={fetchCashout}
                          >
                             Refresh Cashouts
                          </button>
                          <button
                            type="button"
                            className={`srl-btn ${selected.cashoutControl?.cashoutHalted ? 'srl-btn-teal' : 'srl-btn-orange'}`}
                            style={{ height: 30, fontSize: '0.72rem', padding: '0 8px' }}
                            disabled={busy}
                            onClick={() => run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/cashout/config`, {
                                cashoutHalted: !selected.cashoutControl?.cashoutHalted,
                              }),
                              selected.cashoutControl?.cashoutHalted ? 'Cash-Out UNFROZEN' : 'Cash-Out HALTED for users',
                            ).then(fetchCashout)}
                          >
                            {selected.cashoutControl?.cashoutHalted ? 'Unfreeze Cash-Out' : 'Emergency Cash-Out Halt'}
                          </button>
                        </div>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 14px' }}>
                        Manage house retention fees on player cash-outs and push sweetener bonuses (+5%) to buy back high-risk whale positions prior to death overs.
                      </p>

                      <div className="srl-cashout-config-bar">
                        <label className="srl-field" style={{ flex: 1, minWidth: 200 }}>
                          House Haircut Fee (%)
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="range"
                              min="5"
                              max="25"
                              step="1"
                              value={cashoutHaircutInput}
                              onChange={(e) => setCashoutHaircutInput(e.target.value)}
                              className="srl-slider"
                              style={{ flex: 1 }}
                            />
                            <span style={{ fontWeight: 800, minWidth: 40, color: 'var(--srl-accent-strong)' }}>
                              {cashoutHaircutInput}%
                            </span>
                          </div>
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36, alignSelf: 'flex-end' }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/cashout/config`, {
                              globalHaircut: Number(cashoutHaircutInput) / 100,
                            }),
                            `Global cashout fee set to ${cashoutHaircutInput}%`,
                          ).then(fetchCashout)}
                        >
                          Save Haircut Fee
                        </button>
                      </div>

                      {/* Cashout Open Positions Table */}
                      <div className="srl-cashout-table-wrapper" style={{ marginTop: 14 }}>
                        <table className="srl-whatif-table">
                          <thead>
                            <tr>
                              <th>Bet ID</th>
                              <th>Tier</th>
                              <th>Selection</th>
                              <th>Stake</th>
                              <th>Fair Value</th>
                              <th>House Fee</th>
                              <th>Cashout Offer</th>
                              <th>Strategic Buyback Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(cashoutData?.positions || []).map((pos) =>(
                              <tr key={pos.betId}>
                                <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{pos.betId}</td>
                                <td>
                                  <span className={`srl-pill ${pos.userTier === 'WHALE' ? 'srl-pill-completed' : (pos.userTier === 'SHARP' ? 'srl-pill-paused' : 'srl-pill-slate')}`}>
                                    {pos.userTier}
                                  </span>
                                </td>
                                <td><strong>{pos.selection}</strong> @ {pos.odds}</td>
                                <td>{formatInr(pos.stake)}</td>
                                <td style={{ color: 'var(--admin-text)' }}>{formatInr(pos.fairValue)}</td>
                                <td style={{ color: 'var(--srl-danger-text)' }}>-{formatInr(pos.haircutFee)}</td>
                                <td>
                                  <strong style={{ color: 'var(--srl-live)', fontSize: '0.9rem' }}>
                                    {formatInr(pos.cashoutOffer)}
                                  </strong>
                                  {pos.hasSweetener && (
                                    <span className="srl-pill srl-pill-live" style={{ marginLeft: 6, fontSize: '0.65rem' }}>
                                      +5% Sweetener
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="srl-btn srl-btn-teal"
                                    style={{ height: 28, fontSize: '0.72rem', padding: '0 8px' }}
                                    disabled={busy || pos.hasSweetener}
                                    onClick={() => run(
                                      () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/cashout/sweetener`, {
                                        betId: pos.betId,
                                        bonusPercent: 5,
                                      }),
                                      ` +5% Sweetener Buyback pushed for ${pos.betId}!`,
                                    ).then(fetchCashout)}
                                  >
                                    {pos.hasSweetener ? 'Sweetener Pushed' : 'Push +5% Buyback'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {(!cashoutData?.positions || !cashoutData.positions.length) && (
                              <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--srl-muted)' }}>
                                  No active open cashout positions available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: WAGER TAPE & WHALE TRACKER ═══ */}
                {matchZone === 'wagers' && (
                  <div className="srl-tab-body" key="wagers">
                    <div className="srl-zone">
                      <div className="srl-zone-label --live" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Live Match Wager Tape & Whale Tracker ({wagerTape?.totalWagers || 0} Bets)</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {wagerTape?.whaleCount >0 && (
                            <span className="srl-pill srl-pill-live" style={{ background: 'var(--srl-warn-bg)', borderColor: 'var(--srl-warn)', color: 'var(--srl-warn-text)' }}>
                               {wagerTape.whaleCount} Whale Bets Detected
                            </span>
                          )}
                          <button
                            type="button"
                            className="srl-btn srl-btn-slate"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            disabled={busy || wagerTapeLoading}
                            onClick={fetchWagers}
                          >
                             Refresh Tape
                          </button>
                        </div>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Streaming ledger of wagers placed on this match. Sharp and whale bets are flagged to enable immediate margin defense.
                      </p>

                      {wagerTapeLoading && !wagerTape ? (
                        <p className="srl-hint">Streaming live match tape…</p>
                      ) : !wagerTape?.wagers?.length ? (
                        <p className="srl-hint">No wagers recorded on this match yet.</p>
                      ) : (
                        <div className="srl-wagers-table-wrapper">
                          <table className="srl-whatif-table">
                            <thead>
                              <tr>
                                <th>Punter / Tier</th>
                                <th>Market & Selection</th>
                                <th>Odds</th>
                                <th>Stake</th>
                                <th>Potential Payout</th>
                                <th>Placed</th>
                                <th>Counter</th>
                              </tr>
                            </thead>
                            <tbody>
                              {wagerTape.wagers.map((w) =>(
                                <tr key={w.betId} className={w.isWhale ? ' is-whale' : ''}>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span className={`srl-pill ${w.isWhale ? 'srl-pill-paused' : (w.userTier === 'VIP' ? 'srl-pill-live' : 'srl-pill-muted')}`} style={{ fontSize: '0.64rem', padding: '2px 6px' }}>
                                        {w.userTier}
                                      </span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{w.userEmail || w.userId}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <strong>{w.selection}</strong>
                                    <span className="srl-hint" style={{ display: 'block', fontSize: '0.72rem' }}>{w.marketTitle}</span>
                                  </td>
                                  <td>
                                    <strong>{Number(w.odds).toFixed(2)}</strong>
                                  </td>
                                  <td>
                                    <strong style={{ color: w.isWhale ? 'var(--srl-warn)' : 'inherit' }}>
                                      {formatInr(w.stake)}
                                    </strong>
                                  </td>
                                  <td>
                                    <span style={{ color: 'var(--srl-text-muted)' }}>{formatInr(w.potentialPayout)}</span>
                                  </td>
                                  <td>
                                    <span className="srl-hint" style={{ fontSize: '0.72rem' }}>
                                      {w.placedAt ? new Date(w.placedAt).toLocaleTimeString() : 'Just now'}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="srl-btn srl-btn-orange"
                                      style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                                      disabled={busy}
                                      onClick={() =>{
                                        run(
                                          () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/margin`, { marginBump: 0.05 }),
                                          `+5% Counter-Defense applied against ${w.selection}!`,
                                        );
                                      }}
                                    >
                                       +5% Counter
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: TOSS & LINEUP ═══ */}
                {matchZone === 'toss_squad' && (
                  <div className="srl-tab-body" key="toss_squad">
                    {/* Pre-Match Toss Simulator */}
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between' }}>
                        <span>Official Toss Simulator & Election</span>
                        {selected.toss?.winner && (
                          <span className={`srl-pill ${selected.toss?.locked ? 'srl-pill-live' : 'srl-pill-paused'}`}>
                            {selected.toss?.locked ? 'Locked · ' : ''}
                            Toss: {(selected.toss.winnerName || selected.toss.wonToss || (selected.toss.winner === selected.homeTeamId ? selected.homeShort : selected.awayShort))} ({selected.toss.decision})
                          </span>
                        )}
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Lock anytime on the desk. Users only see the toss from <strong>25 minutes before start</strong> — markets stay suspended until then, then auto-publish and settle.
                      </p>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="srl-btn srl-btn-amber"
                          disabled={busy || tossFlipping || selected.toss?.locked}
                          onClick={simulateCoinFlip}
                          style={{ height: 38, fontWeight: 800 }}
                        >
                          {tossFlipping ? 'Spinning coin…' : 'Simulate Coin Flip'}
                        </button>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className={`srl-chip${tossWinnerKey === selected.homeTeamId ? ' is-on' : ''}`}
                            disabled={busy || selected.toss?.locked}
                            onClick={() => setTossWinnerKey(selected.homeTeamId)}
                          >
                            {selected.homeShort} ({selected.homeTeam})
                          </button>
                          <button
                            type="button"
                            className={`srl-chip${tossWinnerKey === selected.awayTeamId ? ' is-on' : ''}`}
                            disabled={busy || selected.toss?.locked}
                            onClick={() => setTossWinnerKey(selected.awayTeamId)}
                          >
                            {selected.awayShort} ({selected.awayTeam})
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className={`srl-chip${tossDecision === 'BAT' ? ' is-on' : ''}`}
                            disabled={busy || selected.toss?.locked}
                            onClick={() => setTossDecision('BAT')}
                          >
                             Elect to BAT
                          </button>
                          <button
                            type="button"
                            className={`srl-chip${tossDecision === 'BOWL' ? ' is-on' : ''}`}
                            disabled={busy || selected.toss?.locked}
                            onClick={() => setTossDecision('BOWL')}
                          >
                             Elect to BOWL
                          </button>
                        </div>
                        <button
                          type="button"
                          className="srl-btn srl-btn-teal"
                          disabled={busy || !tossWinnerKey || selected.toss?.locked}
                          onClick={() => {
                            run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/toss`, {
                                winnerTeamId: tossWinnerKey,
                                decision: tossDecision,
                                lockAndDeclare: true,
                              }),
                              `Toss locked: ${tossWinnerKey === selected.homeTeamId ? selected.homeShort : selected.awayShort} to ${tossDecision}`,
                            );
                          }}
                        >
                          Lock Toss
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate"
                          disabled={busy || !tossWinnerKey || selected.toss?.locked}
                          onClick={() => {
                            run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/toss`, {
                                winnerTeamId: tossWinnerKey,
                                decision: tossDecision,
                                lockAndDeclare: false,
                              }),
                              `Toss saved (desk only): ${tossWinnerKey === selected.homeTeamId ? selected.homeShort : selected.awayShort} to ${tossDecision}`,
                            );
                          }}
                        >
                          Save without lock
                        </button>
                      </div>
                      {selected.toss?.locked && !selected.toss?.userPublished && (
                        <p className="srl-hint" style={{ margin: '10px 0 0', color: 'var(--srl-warn-text, #b45309)' }}>
                          Locked for desk. Users see the toss only from 25 minutes before start
                          {selected.toss?.publicRevealAt
                            ? ` (${new Date(selected.toss.publicRevealAt).toLocaleTimeString()})`
                            : ''}
                          . Markets stay suspended until then.
                        </p>
                      )}
                      {selected.toss?.locked && selected.toss?.userPublished && (
                        <p className="srl-hint" style={{ margin: '10px 0 0', color: 'var(--srl-ok-text, #059669)' }}>
                          Live for users — toss markets settled, scoreboard shows the result.
                        </p>
                      )}
                    </div>

                    {/* Squad & Impact Player Desk */}
                    <div className="srl-zone" style={{ marginTop: 14 }}>
                      <div className="srl-zone-label --live">
                         Playing XI & Impact Players Desk
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 10 }}>
                        {/* Home Squad */}
                        <div className="srl-squad-box">
                          <strong>{selected.homeShort} Playing XI</strong>
                          <textarea
                            className="srl-input srl-squad-textarea"
                            placeholder="Player 1, Player 2, Player 3..."
                            value={homeXIInput}
                            onChange={(e) => setHomeXIInput(e.target.value)}
                            rows={4}
                          />
                          <input
                            className="srl-input"
                            type="text"
                            placeholder="Impact Player (e.g. Shivam Dube)"
                            value={homeImpactInput}
                            onChange={(e) => setHomeImpactInput(e.target.value)}
                            style={{ marginTop: 6, height: 34 }}
                          />
                          <button
                            type="button"
                            className="srl-btn srl-btn-blue"
                            style={{ marginTop: 8 }}
                            disabled={busy}
                            onClick={() =>{
                              const players = homeXIInput.split(',').map((p) => p.trim()).filter(Boolean);
                              run(
                                () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/lineup`, {
                                  teamId: selected.homeTeamId,
                                  playingXI: players,
                                  impactPlayer: homeImpactInput.trim() || null,
                                }),
                                `${selected.homeShort} lineup saved (${players.length} players)`,
                              );
                            }}
                          >
                            Save {selected.homeShort} Lineup
                          </button>
                        </div>

                        {/* Away Squad */}
                        <div className="srl-squad-box">
                          <strong>{selected.awayShort} Playing XI</strong>
                          <textarea
                            className="srl-input srl-squad-textarea"
                            placeholder="Player 1, Player 2, Player 3..."
                            value={awayXIInput}
                            onChange={(e) => setAwayXIInput(e.target.value)}
                            rows={4}
                          />
                          <input
                            className="srl-input"
                            type="text"
                            placeholder="Impact Player (e.g. Suryakumar Yadav)"
                            value={awayImpactInput}
                            onChange={(e) => setAwayImpactInput(e.target.value)}
                            style={{ marginTop: 6, height: 34 }}
                          />
                          <button
                            type="button"
                            className="srl-btn srl-btn-blue"
                            style={{ marginTop: 8 }}
                            disabled={busy}
                            onClick={() =>{
                              const players = awayXIInput.split(',').map((p) => p.trim()).filter(Boolean);
                              run(
                                () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/lineup`, {
                                  teamId: selected.awayTeamId,
                                  playingXI: players,
                                  impactPlayer: awayImpactInput.trim() || null,
                                }),
                                `${selected.awayShort} lineup saved (${players.length} players)`,
                              );
                            }}
                          >
                            Save {selected.awayShort} Lineup
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: BALL REPLAY & AUDIT ═══ */}
                {matchZone === 'replay' && (
                  <div className="srl-tab-body" key="replay">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Ball-by-Ball Timeline Replay ({replayDeliveries.length} Deliveries)</span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="srl-btn srl-btn-slate"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            disabled={busy || replayLoading}
                            onClick={fetchReplay}
                          >
                             Refresh Replay
                          </button>
                          <button
                            type="button"
                            className="srl-btn srl-btn-violet"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            onClick={() => exportAudit('json')}
                          >
                            Export JSON
                          </button>
                          <button
                            type="button"
                            className="srl-btn srl-btn-teal"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            onClick={() => exportAudit('csv')}
                          >
                            Export CSV
                          </button>
                        </div>
                      </div>

                      {/* Replay Filters */}
                      <div className="srl-filters" style={{ margin: '10px 0' }}>
                        {[
                          { id: 'all', label: 'All Balls' },
                          { id: 'boundaries', label: 'Boundaries (4/6)' },
                          { id: 'wickets', label: 'Wickets Only' },
                        ].map((rf) =>(
                          <button
                            key={rf.id}
                            type="button"
                            className={`srl-filter${replayFilter === rf.id ? ' is-on' : ''}`}
                            onClick={() => setReplayFilter(rf.id)}
                          >
                            {rf.label}
                          </button>
                        ))}
                      </div>

                      {replayFallOfWickets.length > 0 && (
                        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--srl-surface-2, rgba(0,0,0,0.04))', borderRadius: 8 }}>
                          <strong style={{ fontSize: '0.82rem' }}>Fall of Wickets</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            {replayFallOfWickets.map((fw, i) => (
                              <span key={`${fw.over}-${i}`} className="srl-pill srl-pill-paused" style={{ fontSize: '0.72rem' }}>
                                {fw.score?.runs ?? '?'}/{i + 1} · Ov {fw.over} · {fw.wicketType} · {playerLabel(fw.batsman, 'Batter')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Deliveries Timeline List */}
                      {replayLoading && replayDeliveries.length === 0 ? (
                        <p className="srl-hint">Loading ball-by-ball delivery log…</p>
                      ) : replayDeliveries.length === 0 ? (
                        <p className="srl-hint">No deliveries recorded yet. Deliveries will appear as balls are bowled.</p>
                      ) : (
                        <div className="srl-replay-list">
                          {replayDeliveries
                            .filter((d) =>{
                              if (replayFilter === 'boundaries') return d.outcome === 'FOUR' || d.outcome === 'SIX';
                              if (replayFilter === 'wickets') return !!d.wicket;
                              return true;
                            })
                            .slice(-50)
                            .reverse()
                            .map((d, dIdx) =>(
                              <div key={d.ballId || dIdx} className="srl-replay-item">
                                <div className="srl-replay-top">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="srl-replay-over">Ov {d.overNumber}.{d.ballInOver}</span>
                                    <span className={`srl-ball-chip --${String(d.outcome || '').toLowerCase()}`}>
                                      {d.wicket ? 'W' : (d.runs || '0')}
                                    </span>
                                    <strong>{playerLabel(d.batsman, 'Batter')} vs {playerLabel(d.bowler, 'Bowler')}</strong>
                                    {d.wicket && d.wicketType && (
                                      <span className="srl-pill srl-pill-paused" style={{ fontSize: '0.64rem', padding: '1px 6px' }}>
                                        {d.wicketType}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {d.score && (
                                      <span className="srl-replay-score">
                                        Board: {d.score.runs}/{d.score.wickets ?? '?'} ({d.score.overs} ov)
                                      </span>
                                    )}
                                    <span className="srl-hint" style={{ fontSize: '0.72rem' }}>
                                      {d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : ''}
                                    </span>
                                  </div>
                                </div>
                                {d.commentary && (
                                  <p className="srl-replay-commentary">
                                    {d.commentary}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: ATMOSPHERE & ENVIRONMENTAL PHYSICS ═══ */}
                {matchZone === 'weather' && (
                  <div className="srl-tab-body" key="weather">
                    <div className="srl-zone">
                      <div className="srl-zone-label --info" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>Environmental Physics Engine (Dew, Pitch & Swing)</span>
                        <span className="srl-pill srl-pill-live">
                          Active: {selected.environment?.pitchWear?.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="srl-hint" style={{ margin: '0 0 12px' }}>
                        Atmospheric conditions dynamically alter pitch bounce, ball grip, boundary strike frequency, and wicket mode distributions.
                      </p>

                      <div className="srl-env-grid">
                        {/* Dew Factor Slider */}
                        <div className="srl-env-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.85rem' }}>Dew Factor (Night Chases)</strong>
                            <span style={{ fontWeight: 800, color: '#38bdf8' }}>{dewFactorInput}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={dewFactorInput}
                            onChange={(e) => setDewFactorInput(Number(e.target.value))}
                            className="srl-slider"
                            style={{ margin: '10px 0' }}
                          />
                          <p className="srl-hint" style={{ margin: 0, fontSize: '0.72rem' }}>
                            {dewFactorInput >= 60 ? 'Heavy Dew: Extreme boundary boost (+18%), spin grip suppressed, wet ball wides.' : (dewFactorInput >= 25 ? 'Moderate Dew: Ball slippery, batsmen gain +8% boundary advantage.' : 'Dry Ball: Standard grip and natural spin turn.')}
                          </p>
                        </div>

                        {/* Pitch Wear Selector */}
                        <div className="srl-env-card">
                          <label className="srl-field">
                            Pitch Condition & Wear Matrix
                            <select
                              value={pitchWearInput}
                              onChange={(e) => setPitchWearInput(e.target.value)}
                              className="srl-input"
                              style={{ height: 36, marginTop: 6 }}
                            >
                              <option value="FRESH_BELTER">Fresh Belter (True bounce, 200+ par)</option>
                              <option value="DRY_DUSTBOWL">Dry Dustbowl (Sharp spin, LBW/Bowled x1.4)</option>
                              <option value="GREEN_SEAMER">Green Seamer (Late swing, slips edges x1.5)</option>
                              <option value="CRACKED_MINEFIELD">Cracked Minefield (Variable bounce chaos)</option>
                            </select>
                          </label>
                          <p className="srl-hint" style={{ margin: '6px 0 0', fontSize: '0.72rem' }}>
                            Directly modifies batsman edge rate and bowler dismissal probability.
                          </p>
                        </div>

                        {/* Swing Index Slider */}
                        <div className="srl-env-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.85rem' }}>Swing & Seam Movement</strong>
                            <span style={{ fontWeight: 800, color: 'var(--srl-live)' }}>{swingIndexInput}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={swingIndexInput}
                            onChange={(e) => setSwingIndexInput(Number(e.target.value))}
                            className="srl-slider"
                            style={{ margin: '10px 0' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={overcastInput}
                                onChange={(e) => setOvercastInput(e.target.checked)}
                              />
                               Overcast Skies
                            </label>
                            <span className="srl-hint" style={{ fontSize: '0.7rem' }}>
                              {overcastInput ? 'Enhanced Powerplay Seam' : 'Clear Sun'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36, padding: '0 20px' }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/environment`, {
                              dewFactor: dewFactorInput,
                              pitchWear: pitchWearInput,
                              swingIndex: swingIndexInput,
                              overcast: overcastInput,
                            }),
                            `Atmosphere updated: Dew ${dewFactorInput}%, ${pitchWearInput}`,
                          )}
                        >
                          Apply Atmosphere Physics
                        </button>
                      </div>
                    </div>

                    {/* DLS Engine & Rain Delays */}
                    <div className="srl-zone" style={{ marginTop: 14 }}>
                      <div className="srl-zone-label --warn">DLS Engine & Rain Delays</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`srl-btn ${selected.rainDelay ? 'srl-btn-teal' : 'srl-btn-orange'}`}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/rain-delay`, { isDelayed: !selected.rainDelay }),
                            selected.rainDelay ? 'Rain cleared · Match resumed' : 'Rain delay started · Betting held',
                          )}
                        >
                          {selected.rainDelay ? 'Clear Rain Delay' : 'Start Rain Delay'}
                        </button>
                        <label className="srl-field" style={{ width: 130 }}>
                          Shorten Overs
                          <select
                            value={oversReductionInput}
                            onChange={(e) => setOversReductionInput(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          >
                            <option value="15">15 overs</option>
                            <option value="12">12 overs</option>
                            <option value="10">10 overs</option>
                            <option value="8">8 overs</option>
                            <option value="5">5 overs (Min)</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36 }}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/reduce-overs`, { overs: Number(oversReductionInput) }),
                            `Match reduced to ${oversReductionInput} overs (DLS recalculation applied)`,
                          )}
                        >
                          Apply DLS Reduction
                        </button>
                      </div>
                      {selected.dlsTarget && (
                        <p className="srl-hint" style={{ marginTop: 8, fontWeight: 700, color: 'var(--srl-accent-strong)', fontSize: '0.82rem' }}>
                          Revised DLS Target: {selected.dlsTarget}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: BROADCAST ═══ */}
                {matchZone === 'broadcast' && (
                  <div className="srl-tab-body" key="broadcast">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent">Broadcast Live Commentary</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="Type custom breaking commentary..."
                          value={commentaryText}
                          onChange={(e) => setCommentaryText(e.target.value)}
                          className="srl-input"
                          style={{ flex: 1, minWidth: 200, height: 36 }}
                        />
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36 }}
                          disabled={busy || !commentaryText.trim()}
                          onClick={() =>{
                            run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/commentary`, { text: commentaryText, eventTag: commentaryTag }),
                              'Commentary broadcasted!',
                            );
                            setCommentaryText('');
                          }}
                        >
                          Broadcast
                        </button>
                      </div>
                      <div className="srl-tag-chips">
                        {['DRS_REVIEW', 'STRATEGIC_TIMEOUT', 'FREE_HIT', 'INJURY_STOPPAGE', 'GENERAL'].map((tag) =>(
                          <button
                            key={tag}
                            type="button"
                            className={`srl-tag-chip${commentaryTag === tag ? ' is-active' : ''}`}
                            onClick={() => setCommentaryTag(tag)}
                          >
                            {tag.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selected.commentary && (
                      <div className="srl-zone" style={{ marginTop: 12 }}>
                        <div className="srl-zone-label --accent">Current Commentary</div>
                        <p className="srl-commentary" style={{ margin: 0 }}>{selected.commentary}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ ZONE: MARKETS ═══ */}
                {matchZone === 'markets' && (
                  <div className="srl-tab-body" key="markets">
                    <div className="srl-markets">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between' }}>
                        <span>
                          All Markets
                          {marketsDesk
                            ? ` · ${marketsDesk.marketCount ?? marketsDesk.markets?.length ?? 0} markets · ${marketsDesk.openBets || 0} bets · ${formatInr(marketsDesk.openStake)}`
                            : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        <button
                          type="button"
                          className="srl-btn srl-btn-violet"
                          style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/bulk-settle`, { phase: 'toss' }),
                            'Toss markets settled in bulk!',
                          )}
                        >
                           Settle Toss
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-violet"
                          style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/bulk-settle`, { phase: 'innings1' }),
                            '1st Innings markets settled in bulk!',
                          )}
                        >
                           Settle 1st Innings
                        </button>
                      </div>

                      <div className="srl-market-filters">
                        {[
                          { id: 'all', label: 'All odds' },
                          { id: 'toss', label: 'Toss' },
                          { id: 'winner', label: 'Winner' },
                          { id: 'totals', label: 'Totals' },
                          { id: 'innings', label: 'Innings / overs' },
                          { id: 'open', label: 'Open + staked' },
                          { id: 'staked', label: 'With stakes' },
                          { id: 'locked', label: 'Locked / settled' },
                        ].map((f) =>(
                          <button
                            key={f.id}
                            type="button"
                            className={`srl-chip${marketFilter === f.id ? ' is-on' : ''}`}
                            onClick={() => setMarketFilter(f.id)}
                          >
                            {f.label}
                            {f.id === 'toss' && marketsDesk?.tossMarkets?.length
                              ? ` · ${marketsDesk.tossMarkets.length}`
                              : ''}
                          </button>
                        ))}
                      </div>
                      {marketsLoading && !marketsDesk && (
                        <p className="srl-hint">Loading markets…</p>
                      )}
                      {marketsError && <p className="srl-console-error">{marketsError}</p>}
                      <div className="srl-market-list">
                        {visibleMarkets.map((market) =>{
                          const status = String(market.status || 'OPEN').toUpperCase();
                          const settled = ['DETERMINED', 'VOID', 'VOIDED'].includes(status);
                          const mid = encodeURIComponent(market.marketId);
                          return (
                            <div key={market.marketId} className={`srl-market-card${settled || status === 'SUSPENDED' ? ' is-locked' : ''}`}>
                              <div className="srl-market-card__head">
                                <div>
                                  <strong>{market.title || market.name}</strong>
                                  <span className="srl-hint">
                                    {market.marketId}
                                    {market.line != null ? ` · line ${market.line}` : ''}
                                    {(market.book?.bets || 0) >0
                                      ? ` · ${market.book.bets} bets · ${formatInr(market.book.stake)}`
                                      : ''}
                                  </span>
                                </div>
                                <div className="srl-market-card__actions">
                                  <StatusPill value={status} />
                                  <button
                                    type="button"
                                    className="srl-chip"
                                    disabled={busy || settled}
                                    onClick={() => run(
                                      () => adminApiClient.post(
                                        `/iplsrl/matches/${selected.matchId}/markets/${mid}/suspend`,
                                        { suspended: status !== 'SUSPENDED' },
                                      ),
                                      status === 'SUSPENDED' ? 'Market opened' : 'Market locked',
                                    )}
                                  >
                                    {status === 'SUSPENDED' ? 'Unlock' : 'Lock'}
                                  </button>
                                  <button
                                    type="button"
                                    className="srl-chip"
                                    disabled={busy || settled}
                                    onClick={() => setMarketAsk({
                                      marketId: market.marketId,
                                      title: market.title || market.name,
                                      voidMarket: true,
                                      bets: market.book?.bets || 0,
                                      stake: market.book?.stake || 0,
                                    })}
                                  >
                                    Void
                                  </button>
                                </div>
                              </div>
                              <div className="srl-market-sels">
                                {(market.selections || []).map((sel) =>(
                                    <button
                                      key={sel.selectionId}
                                      type="button"
                                      className={`srl-market-sel${sel.won ? ' is-won' : ''}`}
                                      disabled={busy || settled}
                                      title={settled ? 'Already settled' : 'Declare this selection the winner'}
                                      onClick={() => setMarketAsk({
                                        marketId: market.marketId,
                                        title: market.title || market.name,
                                        selectionId: sel.selectionId,
                                        selectionName: sel.name,
                                        voidMarket: false,
                                        bets: sel.book?.bets || 0,
                                        stake: sel.book?.stake || 0,
                                        payout: sel.book?.payout || 0,
                                        odds: sel.odds,
                                      })}
                                    >
                                      <span>{sel.name}</span>
                                      <strong>{sel.odds != null ? Number(sel.odds).toFixed(2) : '—'}</strong>
                                      <em>
                                        {(sel.book?.bets || 0) >0
                                          ? `${sel.book.bets} · ${formatInr(sel.book.stake)}`
                                          : 'No open bets'}
                                      </em>
                                    </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {!marketsLoading && visibleMarkets.length === 0 && (
                          <p className="srl-hint">No markets in this filter.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Standings — always visible below cockpit */}
            <Panel title="Standings"hint="10 teams · W=2 pts">
              <div className="srl-standings">
                {(snap.standings || []).map((row) =>(
                  <div key={row.teamId} className="srl-stand-row">
                    <span className="srl-hint">{row.rank}</span>
                    <strong>{row.shortName}</strong>
                    <span className="srl-hint">{row.played ?? row.matches ?? 0} P · {row.won ?? 0} W · {row.points} pts</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ═══ TEAMS TAB ═══ */}
      {tab === 'teams' && snap && (
        <Panel title="Teams & strength ratings"hint={`${snap.teams?.length || 0} teams`}>
          <div className="srl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Short</th>
                  <th>Venue</th>
                  <th>Rating</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(snap.teams || []).map((t) =>(
                  <tr key={t.teamId}>
                    <td><strong>{t.teamName}</strong></td>
                    <td>{t.shortName}</td>
                    <td>{t.homeVenue}</td>
                    <td>
                      <input
                        type="number"
                        className="srl-input"
                        defaultValue={t.strengthRating}
                        style={{ width: 72, padding: '6px 8px' }}
                        onBlur={(e) =>{
                          const val = Number(e.target.value);
                          if (val === t.strengthRating) return;
                          run(() => adminApiClient.post(`/iplsrl/teams/${t.teamId}/rating`, { strengthRating: val }), 'Rating updated');
                        }}
                      />
                    </td>
                    <td><StatusPill value={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ═══ PLAYERS TAB ═══ */}
      {tab === 'players' && snap && (
        <Panel title="Player roster"hint={`${snap.players?.length || 0} players`}>
          <div className="srl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Role</th>
                  <th>Bat</th>
                  <th>Bowl</th>
                  <th>Form</th>
                </tr>
              </thead>
              <tbody>
                {(snap.players || []).slice(0, 80).map((p) =>(
                  <tr key={p.playerId}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.teamId}</td>
                    <td>{p.role}</td>
                    <td>{p.battingRating}</td>
                    <td>{p.bowlingRating}</td>
                    <td>{p.formRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ═══ AUDIT TAB ═══ */}
      {tab === 'audit' && snap && (
        <Panel title="Operator audit log"hint={`${snap.audit?.length || 0} recent`}>
          <div className="srl-audit">
            {(snap.audit || []).map((a) =>(
              <div key={a.id} className="srl-audit-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ fontSize: '0.82rem' }}>{a.action}</strong>
                  <span className="srl-hint">{a.time}</span>
                </div>
                <div className="srl-hint" style={{ marginTop: 4 }}>{a.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ═══ DIALOGS ═══ */}
      <AdminConfirmDialog
        isOpen={!!declareAsk}
        variant="warning"
        icon=""
        title={`Declare ${declareAsk?.short} winner?`}
        description="This settles the match for users and pays match-winner bets. Betting on this fixture closes. Mandatory note required."
        requireReason
        reasonPlaceholder="Settlement / declare note…"
        details={declareAsk ? [
          { label: 'Winner', value: declareAsk.short },
          { label: 'Open stake on this side', value: `${declareAsk.bets} bets` },
          { label: 'Payout if they win', value: formatInr(declareAsk.payout) },
          { label: 'House after payout', value: formatInr(declareAsk.house) },
          { label: 'All open stake', value: formatInr(declareAsk.total) },
        ] : []}
        confirmLabel={`Declare ${declareAsk?.short || ''}`}
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setDeclareAsk(null)}
        onConfirm={(reason) =>{
          const ask = declareAsk;
          setDeclareAsk(null);
          if (!ask || !selected) return;
          const note = String(reason || '').trim();
          if (!note) {
            showToast('Mandatory note required', 'error');
            return;
          }
          run(
            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/declare`, { teamId: ask.teamId, note }),
            `${ask.short} declared winner`,
          );
        }}
      />

      <AdminConfirmDialog
        isOpen={!!clearAnchorsAsk}
        variant="danger"
        title="Clear all score anchors?"
        description="Removes every scripted board override and returns to natural sim scoring. Rate-limited; senior desk only."
        requireReason
        reasonPlaceholder="Why clear anchors?"
        confirmLabel="Clear anchors"
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setClearAnchorsAsk(false)}
        onConfirm={(reason) => {
          setClearAnchorsAsk(false);
          if (!selected) return;
          const note = String(reason || '').trim();
          if (!note) {
            showToast('Mandatory note required', 'error');
            return;
          }
          run(
            () => adminApiClient.delete(`/iplsrl/matches/${selected.matchId}/anchors?note=${encodeURIComponent(note)}`),
            'Cleared all score anchors',
          );
        }}
      />

      <AdminConfirmDialog
        isOpen={!!killAsk}
        variant="danger"
        title="Engage emergency kill switch?"
        description="Freezes betting and locks the desk. Senior role required. Cooldown applies after engage."
        requireReason
        reasonPlaceholder="Why engage kill switch?"
        confirmLabel="Engage kill switch"
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setKillAsk(false)}
        onConfirm={(reason) => {
          setKillAsk(false);
          if (!selected) return;
          const note = String(reason || '').trim();
          if (!note) {
            showToast('Mandatory note required', 'error');
            return;
          }
          run(
            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/circuit-breaker/kill-switch`, { active: true, note }),
            'EMERGENCY KILL-SWITCH ENGAGED · ALL BETTING FROZEN',
          );
        }}
      />

      <AdminConfirmDialog
        isOpen={!!hotkeyHelp}
        variant="warning"
        title="Match Control hotkeys"
        description="Ignored while typing in inputs."
        details={[
          { label: '0 / 1 / 4 / 6 / W', value: 'Instant inject' },
          { label: 'U', value: 'Undo last inject' },
          { label: 'C', value: 'Clear armed queue' },
          { label: 'Space', value: 'Next delivery (drain queue)' },
          { label: 'Esc', value: 'Pause match' },
          { label: '?', value: 'Toggle this help' },
        ]}
        confirmLabel="Got it"
        cancelLabel="Close"
        onCancel={() => setHotkeyHelp(false)}
        onConfirm={() => setHotkeyHelp(false)}
      />

      <AdminConfirmDialog
        isOpen={!!integrityAsk}
        variant="danger"
        title="Engage integrity hold?"
        description="Pauses the match, closes betting, mass-suspends micro-markets, and tags the desk. Mandatory note required."
        requireReason
        reasonPlaceholder="Why is this hold needed?"
        reasonDefault={integrityNote}
        confirmLabel="Engage integrity hold"
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setIntegrityAsk(false)}
        onConfirm={(reason) => {
          setIntegrityAsk(false);
          const note = String(reason || integrityNote || '').trim();
          if (!note) {
            showToast('Integrity hold requires a note', 'error');
            return;
          }
          setIntegrityNote(note);
          run(
            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/integrity-hold`, { note }),
            'Integrity hold engaged',
          );
        }}
      />

      <AdminConfirmDialog
        isOpen={!!marketAsk}
        variant={marketAsk?.voidMarket ? 'danger' : 'warning'}
        icon={marketAsk?.voidMarket ? 'void' : ''}
        title={marketAsk?.voidMarket
          ? `Void ${marketAsk?.title}?`
          : `Declare ${marketAsk?.selectionName}?`}
        description={marketAsk?.voidMarket
          ? 'Voids every open bet on this market and locks the line for users.'
          : 'Pays this selection, loses other open bets on the market, locks the line, and seeks the match clock so the scoreboard matches the declare (e.g. Over 88.5 → 89 by that over).'}
        details={marketAsk ? [
          { label: 'Market', value: marketAsk.title || marketAsk.marketId },
          ...(marketAsk.voidMarket ? [] : [
            { label: 'Winning selection', value: marketAsk.selectionName || marketAsk.selectionId },
            { label: 'Odds', value: marketAsk.odds != null ? Number(marketAsk.odds).toFixed(2) : '—' },
            { label: 'Board effect', value: 'Seek + score anchor to match this result' },
          ]),
          { label: 'Open bets affected', value: String(marketAsk.bets || 0) },
          { label: 'Open stake', value: formatInr(marketAsk.stake) },
          ...(marketAsk.voidMarket ? [] : [
            { label: 'Payout if this wins', value: formatInr(marketAsk.payout) },
          ]),
        ] : []}
        confirmLabel={marketAsk?.voidMarket ? 'Void market' : 'Declare & play'}
        cancelLabel="Cancel"
        loading={busy}
        requireReason={!!marketAsk?.voidMarket}
        reasonPlaceholder="Why void this market?"
        onCancel={() => setMarketAsk(null)}
        onConfirm={(reason) =>{
          const ask = marketAsk;
          setMarketAsk(null);
          if (!ask || !selected) return;
          const mid = encodeURIComponent(ask.marketId);
          const note = ask.voidMarket ? String(reason || '').trim() : null;
          if (ask.voidMarket && !note) {
            showToast('Mandatory note required to void', 'error');
            return;
          }
          run(
            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/markets/${mid}/declare`, {
              winningSelectionId: ask.voidMarket ? null : ask.selectionId,
              voidMarket: !!ask.voidMarket,
              note,
            }),
            ask.voidMarket
              ? `${ask.title} voided`
              : `${ask.selectionName} declared — board updated`,
          );
        }}
      />

      {/* ═══ EXHIBITION MODAL ═══ */}
      {showExhibitionModal && (
        <div className="srl-modal-overlay" onClick={() => setShowExhibitionModal(false)}>
          <div className="srl-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Exhibition Match</h3>
              <button
                type="button"
                className="srl-chip"
                onClick={() => setShowExhibitionModal(false)}
              >
                
              </button>
            </div>
            <p className="srl-hint" style={{ margin: 0 }}>
              Create an on-demand virtual fixture with immediate betting markets.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="srl-field">
                Home Team
                <select
                  value={exhibitionHome}
                  onChange={(e) => setExhibitionHome(e.target.value)}
                  className="srl-input"
                >
                  {(snap?.teams || []).map((t) =>(
                    <option key={t.teamId} value={t.teamId}>{t.shortName} · {t.name}</option>
                  ))}
                </select>
              </label>
              <label className="srl-field">
                Away Team
                <select
                  value={exhibitionAway}
                  onChange={(e) => setExhibitionAway(e.target.value)}
                  className="srl-input"
                >
                  {(snap?.teams || []).map((t) =>(
                    <option key={t.teamId} value={t.teamId}>{t.shortName} · {t.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="srl-field">
                Venue
                <input
                  type="text"
                  value={exhibitionVenue}
                  onChange={(e) => setExhibitionVenue(e.target.value)}
                  className="srl-input"
                />
              </label>
              <label className="srl-field">
                Pitch Condition
                <select
                  value={exhibitionPitch}
                  onChange={(e) => setExhibitionPitch(e.target.value)}
                  className="srl-input"
                >
                  <option value="BALANCED">Balanced</option>
                  <option value="BATTING_PARADISE">Batting Paradise</option>
                  <option value="SPIN_FRIENDLY">Spin Friendly</option>
                  <option value="PACE_BOUNCE">Pace & Bounce</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="srl-btn srl-btn-slate"
                onClick={() => setShowExhibitionModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="srl-btn srl-btn-blue"
                disabled={busy || exhibitionHome === exhibitionAway}
                onClick={() =>{
                  run(
                    () => adminApiClient.post('/iplsrl/matches/custom', {
                      homeTeamId: exhibitionHome,
                      awayTeamId: exhibitionAway,
                      venue: exhibitionVenue,
                      pitch: exhibitionPitch,
                    }),
                    'Exhibition match created & launched live!',
                  );
                  setShowExhibitionModal(false);
                }}
              >
                Launch Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}