import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { useMatchWatchlist } from '../../hooks/useMatchWatchlist';
import MatchDetailModal from '../MatchDetailModal/MatchDetailModal';
import SportIcon from '../SportIcon/SportIcon';
import TeamJersey from '../TeamJersey/TeamJersey';
import MatchCountdownTimer from '../MatchCountdownTimer/MatchCountdownTimer';
import { isMatchBettable, isMatchLive, isMatchFinished, hasCricketPlayStarted } from '../../utils/matchBetting';
import { resolveCricketTeamScores } from '../../utils/cricketScores';
import { isTeamBattingInMatch } from '../../utils/teamFlags';
import {
  isTestMatch,
  getTestMatchDayLabel,
  formatMatchCountdown,
  getCricketFormatCardBadge,
  isMatchSRL,
} from '../../utils/cricketFormat';
import { enrichFromPoller } from '../../services/matchDetailPoller';
import { teamDisplayName, asDisplayText } from '../../utils/teamShortName';
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
  const { showToast } = useAuth();
  const { isSaved, toggle } = useMatchWatchlist();
  const navigate = useNavigate();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const isHome = variant === 'home';
  if (!match?.id) return null;
  const saved = isSaved(match.id);
  const team1Name = teamDisplayName(match.team1, 'Team 1');
  const team2Name = teamDisplayName(match.team2, 'Team 2');

  const handleWatchlist = (e) => {
    e.stopPropagation();
    const next = toggle(match);
    const nowSaved = next.some((item) => item.id === String(match.id));
    showToast?.(
      nowSaved ? 'Added to your watchlist' : 'Removed from watchlist',
      'success',
    );
  };

  const displayMatch = enrichFromPoller(match) || match;
  const isLiveNow = isMatchLive(displayMatch);
  const isFinished = isMatchFinished(displayMatch);
  const canBet = isMatchBettable(displayMatch);

  const handleOddsClick = (e, selection, odds) => {
    e.stopPropagation();
    if (!canBet) return;
    addBet(match, selection, Number(odds), undefined, { marketId: 'match_winner', marketName: 'Match Winner' });
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

  const ld = displayMatch.liveDetails || {};
  let team1Score = null;
  let team2Score = null;
  let inlineScore = null;

  if (displayMatch.sport === 'cricket' || displayMatch.sport === 'virtual-cricket') {
    const showCricketScores = isFinished || (isLiveNow && hasCricketPlayStarted(displayMatch));
    if (showCricketScores) {
      const scores = resolveCricketTeamScores(displayMatch, ld);
      if (scores.team1.hasBatted) team1Score = scores.team1.displayScore;
      if (scores.team2.hasBatted) team2Score = scores.team2.displayScore;
    }
    inlineScore = team1Score && team2Score ? `${team1Score} vs ${team2Score}` : (team1Score || team2Score);
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

  const sportLabel = sportLabels[match.sport] || asDisplayText(match.sport, 'Sport');
  const timeLabel = isLiveNow
    ? `LIVE${inlineScore ? ` · ${inlineScore}` : ''}`
    : isFinished
      ? 'Finished'
      : (countdownText || asDisplayText(match.time, 'Scheduled'));

  const jerseySize = isHome ? 52 : 46;

  const isCricket = !match.sport || String(match.sport).toLowerCase().includes('cricket');
  const formatBadge = isCricket ? getCricketFormatCardBadge(match) : null;
  const isSRL = isMatchSRL(match);

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
            {asDisplayText(match.league)}
          </span>
          <div className="match-card-header-actions">
            <button
              type="button"
              className={`match-watchlist-btn ${saved ? 'is-saved' : ''}`}
              onClick={handleWatchlist}
              aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
              title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {saved ? '★' : '☆'}
            </button>
            <span className={`match-card-sport-tag ${isHome ? 'match-card-sport-tag--home' : ''}`} style={isHome ? undefined : { background: match.sportColor }}>
              <SportIcon sport={match.sport} className="match-card-sport-icon" />
              {isTest ? (testDayBadge ? `TEST (${testDayBadge.split('·')[0].trim()})` : 'TEST') : (isHome ? sportLabel : match.sport)}
            </span>
          </div>
        </div>

        <div className={`match-card-time ${isLiveNow ? 'live' : ''} ${isFinished ? 'finished' : ''}`}>
          {isHome ? (
            timeLabel
          ) : (
            <div className="match-card-badge-container">
              <div className="sports-card-badge-group">
                {isLiveNow ? (
                  <span className="sports-card-badge sports-card-badge--live">
                    <span className="sports-badge-dot" />LIVE
                  </span>
                ) : isFinished ? (
                  <span className="sports-card-badge sports-card-badge--completed">COMPLETED</span>
                ) : (
                  <span className="sports-card-badge sports-card-badge--upcoming">UPCOMING</span>
                )}
                {formatBadge && (
                  <span className="sports-card-badge sports-card-badge--format">{formatBadge}</span>
                )}
                {isSRL && (
                  <span className="sports-card-badge sports-card-badge--srl">⚡ SRL</span>
                )}
              </div>
              {inlineScore && <span className="match-card-score-inline">{inlineScore}</span>}
              {!isLiveNow && !isFinished && (
                <MatchCountdownTimer match={match} style={{ fontSize: '0.78rem', padding: '2px 8px' }} />
              )}
            </div>
          )}
        </div>

        <div className="match-card-teams">
          <div className="match-card-team">
            <TeamJersey team={match.team1} size={jerseySize} isFlying={isLiveNow && isTeamBattingInMatch(match, match.team1)} />
            <span className="team-name">{team1Name}</span>
            {!isHome && (isLiveNow || isFinished) && team1Score && (
              <span className="team-score">{team1Score}</span>
            )}
          </div>
          {!isHome && <span className="vs-text">VS</span>}
          <div className="match-card-team">
            <TeamJersey team={match.team2} size={jerseySize} isFlying={isLiveNow && isTeamBattingInMatch(match, match.team2)} />
            <span className="team-name">{team2Name}</span>
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
          (() => {
            const t1Odds = match.odds?.team1 ?? match.authoritativeOdds?.team1;
            const t2Odds = match.odds?.team2 ?? match.authoritativeOdds?.team2;
            const drawOdds = match.odds?.draw ?? match.authoritativeOdds?.draw;
            const hasT1Odds = t1Odds != null && Number(t1Odds) > 1;
            const hasT2Odds = t2Odds != null && Number(t2Odds) > 1;
            const hasDrawOdds = drawOdds != null && Number(drawOdds) > 1;
            const hasAnyOdds = hasT1Odds || hasT2Odds || hasDrawOdds;
            const showDraw = !isHome && (hasDrawOdds || match.sport === 'soccer' || match.sport === 'esoccer');

            if (!hasAnyOdds) {
              return (
                <div className="match-card-odds-suspended" onClick={(e) => e.stopPropagation()}>
                  Odds unavailable — open match
                </div>
              );
            }

            return (
              <div className={`match-card-odds ${isHome ? 'match-card-odds--home' : ''}`} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`odds-btn ${isBetSelected(match.id, '1') ? 'selected' : ''} ${!hasT1Odds ? 'disabled' : ''}`}
                  disabled={!hasT1Odds}
                  onClick={(e) => hasT1Odds && handleOddsClick(e, '1', t1Odds)}
                >
                  <span className="odds-label">1</span>
                  <span className="odds-value">{hasT1Odds ? Number(t1Odds).toFixed(2) : 'Susp.'}</span>
                </button>
                {showDraw && (
                  <button
                    type="button"
                    className={`odds-btn ${isBetSelected(match.id, 'X') ? 'selected' : ''} ${!hasDrawOdds ? 'disabled' : ''}`}
                    disabled={!hasDrawOdds}
                    onClick={(e) => hasDrawOdds && handleOddsClick(e, 'X', drawOdds)}
                  >
                    <span className="odds-label">X</span>
                    <span className="odds-value">{hasDrawOdds ? Number(drawOdds).toFixed(2) : 'Susp.'}</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`odds-btn ${isBetSelected(match.id, '2') ? 'selected' : ''} ${!hasT2Odds ? 'disabled' : ''}`}
                  disabled={!hasT2Odds}
                  onClick={(e) => hasT2Odds && handleOddsClick(e, '2', t2Odds)}
                >
                  <span className="odds-label">2</span>
                  <span className="odds-value">{hasT2Odds ? Number(t2Odds).toFixed(2) : 'Susp.'}</span>
                </button>
              </div>
            );
          })()
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
