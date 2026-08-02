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

  // Individual team scores per sport
  const ld = match.liveDetails || {};
  let team1Score = null;
  let team2Score = null;
  let inlineScore = null;

  if (match.sport === 'cricket') {
    const t1 = Number.isFinite(ld.runs) ? `${ld.runs}/${ld.wickets} (${ld.overs || '0.0'})` : null;
    const t2 = Number.isFinite(ld.score2) ? `${ld.score2}/${ld.wickets2 ?? 0} (${ld.overs2 || '0.0'})` : null;
    team1Score = t1;
    team2Score = t2;
    inlineScore = t1 && t2 ? `${t1}  vs  ${t2}` : t1;
  } else if (match.sport === 'soccer') {
    if (Number.isFinite(ld.score1)) {
      team1Score = String(ld.score1);
      team2Score = String(ld.score2 ?? 0);
      inlineScore = `${team1Score} - ${team2Score} (${ld.minute || ''})`;
    }
  } else if (match.sport === 'basketball' || match.sport === 'american-football') {
    if (Number.isFinite(ld.score1) || Number.isFinite(ld.score2)) {
      team1Score = String(ld.score1 ?? 0);
      team2Score = String(ld.score2 ?? 0);
      const period = ld.quarter || '';
      inlineScore = `${team1Score} - ${team2Score} (${period})`;
    }
  } else if (match.sport === 'tennis') {
    if (ld.sets1?.length || ld.sets2?.length) {
      const s1 = (ld.sets1 || []).filter((v) => v > 0).length;
      const s2 = (ld.sets2 || []).filter((v) => v > 0).length;
      team1Score = (ld.sets1 || []).join(' ');
      team2Score = (ld.sets2 || []).join(' ');
      inlineScore = `${s1} - ${s2} sets`;
    } else if (Number.isFinite(ld.score1)) {
      team1Score = String(ld.score1);
      team2Score = String(ld.score2 ?? 0);
      inlineScore = `${team1Score} - ${team2Score}`;
    }
  }

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
              {inlineScore && (
                <span className="match-card-score-inline">
                  {inlineScore}
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
            {(isLiveNow || isFinished) && team1Score && (
              <span className="team-score">{team1Score}</span>
            )}
          </div>
          <span className="vs-text">VS</span>
          <div className="match-card-team">
            <TeamBadge team={match.team2} />
            <span className="team-name">{match.team2.name}</span>
            {(isLiveNow || isFinished) && team2Score && (
              <span className="team-score">{team2Score}</span>
            )}
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
          <span>+28 More Markets ({extraMarketsBySport[match.sport] || 'Specials, Props'})</span>
          <span>➔</span>
        </button>
      </div>
    </>
  );
}
