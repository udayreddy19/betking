import { useState, useMemo, useEffect, useRef } from 'react';
import { HiOutlineViewList, HiOutlineChartBar, HiOutlineUsers } from '../../icons';
import { useLiveFieldState } from '../../hooks/useLiveFieldState';
import { useMatchDetail } from '../../hooks/useMatchDetail';
import { getRosterForTeam } from '../../data/cricketRosters';
import { resolveMatchSquads, formatPlayerRole } from '../../utils/matchSquads';
import { getBallDisplayKind, getBallDisplayLabel } from '../../utils/liveFieldState';
import {
  getTeamShortCode,
  getTeamDisplayName,
  getChaseText,
  buildScorecardInnings,
  buildOverHistoryRows,
  buildStatsOvers,
  getWicketOvers,
} from '../../utils/liveMatchWidgetData';
import {
  getSportStatusBadge,
  getSportScores,
  getPeriodRows,
  getSportLeagueLabel,
} from '../../utils/sportLiveWidgetData';
import { isCricketTrackerLive, getMatchState } from '../../utils/matchBetting';
import { isPlaceholderPlayerName, displayPlayerName } from '../../utils/cricketPlayers';
import './LiveMatchGraphicWidget.css';

function getTeamShort(name) {
  return getTeamShortCode(name);
}

