import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { LayoutListIcon, MessageCircleIcon, ChartBarIcon } from '@animateicons/react/lucide';
import {
  HiOutlineChartBar,
  HiOutlineUsers,
  FiChevronLeft,
  FiChevronRight,
  TargetIcon,
} from '../../icons';
import TeamJersey from '../TeamJersey/TeamJersey';
import MatchCountdownTimer from '../MatchCountdownTimer/MatchCountdownTimer';
import LiveChartsWidget from '../LiveChartsWidget/LiveChartsWidget';
import { useLiveFieldState } from '../../hooks/useLiveFieldState';
import { useMatchDetail } from '../../hooks/useMatchDetail';
import { useCentralizedMatchState } from '../../hooks/useCentralizedMatchState';
import { centralizedMatchEngine } from '../../services/centralizedMatchStateEngine';
import { enrichLivePlayersFromScorecard } from '../../utils/scorecardLivePlayers';
import { resolveMatchSquads, formatPlayerRole, squadToRoster } from '../../utils/matchSquads';
import { getRosterForTeam } from '../../data/cricketRosters';
import { isPlaceholderPlayerName, displayPlayerName, parseLivePlayersFromCommentary } from '../../utils/cricketPlayers';
import { getBallDisplayKind, getBallDisplayLabel } from '../../utils/liveFieldState';
import {
  getTeamShortCode,
  getTeamDisplayName,
  getChaseText,
  buildOverHistoryRows,
  buildStatsOvers,
  buildScorecardInnings,
  getWicketOvers,
  formatInningsOversLabel,
} from '../../utils/liveMatchWidgetData';
import {
  getSportStatusBadge,
  getSportScores,
  getPeriodRows,
  getSportLeagueLabel,
} from '../../utils/sportLiveWidgetData';
import { isCricketTrackerLive, getMatchState } from '../../utils/matchBetting';
import { isCricketMatchCompleted } from '../../utils/cricketMatchComplete';
import { resolveCricketTossText } from '../../utils/cricketScores';
import { isCricketSecondInnings, isEmptyOversValue, resolveCricketTeamScores, teamNameMatches } from '../../utils/cricketScores';
import { getMatchMaxOvers, normalizeMatchOvers, oversToBallsForMatch, isTestMatch, getCricketFormatBanner, detectCricketMatchFormat } from '../../utils/cricketFormat';
import { oversToBalls } from '../../utils/oversUtils';
import { buildCanonicalMatchSnapshot, deriveSelectedInningsView } from '../../utils/cricketSnapshot';
import './LiveMatchGraphicWidget.css';

function getTeamShort(name, existingShort = '') {
  return getTeamShortCode(name, existingShort);
}

function getInningsInfo(match, team1, team2, resolved) {
  const ld = match?.liveDetails || {};
  const currentInn = resolved?.currentInnings;
  const team1Score = resolved?.team1 || { runs: 0, wickets: 0, overs: '0.0' };
  const team2Score = resolved?.team2 || { runs: 0, wickets: 0, overs: '0.0' };

  if (currentInn) {
    const battingTeam = currentInn.batTeam || team1;
    const battingScore = battingTeam === team1 ? team1Score : team2Score;
    const s1 = team1Score.runs ?? 0;
    const w1 = team1Score.wickets ?? 0;
    const s2 = team2Score.runs ?? 0;
    const w2 = team2Score.wickets ?? 0;

    return {
      inningsNum: currentInn.number || 1,
      battingTeam,
      battingShort: currentInn.batTeamShort || getTeamShort(battingTeam),
      displayScore1: s1,
      displayWickets1: w1,
      displayScore2: s2,
      displayWickets2: w2,
      displayOvers: currentInn.overs || battingScore.overs || '0.0',
      defaultInnings: `${currentInn.batTeamShort || getTeamDisplayName(battingTeam)} ${currentInn.inningsNum > 1 ? '2ND' : '1ST'} INNS`,
    };
  }

  const isChasing = isCricketSecondInnings(match, ld);

  if (isChasing) {
    let battingTeam = team2;
    if (ld.chaseTeamName) {
      if (teamNameMatches(team1, ld.chaseTeamName)) battingTeam = team1;
      else if (teamNameMatches(team2, ld.chaseTeamName)) battingTeam = team2;
    } else if (ld.firstTeamName) {
      // Chasing team is whoever didn't bat first
      battingTeam = teamNameMatches(team1, ld.firstTeamName) ? team2 : team1;
    } else {
      // Infer from which side has chase progress on the card
      const t1Active = (team1Score.runs ?? 0) > 0 || oversToBalls(team1Score.overs) > 0;
      const t2Active = (team2Score.runs ?? 0) > 0 || oversToBalls(team2Score.overs) > 0;
      if (t1Active && !t2Active) battingTeam = team1;
      else if (t2Active && !t1Active) battingTeam = team2;
      else if ((team1Score.runs ?? 0) > 0 && (team2Score.runs ?? 0) > 0) {
        // Both scored: lower balls / still batting is chase — prefer team with fewer completed overs if first finished
        battingTeam = oversToBalls(team1Score.overs) < oversToBalls(team2Score.overs) ? team1 : team2;
      }
    }

    const battingScore = battingTeam === team1 ? team1Score : team2Score;
    const s1 = team1Score.runs ?? 0;
    const w1 = team1Score.wickets ?? 0;
    const s2 = team2Score.runs ?? 0;
    const w2 = team2Score.wickets ?? 0;

    return {
      inningsNum: 2,
      battingTeam,
      battingShort: getTeamShort(battingTeam),
      displayScore1: s1,
      displayWickets1: w1,
      displayScore2: s2,
      displayWickets2: w2,
      displayOvers: (!isEmptyOversValue(battingScore.overs) ? battingScore.overs : null)
        || ld.chaseOvers
        || ld.overs2
        || '0.0',
      defaultInnings: `${getTeamDisplayName(battingTeam)} INNS`,
    };
  }

  let battingTeam = team1;
  if (ld.firstTeamName) {
    if (teamNameMatches(team2, ld.firstTeamName)) battingTeam = team2;
    else if (teamNameMatches(team1, ld.firstTeamName)) battingTeam = team1;
  } else if (team2Score.balls > team1Score.balls) {
    battingTeam = team2;
  }

  const battingScore = battingTeam === team1 ? team1Score : team2Score;
  const s1 = team1Score.runs ?? 0;
  const w1 = team1Score.wickets ?? 0;
  const s2 = team2Score.runs ?? 0;
  const w2 = team2Score.wickets ?? 0;

  return {
    inningsNum: 1,
    battingTeam,
    battingShort: getTeamShort(battingTeam),
    displayScore1: s1,
    displayWickets1: w1,
    displayScore2: s2,
    displayWickets2: w2,
    displayOvers: (!isEmptyOversValue(battingScore.overs) ? battingScore.overs : null)
      || ld.firstOvers
      || ld.overs
      || '0.0',
    defaultInnings: `${getTeamDisplayName(battingTeam)} INNS`,
  };
}

function BallDot({ ball, size = 'md', latest = false }) {
  const kind = getBallDisplayKind(ball);
  const label = getBallDisplayLabel(ball);
  const isCompact = kind === 'wide' || kind === 'legbye' || kind === 'noball';

  return (
    <span
      className={`cric-ball cric-ball--${kind} cric-ball--${size}${isCompact ? ' cric-ball--extra' : ''}${latest ? ' cric-ball--latest' : ''}`}
      title={ball === '…' ? 'Ball in progress' : ball}
    >
      {label}
    </span>
  );
}

