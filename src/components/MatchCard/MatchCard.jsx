import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBetSlip } from '../../context/BetSlipContext';
import MatchDetailModal from '../MatchDetailModal/MatchDetailModal';
import SportIcon from '../SportIcon/SportIcon';
import TeamJersey from '../TeamJersey/TeamJersey';
import MatchCountdownTimer from '../MatchCountdownTimer/MatchCountdownTimer';
import { isMatchBettable, isMatchLive, isMatchFinished, hasCricketPlayStarted } from '../../utils/matchBetting';
import { resolveCricketTeamScores } from '../../utils/cricketScores';
import { isTestMatch, getTestMatchDayLabel, formatMatchCountdown } from '../../utils/cricketFormat';
import './MatchCard.css';

const sportLabels = {
  cricket: 'Cricket',
  soccer: 'Soccer',
  basketball: 'Basketball',
  tennis: 'Tennis',
  'table-tennis': 'Table Tennis',
  kabaddi: 'Kabaddi',
  esoccer: 'eSoccer',
  'virtual-cricket': 'Virtual Fast Cricket',
  volleyball: 'Volleyball',
  'american-football': 'American Football',
};

const extraMarketsBySport = {
  cricket: 'Player Runs, Dismissals, 50s',
  'virtual-cricket': 'Wickets, Boundaries, Sixes',
  soccer: 'Corners, Cards, Goalscorers',
  esoccer: 'Next Goal, Corners, Cards',
  basketball: 'Points, Rebounds, Assists',
  tennis: 'Set Winner, Total Games, Aces',
  'table-tennis': 'Set Winner, Total Points, Handicap',
  kabaddi: 'Total Points, Raid Points, Tackles',
  volleyball: 'Set Winner, Total Points, Handicap',
  'american-football': 'Touchdowns, Field Goals, Handicap',
};

function leagueIconKey(league) {
  if (!league) return 'globe';
  const l = league.toLowerCase();
  if (l.includes('premier league') || l.includes('la liga')) return 'soccer';
  if (l.includes('pakistan') || l.includes('west indies')) return 'cricket';
  return 'world';
}

