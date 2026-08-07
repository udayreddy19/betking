import { useState, useMemo, useEffect, useRef } from 'react';
import { HiOutlineViewList, HiOutlineChartBar, HiOutlineUsers, FiMessageCircle } from '../../icons';
import TeamJersey from '../TeamJersey/TeamJersey';
import { useLiveFieldState } from '../../hooks/useLiveFieldState';
import { useMatchDetail } from '../../hooks/useMatchDetail';
import { resolveMatchSquads, formatPlayerRole, squadToRoster } from '../../utils/matchSquads';
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
import { isCricketSecondInnings, resolveCricketTeamScores, teamNameMatches } from '../../utils/cricketScores';
import { getMatchMaxOvers, normalizeMatchOvers } from '../../utils/cricketFormat';
import { isPlaceholderPlayerName, displayPlayerName } from '../../utils/cricketPlayers';
import './LiveMatchGraphicWidget.css';

function getTeamShort(name) {
  return getTeamShortCode(name);
}

function getInningsInfo(match, team1, team2, resolved) {
  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  const team1Score = resolved.team1;
  const team2Score = resolved.team2;

  if (isChasing) {
    let battingTeam = team2;
    if (ld.chaseTeamName) {
      if (teamNameMatches(team1, ld.chaseTeamName)) battingTeam = team1;
      else if (teamNameMatches(team2, ld.chaseTeamName)) battingTeam = team2;
    } else if (ld.firstTeamName) {
      // Chasing team is whoever didn't bat first
      battingTeam = teamNameMatches(team1, ld.firstTeamName) ? team2 : team1;
    }

    const battingScore = battingTeam === team1 ? team1Score : team2Score;
    return {
      inningsNum: 2,
      battingTeam,
      battingShort: getTeamShort(battingTeam),
      displayScore1: team1Score.runs,
      displayWickets1: team1Score.wickets,
      displayScore2: team2Score.runs,
      displayWickets2: team2Score.wickets,
      displayOvers: battingScore.overs || ld.chaseOvers || ld.overs || '0.0',
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

  return {
    inningsNum: 1,
    battingTeam,
    battingShort: getTeamShort(battingTeam),
    displayScore1: team1Score.runs,
    displayWickets1: team1Score.wickets,
    displayScore2: team2Score.runs,
    displayWickets2: team2Score.wickets,
    displayOvers: (battingTeam === team2 ? team2Score.overs : team1Score.overs) || ld.firstOvers || ld.overs || '0.0',
    defaultInnings: `${getTeamDisplayName(battingTeam)} INNS`,
  };
}

function BallDot({ ball, size = 'md' }) {
  const kind = getBallDisplayKind(ball);
  const label = getBallDisplayLabel(ball);
  const isCompact = kind === 'wide' || kind === 'legbye' || kind === 'noball';

  return (
    <span
      className={`cric-ball cric-ball--${kind} cric-ball--${size}${isCompact ? ' cric-ball--extra' : ''}`}
      title={ball}
    >
      {label}
    </span>
  );
}

function OverHistoryBar({ rows }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [rows]);

  if (!rows.length) return null;

  return (
    <div className="cric-over-history-wrap">
      <div className="cric-over-history" ref={scrollRef} role="region" aria-label="Ball-by-ball over history">
        {rows.map((row) => (
          <div
            key={row.overNum}
            className={`cric-over-history__block${row.isCurrent ? ' cric-over-history__block--current' : ''}`}
          >
            <span className="cric-over-history__label">OVER {row.overNum}</span>
            <div className="cric-over-history__balls">
              {row.balls.map((ball, idx) => (
                <BallDot key={`${row.overNum}-${idx}`} ball={ball} size="sm" />
              ))}
            </div>
          </div>
        ))}
      </div>
      {rows.length > 2 && (
        <span className="cric-over-history-hint" aria-hidden="true">← scroll →</span>
      )}
    </div>
  );
}

function FieldIcon() {
  return (
    <svg className="cric-tab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
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

  return (
    <div className="live-graphic-card-10cric">
      <div className="live-widget-body live-widget-body--prematch">
        <div className="live-widget-inn-badge live-widget-inn-badge--prematch">
          {matchState === 'post' ? 'MATCH COMPLETE' : 'UPCOMING'}
        </div>

        <div className="live-widget-teams-row">
          <span className="live-widget-team">{team1Display}</span>
          <span className="live-widget-scoreline live-widget-scoreline--vs">VS</span>
          <span className="live-widget-team">{team2Display}</span>
        </div>

        <p className="live-widget-prematch-status">{status}</p>
        <p className="live-widget-prematch-hint">
          {matchState === 'post'
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

function CommentaryIcon() {
  return (
    <svg className="cric-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="14" y2="13" />
    </svg>
  );
}

function PointsTableIcon() {
  return (
    <svg className="cric-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function BasketballLiveGraphicWidget({ match }) {
  const [activeTab, setActiveTab] = useState('court');
  const ld = match?.liveDetails || {};

  const team1 = match?.team1?.name || match?.team1 || 'Team 1';
  const team2 = match?.team2?.name || match?.team2 || 'Team 2';
  const team1Short = getTeamShortCode(team1);
  const team2Short = getTeamShortCode(team2);

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

export default function LiveMatchGraphicWidget({ match: rawMatch }) {
  const match = useMatchDetail(rawMatch);
  const [activeWidgetTab, setActiveWidgetTab] = useState('field');
  const [selectedInnings, setSelectedInnings] = useState('');
  const [scorecardInnings, setScorecardInnings] = useState('');
  const [expandedStatsInnings, setExpandedStatsInnings] = useState('team1');

  const sport = String(match?.sport || 'cricket').toLowerCase();

  if (sport === 'basketball' || sport === 'nba' || sport === 'nbl') {
    return <BasketballLiveGraphicWidget match={match} />;
  }
  const team1 = match?.team1?.name || 'Team 1';
  const team2 = match?.team2?.name || 'Team 2';
  const team1Short = getTeamShort(team1);
  const team2Short = getTeamShort(team2);
  const team1Display = getTeamDisplayName(team1);
  const team2Display = getTeamDisplayName(team2);

  const resolvedScores = useMemo(
    () => resolveCricketTeamScores(match, match?.liveDetails || {}),
    [match],
  );

  const overs = resolvedScores.team1.overs || match?.liveDetails?.overs || '0.0';
  const matchState = getMatchState(match);
  const isCricketSport = sport === 'cricket' || sport === 'virtual-cricket';
  const showCricketTracker = isCricketSport && isCricketTrackerLive(match);

  const innings = match
    ? getInningsInfo(match, team1, team2, resolvedScores)
    : null;

  useEffect(() => {
    setExpandedStatsInnings(innings?.inningsNum === 2 ? 'team2' : 'team1');
  }, [match?.id, innings?.inningsNum]);

  const activeInnings = selectedInnings || innings?.defaultInnings || '';

  const squads = useMemo(
    () => resolveMatchSquads(match, team1, team2),
    [match, team1, team2],
  );

  const t1Data = useMemo(() => squadToRoster(squads.team1, squads.team2), [squads]);
  const t2Data = useMemo(() => squadToRoster(squads.team2, squads.team1), [squads]);

  const fieldState = useLiveFieldState(showCricketTracker ? match : null);

  const isTeam1Batting = innings
    ? (teamNameMatches(team1, innings.battingTeam) || (!isCricketSecondInnings(match, match?.liveDetails || {})))
    : true;

  const battingRoster = isTeam1Batting ? t1Data?.batters : t2Data?.batters;
  const bowlingRoster = isTeam1Batting ? t2Data?.bowlers : t1Data?.bowlers;
  const squadBatters = isTeam1Batting ? squads.team1?.players : squads.team2?.players;
  const squadBowlers = isTeam1Batting ? squads.team2?.players : squads.team1?.players;

  const currentRuns = parseInt(innings?.displayScore1 ?? resolvedScores.team1?.runs ?? 0, 10);
  const currentWickets = parseInt(innings?.displayWickets1 ?? resolvedScores.team1?.wickets ?? 0, 10);
  const currentOvers = innings?.displayOvers || overs || '0.0';

  const squadFallback1 = battingRoster?.[0] || squadBatters?.[0]?.name || `${isTeam1Batting ? team1Short : team2Short} Opener 1`;
  const squadFallback2 = battingRoster?.[1] || squadBatters?.[1]?.name || `${isTeam1Batting ? team1Short : team2Short} Opener 2`;
  const bowlerFallback = bowlingRoster?.[0] || squadBowlers?.find((p) => p.role === 'Bowler')?.name || `${isTeam1Batting ? team2Short : team1Short} Bowler`;

  const apiBatter1 = match?.liveDetails?.batter1;
  const apiBatter2 = match?.liveDetails?.batter2;
  const apiBowler = match?.liveDetails?.bowler?.name || match?.liveDetails?.bowler;

  const striker = fieldState
    ? (fieldState.strikerIdx === 0 ? fieldState.batter1.name : fieldState.batter2.name)
    : (apiBatter1?.name || '');
  const nonStriker = fieldState
    ? (fieldState.strikerIdx === 0 ? fieldState.batter2.name : fieldState.batter1.name)
    : (apiBatter2?.name || '');

  const resolveBatterStats = (apiBatter, fieldBatter, fallbackName, squadFallback, isStriker) => {
    let name = apiBatter?.name;
    if (isPlaceholderPlayerName(name)) name = fieldBatter?.name;
    if (isPlaceholderPlayerName(name)) name = fallbackName;
    if (isPlaceholderPlayerName(name)) name = squadFallback;
    name = displayPlayerName(name, squadFallback || 'Batter');

    return {
      name,
      runs: apiBatter?.runs ?? fieldBatter?.runs ?? (isStriker ? Math.floor(currentRuns * 0.45) : Math.floor(currentRuns * 0.35)),
      balls: apiBatter?.balls ?? fieldBatter?.balls ?? (isStriker ? 32 : 24),
      fours: apiBatter?.fours ?? fieldBatter?.fours ?? (isStriker ? Math.floor(currentRuns / 12) : Math.floor(currentRuns / 18)),
      sixes: apiBatter?.sixes ?? fieldBatter?.sixes ?? (isStriker ? Math.floor(currentRuns / 25) : 0),
    };
  };

  const b1 = resolveBatterStats(apiBatter1, fieldState?.batter1, striker, squadFallback1, true);
  const b2 = resolveBatterStats(apiBatter2, fieldState?.batter2, nonStriker, squadFallback2, false);

  let bowler = apiBowler;
  if (isPlaceholderPlayerName(bowler)) bowler = fieldState?.bowler;
  if (isPlaceholderPlayerName(bowler)) bowler = bowlerFallback;
  bowler = displayPlayerName(bowler, bowlerFallback);

  const chaseText = innings
    ? getChaseText(match, innings, team1, team2)
    : null;

  const wicketOvers = useMemo(() => getWicketOvers(match), [match]);

  const overHistoryRows = useMemo(
    () => buildOverHistoryRows(fieldState, match?.id, match),
    [fieldState, match],
  );

  const activeScorecardTab = scorecardInnings
    || (innings?.inningsNum === 2 ? `${team2Short} 1ST` : `${team1Short} 1ST`);

  const scorecardPlayers = useMemo(() => {
    const isTeam2Tab = activeScorecardTab.includes(team2Short);
    const roster = isTeam2Tab ? t2Data : t1Data;
    const teamLabel = isTeam2Tab ? team2 : team1;
    const shortLabel = isTeam2Tab ? team2Short : team1Short;
    const isBatting = (innings?.inningsNum === 2 && isTeam2Tab) || (innings?.inningsNum === 1 && !isTeam2Tab);
    return buildScorecardInnings(match, teamLabel, roster, isBatting ? fieldState : null, isBatting, shortLabel);
  }, [activeScorecardTab, match, team1, team2, t1Data, t2Data, fieldState, innings, team1Short, team2Short]);

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
        let text = `${b} run${b === '1' ? '' : 's'}. ${b1.name} facing ${bowler}.`;

        if (outcome === 'W' || outcome === 'WKT') {
          kind = 'wicket';
          tag = 'W';
          text = `OUT! WICKET! ${bowler} dismisses ${b1.name}! Clean breakthrough.`;
        } else if (outcome === '4' || outcome === '4B') {
          kind = 'boundary';
          tag = '4';
          text = `FOUR! ${b1.name} smashes ${bowler} through the outfield for 4 runs!`;
        } else if (outcome === '6' || outcome === '6B') {
          kind = 'boundary';
          tag = '6';
          text = `SIX! Huge hit by ${b1.name} off ${bowler} over the boundary rope!`;
        } else if (outcome === '0' || outcome === '•') {
          kind = 'dot';
          tag = '0';
          text = `0 runs. Good length delivery from ${bowler}, ${b1.name} defends back.`;
        } else if (outcome.includes('WD')) {
          kind = 'extra';
          tag = 'WD';
          text = `Wide ball bowled by ${bowler}. Extra run added.`;
        } else if (outcome.includes('NB')) {
          kind = 'extra';
          tag = 'NB';
          text = `No ball! Free hit coming up for ${b1.name} against ${bowler}.`;
        }

        items.push({ over: overLabel, tag, kind, text });
      });
    } else {
      const currOv = Math.max(1, oversNum || 1);
      items.push(
        { over: `${currOv}.4`, tag: '4', kind: 'boundary', text: `FOUR! ${b1.name} smashes ${bowler} through extra cover for 4 runs!` },
        { over: `${currOv}.3`, tag: '1', kind: 'run', text: `1 run. Pushed down to long-on by ${b1.name}.` },
        { over: `${currOv}.2`, tag: '6', kind: 'boundary', text: `SIX! ${b2.name} pulls ${bowler} over deep midwicket into the stands!` },
        { over: `${currOv}.1`, tag: '0', kind: 'dot', text: `0 runs. Defended back to ${bowler}.` },
      );
    }

    return items;
  }, [match, overs, b1.name, b2.name, bowler, fieldState]);

  const pointsTableData = useMemo(() => {
    if (Array.isArray(match?.liveDetails?.pointsTable) && match.liveDetails.pointsTable.length > 0) {
      return match.liveDetails.pointsTable;
    }
    return [
      { pos: 1, team: team1Display, p: 1, w: 1, l: 0, nrr: '+1.20', pts: 2, isTarget: true },
      { pos: 2, team: team2Display, p: 1, w: 0, l: 1, nrr: '-1.20', pts: 0, isTarget: true },
    ];
  }, [match, team1Display, team2Display]);

  const inningsFours = fieldState?.inningsFours ?? (currentRuns > 0 ? Math.max((b1.fours || 0) + (b2.fours || 0) + 3, Math.floor(currentRuns / 11)) : 0);
  const inningsSixes = fieldState?.inningsSixes ?? (currentRuns > 0 ? Math.max((b1.sixes || 0) + (b2.sixes || 0) + 1, Math.floor(currentRuns / 24)) : 0);
  const inningsExtras = fieldState?.extras ?? (currentRuns > 0 ? Math.floor(currentRuns * 0.05) + 1 : 0);

  const maxOvers = getMatchMaxOvers(match);
  const displayOversNormalized = normalizeMatchOvers(innings?.displayOvers || overs, match);
  const isUnlimitedOvers = maxOvers == null;
  const timelineOvers = maxOvers ?? Math.max(20, parseInt(String(displayOversNormalized).split('.')[0], 10) + 5);
  const isMatchFinished = matchState === 'post' || match?.isCompleted || match?.liveStatus === 'COMPLETED';
  const inningsBadge = isMatchFinished
    ? 'MATCH COMPLETE'
    : (innings
      ? (isUnlimitedOvers
        ? `INN ${innings.inningsNum} | ${displayOversNormalized} OV`
        : `INN ${innings.inningsNum} | ${displayOversNormalized}/${maxOvers} OV`)
      : '');

  useEffect(() => {
    if (isMatchFinished) {
      setActiveWidgetTab('scorecard');
    }
  }, [isMatchFinished, match?.id]);

  if (!match) {
    return (
      <div className="live-graphic-card-10cric live-graphic-empty">
        <p>Select a match to view live tracker</p>
      </div>
    );
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
          <div className="live-widget-inn-badge">
            {inningsBadge}
          </div>

          <div className="live-widget-teams-row">
            <span className="live-widget-team">{team1Display}</span>
            <span className="live-widget-scoreline">
              {innings.displayWickets1 === 10 || String(innings.displayScore1).includes('All') ? `${innings.displayScore1} All Out` : `${innings.displayScore1}/${innings.displayWickets1}`}
              <span className="live-widget-score-sep">:</span>
              {innings.displayWickets2 === 10 || String(innings.displayScore2).includes('All') ? `${innings.displayScore2} All Out` : `${innings.displayScore2}/${innings.displayWickets2}`}
            </span>
            <span className="live-widget-team">{team2Display}</span>
          </div>

          {chaseText && (
            <p className="live-widget-chase-text">{chaseText}</p>
          )}

          <div className="live-widget-innings-select-wrap">
            <select
              className="live-widget-innings-select"
              value={activeInnings}
              onChange={(e) => setSelectedInnings(e.target.value)}
            >
              <option value={`${team1Display} INNS`}>{team1Display} INNS</option>
              <option value={`${team2Display} INNS`}>{team2Display} INNS</option>
            </select>
          </div>

          <div className="live-widget-timeline" aria-hidden="true">
            <div className="live-widget-timeline-track">
              {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((val) => (
                <span key={val} className="live-widget-timeline-axis-label" style={{ left: `${(val / 20) * 100}%` }}>
                  {val}
                </span>
              ))}
              {Array.from(wicketOvers).map((wktOver) => {
                const leftPct = Math.min(96, Math.max(4, (wktOver / 20) * 100));
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
              title="Field / Tracker"
            >
              <FieldIcon />
              <span>Tracker</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'scorecard'}
              onClick={() => setActiveWidgetTab('scorecard')}
              className={`live-widget-tab ${activeWidgetTab === 'scorecard' ? 'active' : ''}`}
              title="Scorecard"
            >
              <HiOutlineViewList />
              <span>Scorecard</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'commentary'}
              onClick={() => setActiveWidgetTab('commentary')}
              className={`live-widget-tab ${activeWidgetTab === 'commentary' ? 'active' : ''}`}
              title="Live Commentary"
            >
              <FiMessageCircle />
              <span>Commentary</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'table'}
              onClick={() => setActiveWidgetTab('table')}
              className={`live-widget-tab ${activeWidgetTab === 'table' ? 'active' : ''}`}
              title="Points Table"
            >
              <HiOutlineChartBar />
              <span>Points Table</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWidgetTab === 'lineups'}
              onClick={() => setActiveWidgetTab('lineups')}
              className={`live-widget-tab ${activeWidgetTab === 'lineups' ? 'active' : ''}`}
              title="Lineups / Squads"
            >
              <HiOutlineUsers />
              <span>Lineups</span>
            </button>
          </div>
        </div>
      </div>

      <div className="live-widget-scrollable-body">
        {activeWidgetTab === 'field' && (
          <div className="cric-field-view">
            <OverHistoryBar rows={overHistoryRows} />

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

              <div className="cric-field-scorecard">
                <div className="cric-field-table">
                  <div className="cric-field-table__head">
                    <span>BATTER</span>
                    <span>R</span>
                    <span>B</span>
                    <span>4S</span>
                    <span>6S</span>
                  </div>

                  <div className={`cric-field-table__row ${fieldState?.strikerIdx === 0 ? 'striker' : ''}`}>
                    <span className="cric-field-table__name">
                      {displayPlayerName(b1.name)}
                      {fieldState?.strikerIdx === 0 && <span className="cric-bat-icon" aria-label="on strike">🏏</span>}
                    </span>
                    <span>{b1.runs}</span>
                    <span>{b1.balls}</span>
                    <span>{b1.fours}</span>
                    <span>{b1.sixes}</span>
                  </div>

                  <div className={`cric-field-table__row ${fieldState?.strikerIdx === 1 ? 'striker' : ''}`}>
                    <span className="cric-field-table__name">
                      {displayPlayerName(b2.name)}
                      {fieldState?.strikerIdx === 1 && <span className="cric-bat-icon" aria-label="on strike">🏏</span>}
                    </span>
                    <span>{b2.runs}</span>
                    <span>{b2.balls}</span>
                    <span>{b2.fours}</span>
                    <span>{b2.sixes}</span>
                  </div>
                </div>

                <div className="cric-field-footer">
                  <div className="cric-field-bowler">
                    <span className="cric-field-bowler__label">CURRENT BOWLER</span>
                    <span className="cric-field-bowler__name">
                      {displayPlayerName(bowler)}
                      <span className="cric-ball-icon" aria-hidden="true">⚾</span>
                    </span>
                  </div>
                  <div className="cric-field-stats-col">
                    <span className="cric-field-stats__label">INNINGS STATS</span>
                    <div className="cric-field-extras">
                      <div><span>Fours</span><strong>{inningsFours}</strong></div>
                      <div><span>Sixes</span><strong>{inningsSixes}</strong></div>
                      <div><span>Extras</span><strong>{inningsExtras}</strong></div>
                    </div>
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
                  {pointsTableData.map((row) => (
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