export function CricketFieldVisual() {
  return (
    <div className="cric-field-pitch">
      <div className="cric-field-pitch__bg">
        <svg viewBox="0 0 400 220" fill="none" className="cric-pitch-svg" preserveAspectRatio="none">
          <rect width="400" height="220" fill="url(#grass-grad)" />
          <polygon points="130,220 270,220 225,100 175,100" fill="url(#pitch-strip-grad)" opacity="0.85" />
          <line x1="145" y1="195" x2="255" y2="195" stroke="#ffffff" strokeWidth="1.5" opacity="0.75" />
          <line x1="180" y1="115" x2="220" y2="115" stroke="#ffffff" strokeWidth="1.5" opacity="0.75" />
          <rect x="195" y="105" width="2" height="12" fill="#ffffff" opacity="0.9" />
          <rect x="199" y="105" width="2" height="12" fill="#ffffff" opacity="0.9" />
          <rect x="203" y="105" width="2" height="12" fill="#ffffff" opacity="0.9" />
          <path d="M145 200 Q 200 150 255 125" stroke="#ef4444" strokeWidth="2.5" strokeDasharray="5,3" fill="none" opacity="0.85" />
          <circle cx="255" cy="125" r="4.5" fill="#ef4444" />

          <defs>
            <linearGradient id="grass-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#255428" />
              <stop offset="50%" stopColor="#356d39" />
              <stop offset="100%" stopColor="#1f4722" />
            </linearGradient>
            <linearGradient id="pitch-strip-grad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#bc9a62" />
              <stop offset="100%" stopColor="#9e7e4b" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function LiveWidgetTabIcon({ Icon, active, size = 18 }) {
  const iconRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const node = iconRef.current;
    if (!active || !node?.startAnimation) return undefined;

    const run = () => {
      if (cancelled) return;
      try {
        node.startAnimation?.();
      } catch {
        /* motion scope can be null after unmount */
      }
    };

    run();
    const id = window.setInterval(run, 1800);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active]);

  return (
    <span className={`cric-tab-icon-wrap${active ? ' is-active' : ''}`}>
      <Icon
        ref={iconRef}
        size={size}
        className="cric-tab-icon"
        color="currentColor"
        isAnimated={false}
      />
    </span>
  );
}