export default function MatchCard({ match, variant = 'default' }) {
  const { addBet, isBetSelected } = useBetSlip();
  const navigate = useNavigate();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const isHome = variant === 'home';

  const isLiveNow = isMatchLive(match);
  const isFinished = isMatchFinished(match);
  const canBet = isMatchBettable(match);

  const handleOddsClick = (e, selection, odds) => {
    e.stopPropagation();
    if (!canBet) return;
    addBet(match, selection, Number(odds));
  };

  const openDetails = (e) => {
    e?.stopPropagation?.();
    if (isHome) {
      const params = new URLSearchParams({
        sport: match.sport || 'cricket',
        league: 'all',
        match: match.id,
      });
      navigate(`/sports?${params.toString()}`);
      return;
    }
    setIsDetailOpen(true);
  };

  const ld = match.liveDetails || {};
  let team1Score = null;
  let team2Score = null;
  let inlineScore = null;

  if (match.sport === 'cricket' || match.sport === 'virtual-cricket') {
    const showCricketScores = isFinished || (isLiveNow && hasCricketPlayStarted(match));
    if (showCricketScores) {
      const scores = resolveCricketTeamScores(match, ld);
      const hasT1 = scores.team1.runs > 0 || scores.team1.wickets > 0 || scores.team1.balls > 0;
      const hasT2 = scores.team2.runs > 0 || scores.team2.wickets > 0 || scores.team2.balls > 0;
      if (hasT1) team1Score = `${scores.team1.runs}/${scores.team1.wickets}`;
      if (hasT2) team2Score = `${scores.team2.runs}/${scores.team2.wickets}`;
      else if (hasT1) team2Score = '0/0';
    }
    inlineScore = team1Score && team2Score ? `${team1Score} vs ${team2Score}` : team1Score;
  } else if (match.sport === 'soccer' || match.sport === 'esoccer') {
    if (Number.isFinite(ld.score1)) {
      team1Score = String(ld.score1);
      team2Score = String(ld.score2 ?? 0);
      inlineScore = `${team1Score} - ${team2Score}`;
    }
  } else if (Number.isFinite(ld.score1) || Number.isFinite(ld.score2)) {
    team1Score = String(ld.score1 ?? 0);
    team2Score = String(ld.score2 ?? 0);
    inlineScore = `${team1Score} - ${team2Score}`;
  }

  const isTest = isTestMatch(match);
  const testDayBadge = isTest ? getTestMatchDayLabel(match) : null;
  const countdownText = !isLiveNow && !isFinished ? formatMatchCountdown(match) : null;

  const sportLabel = sportLabels[match.sport] || match.sport;
  const timeLabel = isLiveNow
    ? `LIVE${inlineScore ? ` · ${inlineScore}` : ''}`
    : isFinished
      ? 'Finished'
      : (countdownText || match.time || 'Scheduled');

  const jerseySize = isHome ? 52 : 46;

  return (
    <>
      {!isHome && (
        <MatchDetailModal
          match={match}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}

      <div
        className={`match-card ${isHome ? 'match-card--home' : ''}`}
        id={`match-${match.id}`}
        onClick={openDetails}
        style={{ cursor: 'pointer' }}
      >
        <div className="match-card-header">
          <span className="match-card-league">
            <SportIcon icon={leagueIconKey(match.league)} sport={match.sport} className="league-flag" />
            {match.league}
          </span>
          <span className={`match-card-sport-tag ${isHome ? 'match-card-sport-tag--home' : ''}`} style={isHome ? undefined : { background: match.sportColor }}>
            <SportIcon sport={match.sport} className="match-card-sport-icon" />
            {isTest ? (testDayBadge ? `TEST (${testDayBadge.split('·')[0].trim()})` : 'TEST') : (isHome ? sportLabel : match.sport)}
          </span>
        </div>

        <div className={`match-card-time ${isLiveNow ? 'live' : ''} ${isFinished ? 'finished' : ''}`}>
          {isHome ? (
            timeLabel
          ) : isLiveNow ? (
            <>
              <span className="live-dot" />
              LIVE {isTest && testDayBadge ? `· ${testDayBadge.split('·')[0].trim()}` : ''}
              {inlineScore && <span className="match-card-score-inline">{inlineScore}</span>}
            </>
          ) : isFinished ? (
            <>
              <span className="result-badge">RESULT</span>
              {match.liveDetails?.commentary && (
                <span className="match-card-score-inline">{match.liveDetails.commentary}</span>
              )}
            </>
          ) : (
            <MatchCountdownTimer match={match} style={{ fontSize: '0.78rem', padding: '2px 8px' }} />
          )}
        </div>

        <div className="match-card-teams">
          <div className="match-card-team">
            <TeamJersey team={match.team1} size={jerseySize} />
            <span className="team-name">{match.team1?.name || match.team1 || 'Team 1'}</span>
            {!isHome && (isLiveNow || isFinished) && team1Score && (
              <span className="team-score">{team1Score}</span>
            )}
          </div>
          {!isHome && <span className="vs-text">VS</span>}
          <div className="match-card-team">
            <TeamJersey team={match.team2} size={jerseySize} />
            <span className="team-name">{match.team2?.name || match.team2 || 'Team 2'}</span>
            {!isHome && (isLiveNow || isFinished) && team2Score && (
              <span className="team-score">{team2Score}</span>
            )}
          </div>
        </div>

        {!isHome && match.liveDetails?.commentary && (isLiveNow || isFinished) && (
          <div className="match-card-commentary">
            {match.liveDetails.commentary}
          </div>
        )}

        {canBet ? (
          <div className={`match-card-odds ${isHome ? 'match-card-odds--home' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button
              className={`odds-btn ${isBetSelected(match.id, '1') ? 'selected' : ''}`}
              onClick={(e) => handleOddsClick(e, '1', match.odds?.team1 ?? 1.85)}
            >
              <span className="odds-label">1</span>
              <span className="odds-value">{Number(match.odds?.team1 || 1.85).toFixed(2)}</span>
            </button>
            {!isHome && match.odds?.draw !== undefined && match.odds?.draw !== null && (
              <button
                className={`odds-btn ${isBetSelected(match.id, 'X') ? 'selected' : ''}`}
                onClick={(e) => handleOddsClick(e, 'X', match.odds?.draw)}
              >
                <span className="odds-label">X</span>
                <span className="odds-value">{Number(match.odds?.draw || 3.50).toFixed(2)}</span>
              </button>
            )}
            <button
              className={`odds-btn ${isBetSelected(match.id, '2') ? 'selected' : ''}`}
              onClick={(e) => handleOddsClick(e, '2', match.odds?.team2 ?? 1.95)}
            >
              <span className="odds-label">2</span>
              <span className="odds-value">{Number(match.odds?.team2 || 1.95).toFixed(2)}</span>
            </button>
          </div>
        ) : (
          <div className="match-card-odds-suspended" onClick={(e) => e.stopPropagation()}>
            {isFinished ? 'Markets closed — match finished' : 'Markets not open yet'}
          </div>
        )}

        {!isHome && (
          <button type="button" className="match-card-markets-link" onClick={openDetails}>
            <span>+28 More Markets ({extraMarketsBySport[match.sport] || 'Specials, Props'})</span>
            <span>➔</span>
          </button>
        )}
      </div>
    </>
  );
}
