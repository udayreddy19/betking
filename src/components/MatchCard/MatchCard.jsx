import { useState } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import MatchDetailModal from '../MatchDetailModal/MatchDetailModal';
import { isMatchBettable, isMatchLive, isMatchFinished } from '../../utils/matchBetting';
import './MatchCard.css';

const sportIcons = {
  cricket: '🏏',
  soccer: '⚽',
  basketball: '🏀',
  tennis: '🎾',
  'table-tennis': '🏓',
  kabaddi: '🤼',
  esoccer: '🎮',
  'virtual-cricket': '🏏',
  volleyball: '🏐',
  'american-football': '🏈',
};

function TeamBadge({ team }) {
  const initials = team.shortName || team.name.slice(0, 3).toUpperCase();
  return (
    <div
      className="team-badge"
      style={{ background: team.color === '#e5e7eb' ? '#334155' : team.color, color: '#fff' }}
    >
      {initials}
    </div>
  );
}

export default function MatchCard({ match }) {
  const { addBet, isBetSelected } = useBetSlip();
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
    setIsDetailOpen(true);
  };

  const cricketScore = match.liveDetails && match.sport === 'cricket'
    && Number.isFinite(match.liveDetails.runs)
    ? `${match.liveDetails.runs}/${match.liveDetails.wickets} (${match.liveDetails.overs || '0.0'})`
    : null;

  const soccerScore = match.liveDetails && match.sport === 'soccer'
    && Number.isFinite(match.liveDetails.score1)
    ? `${match.liveDetails.score1} - ${match.liveDetails.score2} (${match.liveDetails.minute || ''})`
    : null;

  return (
    <>
      <MatchDetailModal
        match={match}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />

      <div className="match-card" id={`match-${match.id}`} onClick={openDetails} style={{ cursor: 'pointer' }}>
        <div className="match-card-header">
          <span className="match-card-league">
            <span className="league-flag">🌐</span>
            {match.league}
          </span>
          <span className="match-card-sport-tag" style={{ background: match.sportColor }}>
            {sportIcons[match.sport] || '🏅'} {match.sport}
          </span>
        </div>

        <div className={`match-card-time ${isLiveNow ? 'live' : ''} ${isFinished ? 'finished' : ''}`}>
          {isLiveNow ? (
            <>
              <span className="live-dot" />
              LIVE
              {(cricketScore || soccerScore) && (
                <span className="match-card-score-inline">
                  {cricketScore || soccerScore}
                </span>
              )}
            </>
          ) : isFinished ? (
            <>
              <span className="result-badge">RESULT</span>
              {match.liveDetails?.commentary && (
                <span className="match-card-score-inline">{match.liveDetails.commentary}</span>
              )}
            </>
          ) : (
            <>
              <span className="upcoming-badge">UPCOMING</span>
              {match.time}
            </>
          )}
        </div>

        <div className="match-card-teams">
          <div className="match-card-team">
            <TeamBadge team={match.team1} />
            <span className="team-name">{match.team1.name}</span>
          </div>
          <span className="vs-text">VS</span>
          <div className="match-card-team">
            <TeamBadge team={match.team2} />
            <span className="team-name">{match.team2.name}</span>
          </div>
        </div>

        {match.liveDetails?.commentary && (isLiveNow || isFinished) && (
          <div className="match-card-commentary">
            {match.liveDetails.commentary}
          </div>
        )}

        {canBet ? (
          <div className="match-card-odds" onClick={(e) => e.stopPropagation()}>
            <button
              className={`odds-btn ${isBetSelected(match.id, '1') ? 'selected' : ''}`}
              onClick={(e) => handleOddsClick(e, '1', match.odds.team1)}
            >
              <span className="odds-label">1</span>
              <span className="odds-value">{Number(match.odds.team1).toFixed(2)}</span>
            </button>
            {match.odds.draw !== undefined && (
              <button
                className={`odds-btn ${isBetSelected(match.id, 'X') ? 'selected' : ''}`}
                onClick={(e) => handleOddsClick(e, 'X', match.odds.draw)}
              >
                <span className="odds-label">X</span>
                <span className="odds-value">{Number(match.odds.draw).toFixed(2)}</span>
              </button>
            )}
            <button
              className={`odds-btn ${isBetSelected(match.id, '2') ? 'selected' : ''}`}
              onClick={(e) => handleOddsClick(e, '2', match.odds.team2)}
            >
              <span className="odds-label">2</span>
              <span className="odds-value">{Number(match.odds.team2).toFixed(2)}</span>
            </button>
          </div>
        ) : (
          <div className="match-card-odds-suspended" onClick={(e) => e.stopPropagation()}>
            {isFinished ? 'Markets closed — match finished' : 'Markets not open yet'}
          </div>
        )}

        <button type="button" className="match-card-markets-link" onClick={openDetails}>
          <span>+28 More Markets (Player Runs, Dismissals, 50s)</span>
          <span>➔</span>
        </button>
      </div>
    </>
  );
}