function OverHistoryBar({ rows, inningsNum }) {
  const scrollRef = useRef(null);
  const [canScroll, setCanScroll] = useState(false);
  const displayRows = useMemo(
    () => (rows?.length ? rows : [{ overNum: 1, balls: ['…'], isCurrent: true }]),
    [rows],
  );

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScroll(el.scrollWidth > el.clientWidth + 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [displayRows, measure]);

  const scrollByDir = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  };

  const lastOver = displayRows[displayRows.length - 1];
  const lastBallIdx = (lastOver?.balls?.length || 1) - 1;

  return (
    <div className={`cric-over-history-wrap${canScroll ? ' cric-over-history-wrap--scrollable' : ''}`}>
      {inningsNum ? (
        <span className="cric-over-history__inn" aria-hidden="true">{inningsNum}</span>
      ) : null}
      {canScroll && (
        <button
          type="button"
          className="cric-over-history-nav cric-over-history-nav--prev"
          onClick={() => scrollByDir(-1)}
          aria-label="Scroll to earlier overs"
        >
          <FiChevronLeft size={14} />
        </button>
      )}
      <div className="cric-over-history" ref={scrollRef} role="region" aria-label="Ball-by-ball over history">
        {displayRows.map((row) => (
          <div
            key={`${row.inningsId || 'x'}-${row.overNum}`}
            className={`cric-over-history__block${row.isCurrent ? ' cric-over-history__block--current' : ''}`}
          >
            <span className="cric-over-history__label">OVER {row.overNum}</span>
            <div className="cric-over-history__balls">
              {(row.balls || []).map((ball, idx) => (
                <BallDot
                  key={`${row.overNum}-${idx}`}
                  ball={ball}
                  size="sm"
                  latest={row.isCurrent && idx === lastBallIdx}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {canScroll && (
        <button
          type="button"
          className="cric-over-history-nav cric-over-history-nav--next"
          onClick={() => scrollByDir(1)}
          aria-label="Scroll to later overs"
        >
          <FiChevronRight size={14} />
        </button>
      )}
      <span className="cric-over-history-hint" hidden={!canScroll} aria-hidden="true">
        ← scroll →
      </span>
    </div>
  );
}

function SportLivePanel({ match, team1, team2, team1Display, team2Display, matchState }) {
  const [activeTab, setActiveTab] = useState('live');
  const scores = getSportScores(match);
  const statusBadge = getSportStatusBadge(match);
  const periodRows = getPeriodRows(match);
  const commentary = match?.liveDetails?.commentary;
  const league = getSportLeagueLabel(match);
  const hasPeriods = periodRows.length > 0;

  return (
    <div className="live-graphic-card-10cric">
      <div className="live-widget-body">
        <div className="live-widget-inn-badge live-widget-inn-badge--sport">
          {matchState === 'in' ? statusBadge : statusBadge}
        </div>

        <p className="live-widget-league-label">{league}</p>

        <div className="live-widget-teams-row">
          <span className="live-widget-team">{team1Display}</span>
          <span className="live-widget-scoreline">
            {scores.score1}{scores.suffix1}
            <span className="live-widget-score-sep">:</span>
            {scores.score2}{scores.suffix2}
          </span>
          <span className="live-widget-team">{team2Display}</span>
        </div>

        {commentary && (
          <p className="live-widget-chase-text">{commentary}</p>
        )}

        <div className="live-widget-tabs live-widget-tabs--sport" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'live'}
            onClick={() => setActiveTab('live')}
            className={`live-widget-tab live-widget-tab--text ${activeTab === 'live' ? 'active' : ''}`}
          >
            Live
          </button>
          {hasPeriods && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'periods'}
              onClick={() => setActiveTab('periods')}
              className={`live-widget-tab live-widget-tab--text ${activeTab === 'periods' ? 'active' : ''}`}
            >
              {match.sport === 'tennis' ? 'Sets' : 'Periods'}
            </button>
          )}
        </div>

        {activeTab === 'live' && (
          <div className="sport-live-panel">
            <div className="sport-live-status-card">
              <span className="sport-live-status-card__label">Status</span>
              <strong>{statusBadge}</strong>
            </div>
            <div className="sport-live-score-grid">
              <div className="sport-live-score-cell">
                <span>{team1}</span>
                <strong>{scores.score1}{scores.suffix1}</strong>
              </div>
              <div className="sport-live-score-cell">
                <span>{team2}</span>
                <strong>{scores.score2}{scores.suffix2}</strong>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'periods' && hasPeriods && (
          <div className="cric-panel cric-panel--light sport-periods-panel">
            <div className="sport-periods-table">
              <div className="sport-periods-table__head">
                <span />
                <span>{team1Display}</span>
                <span>{team2Display}</span>
              </div>
              {periodRows.map((row) => (
                <div key={row.label} className="sport-periods-table__row">
                  <span className="sport-periods-table__label">{row.label}</span>
                  <span>{row.score1}</span>
                  <span>{row.score2}</span>
                </div>
              ))}
              <div className="sport-periods-table__row sport-periods-table__row--total">
                <span className="sport-periods-table__label">Total</span>
                <span>{scores.score1}</span>
                <span>{scores.score2}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreMatchCricketPanel({ match, team1Display, team2Display, matchState }) {
  const status = match?.liveDetails?.commentary || match?.time || 'Match has not started yet';
  const formatBanner = getCricketFormatBanner(match);
  const isCompleted = matchState === 'post' || match?.isCompleted || match?.status === 'COMPLETED';

  return (
    <div className="live-graphic-card-10cric">
      <div className="live-widget-body live-widget-body--prematch" style={{ padding: '24px 16px', textAlign: 'center' }}>
        <div className="live-widget-format-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span className="cricket-format-badge">{formatBanner}</span>
          <span className={`cricket-status-chip ${isCompleted ? 'chip-completed' : 'chip-upcoming'}`}>
            {isCompleted ? 'COMPLETED' : 'UPCOMING'}
          </span>
        </div>

        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
          <MatchCountdownTimer match={match} style={{ fontSize: '0.95rem', padding: '6px 18px' }} />
        </div>

        <div className="live-widget-teams-row">
          <span className="live-widget-team">{team1Display}</span>
          <span className="live-widget-scoreline live-widget-scoreline--vs">VS</span>
          <span className="live-widget-team">{team2Display}</span>
        </div>

        <p className="live-widget-prematch-status">{status}</p>
        {(() => {
          const tossText = resolveCricketTossText(match);
          if (!tossText) return null;
          return (
            <p className="live-widget-chase-text" style={{ marginTop: '6px' }}>
              🪙 {tossText}
            </p>
          );
        })()}
        <p className="live-widget-prematch-hint">
          {isCompleted
            ? 'Final scorecard will appear here when available.'
            : 'Live scores and ball-by-ball tracker will appear once play begins.'}
        </p>
      </div>
    </div>
  );
}

function BasketballCourtIcon() {
  return (
    <svg className="cric-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <circle cx="12" cy="12" r="4" />
      <path d="M3 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4" />
      <path d="M21 8a4 4 0 0 0-4 4 4 4 0 0 0 4 4" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg className="cric-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function BasketballLiveGraphicWidget({ match }) {
  const [activeTab, setActiveTab] = useState('court');
  const ld = match?.liveDetails || {};

  const team1 = match?.team1?.name || match?.team1 || 'Team 1';
  const team2 = match?.team2?.name || match?.team2 || 'Team 2';
  const team1Short = getTeamShortCode(team1, match?.team1?.shortName);
  const team2Short = getTeamShortCode(team2, match?.team2?.shortName);

  const score1 = ld.score1 ?? ld.runs ?? 36;
  const score2 = ld.score2 ?? ld.wickets ?? 29;

  const quarter = ld.quarter || ld.period || '2nd';
  const clock = ld.clock || ld.time || '00:03';
  const league = match?.league || 'NBL';

  const isQ1 = /1st|q1/i.test(quarter);
  const isQ2 = /2nd|q2/i.test(quarter);
  const isQ3 = /3rd|q3/i.test(quarter);
  const isQ4 = /4th|q4/i.test(quarter);

  let currentMin = 19;
  if (isQ1) currentMin = 6;
  else if (isQ2) currentMin = 19;
  else if (isQ3) currentMin = 28;
  else if (isQ4) currentMin = 37;

  const progressPct = Math.min(100, Math.max(0, (currentMin / 40) * 100));

  const hasPossession = ld.possession || 'team1';
  const isTeam1Possession = hasPossession === 'team1' || teamNameMatches(team1, hasPossession);

  const lastEvent = ld.lastEvent || {
    teamName: team2,
    action: '3 pt scored',
    detail: '2/9 (22.2%) 3 Point Shots',
    color: '#eab308',
  };

  return (
    <div className="live-graphic-card-10cric bb-widget">
      <div className="bb-header-bar">
        <span className="bb-header-title">
          <span className="bb-icon">🏀</span> {league}
        </span>
      </div>

      <div className="bb-body">
        <div className="bb-score-header-badge">
          {quarter} | {clock}
        </div>

        <div className="bb-teams-score-row">
          <div className="bb-team-side left">
            <TeamJersey team={match?.team1} size={28} />
            <span className="bb-team-name">{team1}</span>
          </div>

          <div className="bb-score-display">
            <span>{score1}</span>
            <span className="bb-score-colon">:</span>
            <span>{score2}</span>
          </div>

          <div className="bb-team-side right">
            <span className="bb-team-name">{team2}</span>
            <TeamJersey team={match?.team2} size={28} />
          </div>
        </div>

        <div className="bb-timeline-section">
          <div className="bb-timeline-teams-col">
            <span>{team1Short}</span>
            <span>{team2Short}</span>
          </div>

          <div className="bb-timeline-bar-wrap">
            <div className="bb-timeline-axis">
              {[0, 10, 20, 30, 40].map((m) => (
                <span key={m} className="bb-axis-label" style={{ left: `${(m / 40) * 100}%` }}>
                  <span className="bb-tick-line" />
                  {m}
                </span>
              ))}
            </div>
            <div className="bb-timeline-track">
              <div className="bb-timeline-fill" style={{ width: `${progressPct}%` }} />
              <div className="bb-timeline-dot" style={{ left: `${progressPct}%` }} />
            </div>
          </div>

          <div className="bb-timeline-side-stats">
            <span className="bb-chart-icon">📊</span>
            <span className="bb-format-tag">4x10 min</span>
            <span className="bb-period-score-box">0:0</span>
          </div>
        </div>

        <div className="bb-widget-tabs" role="tablist">
          <button
            type="button"
            className={`bb-tab ${activeTab === 'court' ? 'active' : ''}`}
            onClick={() => setActiveTab('court')}
            title="Court View"
          >
            <BasketballCourtIcon />
          </button>
          <button
            type="button"
            className={`bb-tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
            title="Statistics"
          >
            <HiOutlineChartBar />
          </button>
          <button
            type="button"
            className={`bb-tab ${activeTab === 'lineups' ? 'active' : ''}`}
            onClick={() => setActiveTab('lineups')}
            title="Lineups"
          >
            <HiOutlineUsers />
          </button>
          <button
            type="button"
            className={`bb-tab ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
            title="Audio / Commentary"
          >
            <MicrophoneIcon />
          </button>
        </div>

        {activeTab === 'court' && (
          <div className="bb-court-view">
            <div className="bb-court-container">
              <svg className="bb-court-svg" viewBox="0 0 500 300" preserveAspectRatio="none">
                <rect width="500" height="300" fill="url(#wood-floor-grad)" rx="12" />
                <rect x="15" y="15" width="470" height="270" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.85" />

                <line x1="250" y1="15" x2="250" y2="285" stroke="#ffffff" strokeWidth="2" opacity="0.85" />
                <circle cx="250" cy="150" r="45" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.85" />

                <rect x="15" y="105" width="90" height="90" fill="#c25e38" opacity="0.85" stroke="#ffffff" strokeWidth="2" />
                <path d="M 105 105 A 45 45 0 0 1 105 195" fill="none" stroke="#ffffff" strokeWidth="2" />
                <path d="M 15 40 A 130 130 0 0 1 15 260" fill="none" stroke="#ffffff" strokeWidth="2" />
                <circle cx="35" cy="150" r="12" fill="none" stroke="#ef4444" strokeWidth="3" />

                <rect x="395" y="105" width="90" height="90" fill="#c25e38" opacity="0.85" stroke="#ffffff" strokeWidth="2" />
                <path d="M 395 105 A 45 45 0 0 1 395 195" fill="none" stroke="#ffffff" strokeWidth="2" />
                <path d="M 485 40 A 130 130 0 0 2 485 260" fill="none" stroke="#ffffff" strokeWidth="2" />
                <circle cx="465" cy="150" r="12" fill="none" stroke="#ef4444" strokeWidth="3" />

                <defs>
                  <linearGradient id="wood-floor-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#d4a373" />
                    <stop offset="50%" stopColor="#e5b887" />
                    <stop offset="100%" stopColor="#cfa06e" />
                  </linearGradient>
                </defs>
              </svg>

              <div className="bb-court-top-badge">
                {quarter} | {clock}
              </div>

              <div className="bb-event-card">
                <div className="bb-event-score-pill">
                  <span className="team1-score-bg">{score1}</span>
                  <span className="score-sep">:</span>
                  <span className="team2-score-bg">{score2}</span>
                </div>

                <div className="bb-event-banner" style={{ background: lastEvent.color || '#eab308' }}>
                  {lastEvent.teamName || team2}
                </div>

                <div className="bb-event-details-box">
                  <strong className="bb-event-action">{lastEvent.action || '3 pt scored'}</strong>
                  <span className="bb-event-sub">{lastEvent.detail || '2/9 (22.2%) 3 Point Shots'}</span>
                  <div className="bb-event-jersey-wrap">
                    <TeamJersey team={match?.team2} size={38} />
                  </div>
                </div>
              </div>

              {isTeam1Possession && (
                <div className="bb-possession-zone left">
                  <div className="bb-possession-text">
                    <strong>{team1}</strong>
                    <span>Possession</span>
                  </div>
                  <div className="bb-possession-line" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatHeaderScore(runs, wickets, { missing = false } = {}) {
  if (missing) return '—';
  if (wickets === 10 || String(runs).includes('All')) return `${runs} All Out`;
  return `${runs}/${wickets}`;
}

export default function LiveMatchGraphicWidget({ match: rawMatch }) {
  const match = useMatchDetail(rawMatch);

  useEffect(() => {
    if (match?.id) {
      centralizedMatchEngine.updateMatchState(match.id, match);
    }
  }, [match]);

  const matchStateObj = useCentralizedMatchState(match);

  const [activeWidgetTab, setActiveWidgetTab] = useState('field');
  const [selectedInnings, setSelectedInnings] = useState('');
  const [scorecardInnings, setScorecardInnings] = useState('');
  const [expandedStatsInnings, setExpandedStatsInnings] = useState('team1');

  useEffect(() => {
    setSelectedInnings('');
    setScorecardInnings('');
  }, [match?.id]);

  const sport = String(match?.sport || 'cricket').toLowerCase();
  const team1 = match?.team1?.name || 'Team 1';
  const team2 = match?.team2?.name || 'Team 2';
  const team1Short = getTeamShort(team1, match?.team1?.shortName);
  const team2Short = getTeamShort(team2, match?.team2?.shortName);
  const team1Display = getTeamDisplayName(team1);
  const team2Display = getTeamDisplayName(team2);

  const canonicalSnapshot = useMemo(
    () => buildCanonicalMatchSnapshot(match),
    [match],
  );

  const selectedInningsView = useMemo(
    () => deriveSelectedInningsView(canonicalSnapshot, selectedInnings),
    [canonicalSnapshot, selectedInnings],
  );

  const resolvedScores = useMemo(
    () => resolveCricketTeamScores(match, match?.liveDetails || {}),
    [match],
  );

  const matchState = getMatchState(match);
  const isCricketSport = sport === 'cricket' || sport === 'virtual-cricket';
  const showCricketTracker = isCricketSport && isCricketTrackerLive(match);

  const innings = match
    ? getInningsInfo(match, team1, team2, resolvedScores)
    : null;

  const overs = selectedInningsView?.overs
    || innings?.displayOvers
    || matchStateObj?.currentInnings?.overs
    || match?.liveDetails?.chaseOvers
    || match?.liveDetails?.overs
    || '0.0';

  useEffect(() => {
    setExpandedStatsInnings(innings?.inningsNum === 2 ? 'team2' : 'team1');
  }, [match?.id, innings?.inningsNum]);

  const activeInnings = selectedInnings || selectedInningsView?.selectedInningsName || innings?.defaultInnings || '';

  const squads = useMemo(
    () => resolveMatchSquads(match, team1, team2),
    [match, team1, team2],
  );

  const t1Data = useMemo(() => squadToRoster(squads.team1, squads.team2), [squads]);
  const t2Data = useMemo(() => squadToRoster(squads.team2, squads.team1), [squads]);

  const fieldState = useLiveFieldState(showCricketTracker ? match : null);

  const isTeam1Batting = selectedInningsView
    ? teamNameMatches(team1, selectedInningsView.battingTeamName)
    : (matchStateObj?.currentInnings?.batTeam
      ? teamNameMatches(team1, matchStateObj.currentInnings.batTeam)
      : (innings ? teamNameMatches(team1, innings.battingTeam) : true));

  const currentRuns = selectedInningsView?.score ?? (matchStateObj?.currentInnings?.runs ?? parseInt(innings?.displayScore1 ?? resolvedScores.team1?.runs ?? 0, 10));
  const currentWickets = selectedInningsView?.wickets ?? (matchStateObj?.currentInnings?.wickets ?? parseInt(innings?.displayWickets1 ?? resolvedScores.team1?.wickets ?? 0, 10));
  const currentOvers = (!isEmptyOversValue(selectedInningsView?.overs) ? selectedInningsView.overs : null)
    || (!isEmptyOversValue(matchStateObj?.currentInnings?.overs) ? matchStateObj.currentInnings.overs : null)
    || (!isEmptyOversValue(innings?.displayOvers) ? innings.displayOvers : null)
    || (!isEmptyOversValue(overs) ? overs : null)
    || '0.0';
  const currentBatTeamName = selectedInningsView?.battingTeamName || (isTeam1Batting ? team1 : team2);
  const currentBowlTeamName = selectedInningsView?.bowlingTeamName || (isTeam1Batting ? team2 : team1);

  // Derived Batters strictly from selected innings view or live details
  const b1 = selectedInningsView?.striker
    || selectedInningsView?.batters?.[0]
    || (match?.liveDetails?.batter1?.name && !isPlaceholderPlayerName(match.liveDetails.batter1.name) ? match.liveDetails.batter1 : null)
    || { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 };

  const b2 = selectedInningsView?.nonStriker
    || selectedInningsView?.batters?.[1]
    || (match?.liveDetails?.batter2?.name && !isPlaceholderPlayerName(match.liveDetails.batter2.name) ? match.liveDetails.batter2 : null)
    || { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 };

  // Derived Bowler strictly from selected innings view or live details
  let bowler = selectedInningsView?.currentBowler?.name
    || (match?.liveDetails?.bowler?.name && !isPlaceholderPlayerName(match.liveDetails.bowler.name) ? match.liveDetails.bowler.name : '')
    || fieldState?.bowler
    || selectedInningsView?.bowlers?.[selectedInningsView.bowlers.length - 1]?.name
    || '';
  if (typeof bowler === 'object' && bowler?.name) bowler = bowler.name;
  bowler = displayPlayerName(bowler) || bowler;

  const chaseText = (() => {
    const required = matchStateObj?.chaseState?.requiredRuns;
    const target = matchStateObj?.chaseState?.target;
    const batTeam = matchStateObj?.currentInnings?.batTeam;
    const t1Runs = Number(resolvedScores.team1?.runs) || 0;
    const t2Runs = Number(resolvedScores.team2?.runs) || 0;
    const missingFirstInnings = (t1Runs === 0 && t2Runs > 0) || (t2Runs === 0 && t1Runs > 0);
    if (target && required != null && Number(required) <= 0 && Number(target) > 1 && !missingFirstInnings) {
      return `${batTeam || team2} won`;
    }
    if (target && required > 0) {
      return `${batTeam || 'Team'} need ${required} runs to win`;
    }
    if (isTestMatch(match) && matchStateObj?.leadTrailState?.lead) {
      return `${matchStateObj.leadTrailState.leadingTeam} lead by ${matchStateObj.leadTrailState.lead} runs`;
    }
    return innings ? getChaseText(match, innings, team1, team2) : null;
  })();

  const wicketOvers = useMemo(() => getWicketOvers(match), [match]);

  const overHistoryRows = useMemo(
    () => buildOverHistoryRows(fieldState, match?.id, match),
    [fieldState, match],
  );

  const activeScorecardTab = scorecardInnings
    || selectedInningsView?.selectedInningsName
    || (innings?.inningsNum === 2 ? `${team2Short} 1ST` : `${team1Short} 1ST`);

  const scorecardPlayers = useMemo(() => {
    if (selectedInningsView?.batters?.length) {
      return selectedInningsView.batters.map((b) => ({
        ...b,
        statusLabel: b.dismissal || (b.notOut ? 'NOT OUT' : 'out'),
      }));
    }
    const isTeam2Tab = activeScorecardTab.includes(team2Short);
    const roster = isTeam2Tab ? t2Data : t1Data;
    const teamLabel = isTeam2Tab ? team2 : team1;
    const shortLabel = isTeam2Tab ? team2Short : team1Short;
    const battingTeam = innings?.battingTeam || team1;
    const isBatting = teamNameMatches(teamLabel, battingTeam)
      || (isTeam2Tab
        ? teamNameMatches(team2, battingTeam)
        : teamNameMatches(team1, battingTeam));
    return buildScorecardInnings(match, teamLabel, roster, isBatting ? fieldState : null, isBatting, shortLabel);
  }, [selectedInningsView, activeScorecardTab, match, team1, team2, t1Data, t2Data, fieldState, innings, team1Short, team2Short]);

  const statsOvers = useMemo(
    () => buildStatsOvers(fieldState, match),
    [fieldState, match],
  );

  const commentaryItems = useMemo(() => {
    if (match?.liveDetails?.commentaryFeed?.length) {
      return match.liveDetails.commentaryFeed.map((item) => {
        let kind = 'run';
        const tag = item.tag || '•';
        if (tag === 'W') kind = 'wicket';
        else if (tag === '4' || tag === '6') kind = 'boundary';
        else if (tag === '0' || tag === '•') kind = 'dot';
        else if (tag === 'WD' || tag === 'NB') kind = 'extra';

        return {
          over: item.over || '',
          tag,
          kind,
          text: item.text || item.commText || '',
        };
      });
    }

    if (match?.liveDetails?.commentaryList?.length) {
      return match.liveDetails.commentaryList;
    }

    const items = [];
    const ld = match?.liveDetails || {};
    const liveCommText = ld.commentary || match?.time;

    if (liveCommText) {
      items.push({
        over: normalizeMatchOvers(ld.overs || overs, match),
        tag: 'LIVE',
        kind: 'run',
        text: liveCommText,
      });
    }

    const currentBalls = ld.currentOverBalls || fieldState?.currentOverBalls || [];
    const oversNum = parseInt(String(ld.overs || overs || '0').split('.')[0], 10) || 0;

    if (currentBalls.length > 0) {
      currentBalls.slice().reverse().forEach((b, idx) => {
        const ballIndex = currentBalls.length - idx;
        const overLabel = `${oversNum}.${ballIndex}`;
        const outcome = String(b).toUpperCase();
        let tag = outcome;
        let kind = 'run';
        let text = `${b} run${b === '1' ? '' : 's'}. ${b1.name || 'Striker'} facing ${bowler || 'Bowler'}.`;

        if (outcome === 'W' || outcome === 'WKT') {
          kind = 'wicket';
          tag = 'W';
          text = `OUT! WICKET! ${bowler || 'Bowler'} dismisses ${b1.name || 'Batter'}! Clean breakthrough.`;
        } else if (outcome === '4' || outcome === '4B') {
          kind = 'boundary';
          tag = '4';
          text = `FOUR! ${b1.name || 'Batter'} smashes ${bowler || 'Bowler'} through the outfield for 4 runs!`;
        } else if (outcome === '6' || outcome === '6B') {
          kind = 'boundary';
          tag = '6';
          text = `SIX! MASSIVE HIT! ${b1.name || 'Batter'} clears the boundary rope off ${bowler || 'Bowler'}!`;
        } else if (outcome === '0' || outcome === '•') {
          kind = 'dot';
          tag = '0';
          text = `0 runs. Good length delivery from ${bowler || 'Bowler'}, ${b1.name || 'Batter'} defends back.`;
        } else if (outcome.includes('WD')) {
          kind = 'extra';
          tag = 'WD';
          text = `Wide ball bowled by ${bowler || 'Bowler'}. Extra run added.`;
        } else if (outcome.includes('NB')) {
          kind = 'extra';
          tag = 'NB';
          text = `No ball! Free hit coming up for ${b1.name || 'Batter'} against ${bowler || 'Bowler'}.`;
        }

        items.push({ over: overLabel, tag, kind, text });
      });
    } else {
      const currOv = Math.max(1, oversNum || 1);
      items.push(
        { over: `${currOv}.4`, tag: '4', kind: 'boundary', text: `FOUR! ${b1.name || 'Batter'} smashes ${bowler || 'Bowler'} through extra cover for 4 runs!` },
        { over: `${currOv}.3`, tag: '1', kind: 'run', text: `1 run. Pushed down to long-on by ${b1.name || 'Batter'}.` },
        { over: `${currOv}.2`, tag: '6', kind: 'boundary', text: `SIX! ${b2.name || 'Non-striker'} pulls ${bowler || 'Bowler'} over deep midwicket into the stands!` },
        { over: `${currOv}.1`, tag: '0', kind: 'dot', text: `0 runs. Defended back to ${bowler || 'Bowler'}.` },
      );
    }

    return items;
  }, [match, match?.liveDetails?.commentaryFeed, match?.liveDetails?.commentaryList, match?.liveDetails?.commentary, fieldState, overs, b1.name, b2.name, bowler]);

  const pointsTableData = useMemo(() => {
    if (Array.isArray(match?.liveDetails?.pointsTable) && match.liveDetails.pointsTable.length > 0) {
      return match.liveDetails.pointsTable;
    }
    return [];
  }, [match]);

  const inningsFours = selectedInningsView?.fours != null
    ? selectedInningsView.fours
    : (match?.liveDetails?.fours != null ? Number(match.liveDetails.fours) : null);

  const inningsSixes = selectedInningsView?.sixes != null
    ? selectedInningsView.sixes
    : (match?.liveDetails?.sixes != null ? Number(match.liveDetails.sixes) : null);

  const inningsExtrasTotal = (() => {
    if (selectedInningsView?.extras?.total != null) return Number(selectedInningsView.extras.total);
    const raw = match?.liveDetails?.extras;
    if (raw == null) return null;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'object' && raw.total != null) return Number(raw.total);
    if (typeof raw === 'object') {
      const sum = ['byes', 'legByes', 'wides', 'noBalls', 'penalty', 'penaltyRuns']
        .reduce((s, k) => s + (Number(raw[k]) || 0), 0);
      return sum || null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  })();

  const extrasBreakdownText = useMemo(() => {
    const ex = selectedInningsView?.extras;
    if (!ex || typeof ex !== 'object') return '';
    const parts = [];
    if (ex.wides != null && ex.wides > 0) parts.push(`wd ${ex.wides}`);
    if (ex.noBalls != null && ex.noBalls > 0) parts.push(`nb ${ex.noBalls}`);
    if (ex.byes != null && ex.byes > 0) parts.push(`b ${ex.byes}`);
    if (ex.legByes != null && ex.legByes > 0) parts.push(`lb ${ex.legByes}`);
    if (ex.penaltyRuns != null && ex.penaltyRuns > 0) parts.push(`pen ${ex.penaltyRuns}`);
    return parts.length > 0 ? `(${parts.join(', ')})` : '';
  }, [selectedInningsView?.extras]);

  const maxOvers = getMatchMaxOvers(match);
  const displayOversNormalized = normalizeMatchOvers(innings?.displayOvers || overs, match);
  const isUnlimitedOvers = maxOvers == null;
  const timelineOvers = maxOvers ?? Math.max(20, parseInt(String(displayOversNormalized).split('.')[0], 10) + 5);
  const timelineTicks = useMemo(() => {
    const max = Math.max(1, Number(timelineOvers) || 1);
    let step = max <= 10 ? 1 : max <= 20 ? 2 : max <= 50 ? 10 : 20;
    while (Math.floor(max / step) > 6 && step < max) {
      step += max <= 50 ? 5 : 10;
    }
    const ticks = [];
    for (let i = 0; i <= max; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return ticks;
  }, [timelineOvers]);
  const isMatchFinished = matchState === 'post'
    || match?.isCompleted
    || match?.liveStatus === 'COMPLETED'
    || isCricketMatchCompleted(match);
  const formatBanner = canonicalSnapshot?.match?.formatBanner || getCricketFormatBanner(match);
  const statusChip = canonicalSnapshot?.match?.isLive ? 'LIVE' : (isMatchFinished ? 'COMPLETED' : 'UPCOMING');

  const inningsBadge = isMatchFinished
    ? 'MATCH COMPLETE'
    : (innings
      ? (isUnlimitedOvers
        ? `INN ${innings.inningsNum} | ${displayOversNormalized} OV`
        : `INN ${innings.inningsNum} | ${displayOversNormalized}/${maxOvers} OV`)
      : '');

  useEffect(() => {
    if (isMatchFinished && (match?.scorecardInnings?.length || 0) > 0) {
      setActiveWidgetTab('scorecard');
    }
  }, [isMatchFinished, match?.id, match?.scorecardInnings?.length]);

  if (!match) {
    return (
      <div className="live-graphic-card-10cric live-graphic-empty">
        <p>Select a match to view live tracker</p>
      </div>
    );
  }

  if (sport === 'basketball' || sport === 'nba' || sport === 'nbl') {
    return <BasketballLiveGraphicWidget match={match} />;
  }

  if (sport !== 'cricket' && sport !== 'virtual-cricket') {
    return (
      <SportLivePanel
        match={match}
        team1={team1}
        team2={team2}
        team1Display={team1Display}
        team2Display={team2Display}
        matchState={matchState}
      />
    );
  }

  if (!showCricketTracker && !isMatchFinished) {
    return (
      <PreMatchCricketPanel
        match={match}
        team1Display={team1Display}
        team2Display={team2Display}
        matchState={matchState}
      />
    );
  }

  return (
    <div className="live-graphic-card-10cric">
      <div className="live-widget-static-header">
        <div className="live-widget-body">
          <div className="live-widget-format-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span className="cricket-format-badge">{formatBanner}</span>
            <span className={`cricket-status-chip ${canonicalSnapshot?.match?.isLive ? 'chip-live' : (isMatchFinished ? 'chip-completed' : 'chip-upcoming')}`}>
              {canonicalSnapshot?.match?.isLive ? '● LIVE' : statusChip}
            </span>
            {inningsBadge && <span className="cricket-inn-badge">{inningsBadge}</span>}
            <MatchCountdownTimer match={match} style={{ fontSize: '0.78rem', padding: '2px 10px' }} />
          </div>

          <div className="live-widget-teams-row">
            <div className="live-widget-team-cell">
              <TeamJersey team={match?.team1 || team1} size={42} isFlying={!isMatchFinished && isTeam1Batting} />
              <span className="live-widget-team" title={team1Display}>{team1Short}</span>
            </div>
            <span className="live-widget-scoreline">
              {canonicalSnapshot?.headerScores ? (
                <>
                  <span title={canonicalSnapshot.headerScores.team1ScoreText} className={!canonicalSnapshot.headerScores.team1HasBatted ? 'score-yet-to-bat' : ''}>
                    {canonicalSnapshot.headerScores.team1HasBatted
                      ? (innings ? formatHeaderScore(innings.displayScore1, innings.displayWickets1) : '—')
                      : '—'}
                  </span>
                  <span className="live-widget-score-sep">:</span>
                  <span title={canonicalSnapshot.headerScores.team2ScoreText} className={!canonicalSnapshot.headerScores.team2HasBatted ? 'score-yet-to-bat' : ''}>
                    {canonicalSnapshot.headerScores.team2HasBatted
                      ? (innings ? formatHeaderScore(innings.displayScore2, innings.displayWickets2) : '—')
                      : '—'}
                  </span>
                </>
              ) : (
                '–'
              )}
            </span>
            <div className="live-widget-team-cell">
              <TeamJersey team={match?.team2 || team2} size={42} isFlying={!isMatchFinished && !isTeam1Batting} />
              <span className="live-widget-team" title={team2Display}>{team2Short}</span>
            </div>
          </div>

          {chaseText && (
            <p className="live-widget-chase-text">{chaseText}</p>
          )}

          {(() => {
            const tossText = resolveCricketTossText(match, matchStateObj);
            if (!tossText) return null;
            return (
              <p className="live-widget-chase-text" style={{ marginTop: '4px', opacity: 0.9 }}>
                🪙 {tossText}
              </p>
            );
          })()}

          {(() => {
            const showInningsSelect = isTestMatch(match) || (canonicalSnapshot?.innings?.length || 0) > 2;
            if (!showInningsSelect) return null;
            return (
          <div className="live-widget-innings-select-wrap">
            <select
              key={match?.id}
              className="live-widget-innings-select"
              value={activeInnings}
              onChange={(e) => {
                setSelectedInnings(e.target.value);
                setScorecardInnings(e.target.value);
              }}
            >
              {canonicalSnapshot?.innings?.length > 0 ? (
                canonicalSnapshot.innings.map((inn) => (
                  <option key={`${match?.id}-${inn.inningsId}`} value={inn.inningsName}>
                    {inn.inningsLabel || inn.inningsName} ({inn.score}/{inn.wickets}{inn.overs ? ` · ${inn.overs} ov` : ''})
                  </option>
                ))
              ) : (
                <>
                  <option value={`${team1Display} INNS`}>{team1Display} INNS</option>
                  <option value={`${team2Display} INNS`}>{team2Display} INNS</option>
                </>
              )}
            </select>
          </div>
            );
          })()}

          <div className="live-widget-timeline" aria-hidden="true">
            <div className="live-widget-timeline-track">
              {timelineTicks.map((val) => {
                const atStart = val === 0;
                const atEnd = val === timelineOvers;
                return (
                  <span
                    key={val}
                    className="live-widget-timeline-axis-label"
                    style={{
                      left: `${(val / timelineOvers) * 100}%`,
                      transform: atStart ? 'none' : atEnd ? 'translateX(-100%)' : 'translateX(-50%)',
                    }}
                  >
                    {val}
                  </span>
                );
              })}
              {Array.from(wicketOvers).map((wktOver) => {
                const leftPct = Math.min(96, Math.max(4, (wktOver / timelineOvers) * 100));
                return (
                  <div key={wktOver} className="live-widget-wicket-marker" style={{ left: `${leftPct}%` }}>
                    <span className="live-widget-wicket-badge">W</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="live-widget-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'field'}
              onClick={() => setActiveWidgetTab('field')}
              className={`live-widget-tab ${activeWidgetTab === 'field' ? 'active' : ''}`}
            >
              <LiveWidgetTabIcon Icon={TargetIcon} active={activeWidgetTab === 'field'} />
              Tracker
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'scorecard'}
              onClick={() => setActiveWidgetTab('scorecard')}
              className={`live-widget-tab ${activeWidgetTab === 'scorecard' ? 'active' : ''}`}
            >
              <LiveWidgetTabIcon Icon={LayoutListIcon} active={activeWidgetTab === 'scorecard'} />
              Scorecard
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'commentary'}
              onClick={() => setActiveWidgetTab('commentary')}
              className={`live-widget-tab ${activeWidgetTab === 'commentary' ? 'active' : ''}`}
            >
              <LiveWidgetTabIcon Icon={MessageCircleIcon} active={activeWidgetTab === 'commentary'} />
              Commentary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'charts'}
              onClick={() => setActiveWidgetTab('charts')}
              className={`live-widget-tab ${activeWidgetTab === 'charts' ? 'active' : ''}`}
            >
              <LiveWidgetTabIcon Icon={ChartBarIcon} active={activeWidgetTab === 'charts'} />
              Live Charts
            </button>
          </div>
        </div>
      </div>

      <div className="live-widget-scrollable-body">
        {activeWidgetTab === 'charts' && (
          <div className="cric-panel p-2">
            <LiveChartsWidget match={match} />
          </div>
        )}
        {activeWidgetTab === 'field' && (
          <div className="cric-panel cric-panel--dark">
            <OverHistoryBar rows={overHistoryRows} inningsNum={innings?.inningsNum} />

            <div className="cric-field-scorecard">
              <div className="cric-field-table">
                <div className="cric-field-table__head">
                  <span>BATTER</span>
                  <span>R</span>
                  <span>B</span>
                  <span>4S</span>
                  <span>6S</span>
                </div>

                {(!b1.name && !b2.name) ? (
                  <div className="cric-field-table__row cric-field-table__row--empty">
                    <span className="cric-field-table__name">
                      No batters yet
                    </span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                  </div>
                ) : (
                  <>
                    {b1.name ? (
                      <div className={`cric-field-table__row ${fieldState?.strikerIdx === 0 ? 'striker' : ''}`}>
                        <span className="cric-field-table__name">
                          {displayPlayerName(b1.name) || b1.name}
                          {fieldState?.strikerIdx === 0 && <span className="cric-bat-icon" aria-label="on strike">🏏</span>}
                        </span>
                        <span>{b1.runs ?? 0}</span>
                        <span>{b1.balls ?? 0}</span>
                        <span>{b1.fours ?? 0}</span>
                        <span>{b1.sixes ?? 0}</span>
                      </div>
                    ) : null}

                    {b2.name ? (
                      <div className={`cric-field-table__row ${fieldState?.strikerIdx === 1 ? 'striker' : ''}`}>
                        <span className="cric-field-table__name">
                          {displayPlayerName(b2.name) || b2.name}
                          {fieldState?.strikerIdx === 1 && <span className="cric-bat-icon" aria-label="on strike">🏏</span>}
                        </span>
                        <span>{b2.runs ?? 0}</span>
                        <span>{b2.balls ?? 0}</span>
                        <span>{b2.fours ?? 0}</span>
                        <span>{b2.sixes ?? 0}</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="cric-field-footer">
                <div className="cric-field-bowler">
                  <span className="cric-field-bowler__label">CURRENT BOWLER</span>
                  <span className="cric-field-bowler__name">
                    {bowler ? (
                      <>
                        {displayPlayerName(bowler) || bowler}
                        <span className="cric-ball-icon" aria-hidden="true">⚾</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                        Current bowler unavailable
                      </span>
                    )}
                  </span>
                  {match?.liveDetails?.bowler && (match.liveDetails.bowler.overs != null || match.liveDetails.bowler.wickets != null) && (
                    <span className="cric-field-bowler__figures">
                      {match.liveDetails.bowler.overs ?? '—'}-{match.liveDetails.bowler.maidens ?? 0}-{match.liveDetails.bowler.runs ?? 0}-{match.liveDetails.bowler.wickets ?? 0}
                    </span>
                  )}
                </div>
                <div className="cric-field-stats-col">
                  <span className="cric-field-stats__label">INNINGS STATS</span>
                  <div className="cric-field-extras">
                    <div>
                      <span>Fours</span>
                      <strong>{inningsFours != null ? inningsFours : '—'}</strong>
                    </div>
                    <div>
                      <span>Sixes</span>
                      <strong>{inningsSixes != null ? inningsSixes : '—'}</strong>
                    </div>
                    <div>
                      <span>Extras</span>
                      <strong>
                        {inningsExtrasTotal != null ? inningsExtrasTotal : '—'}
                        {extrasBreakdownText && (
                          <span className="extras-breakdown-sub" style={{ fontSize: '0.72rem', opacity: 0.8, marginLeft: '4px' }}>
                            {extrasBreakdownText}
                          </span>
                        )}
                      </strong>
                    </div>
                    {match?.liveDetails?.partnership && (
                      <div>
                        <span>P'ship</span>
                        <strong>
                          {match.liveDetails.partnership.runs ?? 0}
                          {match.liveDetails.partnership.balls != null
                            ? ` (${match.liveDetails.partnership.balls})`
                            : ''}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeWidgetTab === 'scorecard' && (
          <div className="cric-panel cric-panel--light">
            <h4 className="cric-panel__title">SCORECARD</h4>

            <div className="cric-innings-tabs">
              {canonicalSnapshot?.innings?.length > 0 ? (
                canonicalSnapshot.innings.map((inn) => (
                  <button
                    key={inn.inningsId}
                    type="button"
                    className={`cric-innings-tab ${activeScorecardTab === inn.inningsName || activeScorecardTab === `${inn.battingTeamShort} 1ST` ? 'active' : ''}`}
                    onClick={() => {
                      setScorecardInnings(inn.inningsName);
                      setSelectedInnings(inn.inningsName);
                    }}
                  >
                    {inn.battingTeamShort} {inn.inningsId > 2 ? '2ND' : '1ST'}
                  </button>
                ))
              ) : (
                <>
                  <button
                    type="button"
                    className={`cric-innings-tab ${activeScorecardTab === `${team1Short} 1ST` ? 'active' : ''}`}
                    onClick={() => setScorecardInnings(`${team1Short} 1ST`)}
                  >
                    {team1Short} 1ST
                  </button>
                  <button
                    type="button"
                    className={`cric-innings-tab ${activeScorecardTab === `${team2Short} 1ST` ? 'active' : ''}`}
                    onClick={() => setScorecardInnings(`${team2Short} 1ST`)}
                  >
                    {team2Short} 1ST
                  </button>
                </>
              )}
            </div>

            <div className="cric-scorecard-table">
              <div className="cric-scorecard-table__head">
                <span>BATTER</span>
                <span>R</span>
                <span>B</span>
                <span>S/R</span>
              </div>
              {scorecardPlayers.length === 0 && (
                <p className="cric-lineup-empty">Scorecard loads from API when available.</p>
              )}
              {scorecardPlayers.map((player, idx) => (
                <div key={`${player.name}-${idx}`} className="cric-scorecard-table__row">
                  <div className="cric-scorecard-table__batter">
                    <strong>{player.name}</strong>
                    <span className={player.notOut ? (player.statusLabel === 'batting' ? 'cric-batting' : 'cric-not-out') : 'cric-dismissal'}>
                      {player.statusLabel || (player.notOut ? 'NOT OUT' : player.dismissal)}
                    </span>
                  </div>
                  <span>{player.runs}</span>
                  <span>{player.balls}</span>
                  <span>{player.sr}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeWidgetTab === 'stats' && (
          <div className="cric-panel cric-panel--light">
            <h4 className="cric-panel__title">STATISTICS</h4>

            <div className="cric-stats-innings">
              <button
                type="button"
                className={`cric-stats-innings__row ${expandedStatsInnings === 'team1' ? 'expanded' : ''}`}
                onClick={() => setExpandedStatsInnings(expandedStatsInnings === 'team1' ? '' : 'team1')}
              >
                <span>{team1Display} 1st INNS</span>
                <span className="cric-stats-innings__score">
                  {resolvedScores.team1.runs}/{resolvedScores.team1.wickets} ({formatInningsOversLabel(resolvedScores.team1.overs, match)} ov)
                </span>
                <span className="cric-stats-innings__arrow">{expandedStatsInnings === 'team1' ? '▲' : '▼'}</span>
              </button>

              <button
                type="button"
                className={`cric-stats-innings__row ${expandedStatsInnings === 'team2' ? 'expanded' : ''}`}
                onClick={() => setExpandedStatsInnings(expandedStatsInnings === 'team2' ? '' : 'team2')}
              >
                <span>{team2Display} 1st INNS</span>
                <span className="cric-stats-innings__score">
                  {resolvedScores.team2.runs}/{resolvedScores.team2.wickets} ({formatInningsOversLabel(resolvedScores.team2.overs, match)} ov)
                </span>
                <span className="cric-stats-innings__arrow">{expandedStatsInnings === 'team2' ? '▲' : '▼'}</span>
              </button>
            </div>

            {expandedStatsInnings === 'team1' && innings?.inningsNum === 1 && (
              <div className="cric-stats-overs">
                {statsOvers.map((row) => (
                  <div key={row.overNum} className="cric-stats-over-row">
                    <span className="cric-stats-over-row__num">{row.overNum}</span>
                    <span className="cric-stats-over-row__summary">{row.summary}</span>
                    <div className="cric-stats-over-row__balls">
                      {row.balls.map((ball, idx) => (
                        <BallDot key={`${row.overNum}-${idx}`} ball={ball} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {expandedStatsInnings === 'team2' && innings?.inningsNum === 2 && (
              <div className="cric-stats-overs">
                {statsOvers.map((row) => (
                  <div key={row.overNum} className="cric-stats-over-row">
                    <span className="cric-stats-over-row__num">{row.overNum}</span>
                    <span className="cric-stats-over-row__summary">{row.summary}</span>
                    <div className="cric-stats-over-row__balls">
                      {row.balls.map((ball, idx) => (
                        <BallDot key={`${row.overNum}-${idx}`} ball={ball} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {expandedStatsInnings === 'team1' && innings?.inningsNum !== 1 && (
              <p className="cric-stats-empty">Over-by-over stats appear when {team1Display} are batting.</p>
            )}

            {expandedStatsInnings === 'team2' && innings?.inningsNum !== 2 && (
              <p className="cric-stats-empty">Over-by-over stats appear when {team2Display} are batting.</p>
            )}
          </div>
        )}

        {activeWidgetTab === 'commentary' && (
          <div className="cric-panel cric-panel--light">
            <h4 className="cric-panel__title">LIVE COMMENTARY</h4>
            <div className="cric-commentary-feed">
              {commentaryItems.map((item, idx) => (
                <div key={idx} className="cric-commentary-item">
                  <div className="cric-commentary-left">
                    <span className="cric-commentary-over">{item.over}</span>
                    <span className={`cric-ball cric-ball--${item.kind || 'run'} cric-ball--sm`}>
                      {item.tag || '•'}
                    </span>
                  </div>
                  <div className="cric-commentary-text">
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeWidgetTab === 'table' && (
          <div className="cric-panel cric-panel--light">
            <h4 className="cric-panel__title">{match?.league || 'League'} Points Table</h4>
            <div className="cric-points-table-wrap">
              <table className="cric-points-table">
                <thead>
                  <tr>
                    <th>POS</th>
                    <th>TEAM</th>
                    <th>P</th>
                    <th>W</th>
                    <th>L</th>
                    <th>NRR</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {pointsTableData.length === 0 ? (
                    <tr>
                      <td colSpan={7}>Points table not available from live sources yet.</td>
                    </tr>
                  ) : pointsTableData.map((row) => (
                    <tr key={row.pos} className={row.isTarget ? 'cric-table-row--highlight' : ''}>
                      <td className="cric-pos-col">{row.pos}</td>
                      <td className="cric-team-col"><strong>{row.team}</strong></td>
                      <td>{row.p}</td>
                      <td>{row.w}</td>
                      <td>{row.l}</td>
                      <td>{row.nrr}</td>
                      <td className="cric-pts-col"><strong>{row.pts}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeWidgetTab === 'lineups' && (
          <div className="cric-panel cric-panel--light">
            <h4 className="cric-panel__title">{squads.team1?.name || team1Display}</h4>
            {(squads.team1?.players || []).map((player, idx) => (
              <div key={`t1-${player.id || player.name}-${idx}`} className="cric-lineup-row">
                <span>{player.name}</span>
                <span>{formatPlayerRole(player)}</span>
              </div>
            ))}
            {(!squads.team1?.players?.length) && (
              <p className="cric-lineup-empty">Squad not available yet</p>
            )}

            <h4 className="cric-panel__title">{squads.team2?.name || team2Display}</h4>
            {(squads.team2?.players || []).map((player, idx) => (
              <div key={`t2-${player.id || player.name}-${idx}`} className="cric-lineup-row">
                <span>{player.name}</span>
                <span>{formatPlayerRole(player)}</span>
              </div>
            ))}
            {(!squads.team2?.players?.length) && (
              <p className="cric-lineup-empty">Squad not available yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