function getInningsInfo(match, team1, team2, score1, wickets1, score2, wickets2, overs) {
  const overs2 = match?.liveDetails?.overs2 || overs;
  const hasSecondInnings = (
    score2 > 0
    || wickets2 > 0
    || (match?.liveDetails?.chaseRuns != null && match.liveDetails.chaseRuns > 0)
  ) && match?.matchState === 'in';
  const isChasing = hasSecondInnings && match?.matchState === 'in';

  if (isChasing) {
    return {
      inningsNum: 2,
      battingTeam: team2,
      battingShort: getTeamShort(team2),
      displayScore1: score1,
      displayWickets1: wickets1,
      displayScore2: score2,
      displayWickets2: wickets2,
      displayOvers: overs2,
      defaultInnings: `${getTeamDisplayName(team2)} INNS`,
    };
  }

  return {
    inningsNum: 1,
    battingTeam: team1,
    battingShort: getTeamShort(team1),
    displayScore1: score1,
    displayWickets1: wickets1,
    displayScore2: score2,
    displayWickets2: wickets2,
    displayOvers: overs,
    defaultInnings: `${getTeamDisplayName(team1)} INNS`,
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

export default function LiveMatchGraphicWidget({ match: rawMatch }) {
  const match = useMatchDetail(rawMatch);
  const [activeWidgetTab, setActiveWidgetTab] = useState('field');
  const [selectedInnings, setSelectedInnings] = useState('');
  const [scorecardInnings, setScorecardInnings] = useState('');
  const [expandedStatsInnings, setExpandedStatsInnings] = useState('batting');

  const sport = match?.sport || 'cricket';
  const team1 = match?.team1?.name || 'Team 1';
  const team2 = match?.team2?.name || 'Team 2';

  const score1 = match?.liveDetails?.runs ?? 0;
  const wickets1 = match?.liveDetails?.wickets ?? 0;
  const score2 = match?.liveDetails?.score2 ?? 0;
  const wickets2 = match?.liveDetails?.wickets2 ?? 0;
  const overs = match?.liveDetails?.overs || '0.0';
  const matchState = getMatchState(match);
  const isCricketSport = sport === 'cricket' || sport === 'virtual-cricket';
  const showCricketTracker = isCricketSport && isCricketTrackerLive(match);

  const innings = match
    ? getInningsInfo(match, team1, team2, score1, wickets1, score2, wickets2, overs)
    : null;
  const activeInnings = selectedInnings || innings?.defaultInnings || '';

  const t1Data = getRosterForTeam(team1);
  const t2Data = getRosterForTeam(team2);

  const team1Short = getTeamShort(team1);
  const team2Short = getTeamShort(team2);
  const team1Display = getTeamDisplayName(team1);
  const team2Display = getTeamDisplayName(team2);

  const viewingTeam2Innings = activeInnings.includes(team2Display) || activeInnings.includes(team2Short);
  const battingRoster = viewingTeam2Innings ? t2Data : t1Data;
  const bowlingRoster = viewingTeam2Innings ? t1Data : t2Data;

  const fieldState = useLiveFieldState(isCricketSport && showCricketTracker ? match : null, battingRoster);

  const apiBatter1 = match?.liveDetails?.batter1;
  const apiBatter2 = match?.liveDetails?.batter2;
  const apiBowler = match?.liveDetails?.bowler?.name;

  const striker = fieldState
    ? (fieldState.strikerIdx === 0 ? fieldState.batter1.name : fieldState.batter2.name)
    : (apiBatter1?.name || '');
  const nonStriker = fieldState
    ? (fieldState.strikerIdx === 0 ? fieldState.batter2.name : fieldState.batter1.name)
    : (apiBatter2?.name || '');
  const bowler = fieldState?.bowler || apiBowler || '';

  const resolveBatter = (apiBatter, fieldBatter, fallbackName) => {
    if (apiBatter?.name && !isPlaceholderPlayerName(apiBatter.name)) {
      return { fours: 0, sixes: 0, ...apiBatter };
    }
    if (fieldBatter?.name && !isPlaceholderPlayerName(fieldBatter.name)) {
      return fieldBatter;
    }
    const name = displayPlayerName(fallbackName);
    return { name, runs: 0, balls: 0, fours: 0, sixes: 0 };
  };

  const b1 = resolveBatter(apiBatter1, fieldState?.batter1, striker);
  const b2 = resolveBatter(apiBatter2, fieldState?.batter2, nonStriker);

  const chaseText = innings
    ? getChaseText(match, innings, team1, score1, score2, wickets2)
    : null;

  const wicketOvers = useMemo(() => {
    const wkts = innings?.inningsNum === 2 ? wickets2 : wickets1;
    return getWicketOvers(match, wkts);
  }, [match, innings?.inningsNum, wickets1, wickets2]);

  const overHistoryRows = useMemo(
    () => buildOverHistoryRows(fieldState, match?.id, match),
    [fieldState, match?.id, match?.liveDetails?.overs, match?.liveDetails?.overs2, match?.liveDetails?.chaseOvers, match?.liveDetails?.score2, match?.liveDetails?.chaseRuns, match?.matchState],
  );

  const activeScorecardTab = scorecardInnings
    || (innings?.inningsNum === 2 ? `${team2Short} 1ST` : `${team1Short} 1ST`);

  const squads = useMemo(
    () => resolveMatchSquads(match, team1, team2),
    [match, team1, team2],
  );

  const scorecardPlayers = useMemo(() => {
    const isTeam2Tab = activeScorecardTab.includes(team2Short);
    const roster = isTeam2Tab ? t2Data : t1Data;
    const teamLabel = isTeam2Tab ? team2 : team1;
    const shortLabel = isTeam2Tab ? team2Short : team1Short;
    const isBatting = (innings?.inningsNum === 2 && isTeam2Tab) || (innings?.inningsNum === 1 && !isTeam2Tab);
    return buildScorecardInnings(match, teamLabel, roster, isBatting ? fieldState : null, isBatting, shortLabel);
  }, [activeScorecardTab, match, team1, team2, t1Data, t2Data, fieldState, innings, team1Short, team2Short]);

  const statsOvers = useMemo(() => {
    const battingScore = innings?.inningsNum === 2 ? score2 : score1;
    const battingWickets = innings?.inningsNum === 2 ? wickets2 : wickets1;
    return buildStatsOvers(fieldState, match, battingScore, battingWickets);
  }, [fieldState, match, innings, score1, score2, wickets1, wickets2]);

  const inningsFours = fieldState?.inningsFours ?? 0;
  const inningsSixes = fieldState?.inningsSixes ?? 0;
  const inningsExtras = fieldState?.extras ?? 0;

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

  if (!showCricketTracker) {
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
      <div className="live-widget-body">
        <div className="live-widget-inn-badge">
          {`INN ${innings.inningsNum} | ${innings.displayOvers}/20 OV`}
        </div>

        <div className="live-widget-teams-row">
          <span className="live-widget-team">{team1Display}</span>
          <span className="live-widget-scoreline">
            {innings.displayScore1}/{innings.displayWickets1}
            <span className="live-widget-score-sep">:</span>
            {innings.displayScore2}/{innings.displayWickets2}
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
            {Array.from({ length: 21 }, (_, i) => (
              <div key={i} className="live-widget-timeline-tick">
                {wicketOvers.has(i) && i > 0 && <span className="live-widget-wicket">W</span>}
                {i % 2 === 0 && <span className="live-widget-timeline-label">{i}</span>}
              </div>
            ))}
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
            <FieldIcon />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'scorecard'}
            onClick={() => setActiveWidgetTab('scorecard')}
            className={`live-widget-tab ${activeWidgetTab === 'scorecard' ? 'active' : ''}`}
          >
            <HiOutlineViewList />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'stats'}
            onClick={() => setActiveWidgetTab('stats')}
            className={`live-widget-tab ${activeWidgetTab === 'stats' ? 'active' : ''}`}
          >
            <HiOutlineChartBar />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'lineups'}
            onClick={() => setActiveWidgetTab('lineups')}
            className={`live-widget-tab ${activeWidgetTab === 'lineups' ? 'active' : ''}`}
          >
            <HiOutlineUsers />
          </button>
        </div>

        {activeWidgetTab === 'field' && (
          <div className="cric-field-view">
            <OverHistoryBar rows={overHistoryRows} />

            <div className="cric-field-pitch">
              <div className="cric-field-pitch__bg" />

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
                      <span className="cric-ball-icon" aria-hidden="true">⚾</span>
                      {displayPlayerName(bowler)}
                    </span>
                  </div>
                  <div className="cric-field-extras">
                    <div><span>Fours</span><strong>{inningsFours}</strong></div>
                    <div><span>Sixes</span><strong>{inningsSixes}</strong></div>
                    <div><span>Extras</span><strong>{inningsExtras}</strong></div>
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
              {scorecardPlayers.map((player, idx) => (
                <div key={`${player.name}-${idx}`} className="cric-scorecard-table__row">
                  <div className="cric-scorecard-table__batter">
                    <strong>{player.name}</strong>
                    <span className={player.notOut ? 'cric-not-out' : 'cric-dismissal'}>
                      {player.notOut ? 'NOT OUT' : player.dismissal}
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
                className={`cric-stats-innings__row ${expandedStatsInnings === 'bowling' ? 'expanded' : ''}`}
                onClick={() => setExpandedStatsInnings(expandedStatsInnings === 'bowling' ? '' : 'bowling')}
              >
                <span>{team1Display} 1st INNS</span>
                <span className="cric-stats-innings__score">{score1}/{wickets1} (20 ov)</span>
                <span className="cric-stats-innings__arrow">{expandedStatsInnings === 'bowling' ? '▲' : '▼'}</span>
              </button>

              <button
                type="button"
                className={`cric-stats-innings__row ${expandedStatsInnings === 'batting' ? 'expanded' : ''}`}
                onClick={() => setExpandedStatsInnings(expandedStatsInnings === 'batting' ? '' : 'batting')}
              >
                <span>{team2Display} 1st INNS</span>
                <span className="cric-stats-innings__score">
                  {score2}/{wickets2} ({Math.ceil(parseFloat(innings.displayOvers) || 0)} ov)
                </span>
                <span className="cric-stats-innings__arrow">{expandedStatsInnings === 'batting' ? '▲' : '▼'}</span>
              </button>
            </div>

            {expandedStatsInnings === 'batting' && (
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
