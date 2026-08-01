import { useState } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import MatchDetailModal from '../MatchDetailModal/MatchDetailModal';
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

export default function MatchCard({ match }) {
  const { addBet, isBetSelected } = useBetSlip();
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleOddsClick = (e, selection, odds) => {
    e.stopPropagation();
    addBet(match, selection, odds);
  };

  return (
    <>
      <MatchDetailModal
        match={match}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />

      <div className="match-card" id={`match-${match.id}`} onClick={() => setIsDetailOpen(true)} style={{ cursor: 'pointer' }}>
        <div className="match-card-header">
          <span className="match-card-league">
            <span className="league-flag">🌐</span>
            {match.league}
          </span>
          <span className="match-card-sport-tag" style={{ background: match.sportColor }}>
            {sportIcons[match.sport] || '🏅'} {match.sport}
          </span>
        </div>

        <div className={`match-card-time ${match.isLive ? 'live' : ''}`}>
          {match.isLive ? (
            <>
              <span className="live-dot" />
              LIVE
              {match.liveDetails && (
                <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: 'bold' }}>
                  {match.sport === 'cricket' && `${match.liveDetails.runs}/${match.liveDetails.wickets} (${match.liveDetails.overs || '16.4'})`}
                  {match.sport === 'soccer' && `${match.liveDetails.score1} - ${match.liveDetails.score2} (${match.liveDetails.minute || 45}')`}
                  {match.sport === 'basketball' && `${match.liveDetails.score1} - ${match.liveDetails.score2}`}
                </span>
              )}
            </>
          ) : (
            match.time
          )}
        </div>

        <div className="match-card-teams">
          <div className="match-card-team">
            <div className="team-jersey" style={{ color: match.team1.color }}>
              👕
            </div>
            <span className="team-name">{match.team1.name}</span>
          </div>
          <span className="vs-text">VS</span>
          <div className="match-card-team">
            <div className="team-jersey" style={{ color: match.team2.color }}>
              👕
            </div>
            <span className="team-name">{match.team2.name}</span>
          </div>
        </div>

        {match.isLive && match.liveDetails?.commentary && (
          <div style={{
            fontSize: '0.7rem',
            color: '#94a3b8',
            fontStyle: 'italic',
            padding: '2px 8px',
            background: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '4px',
            marginBottom: '8px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            💬 {match.liveDetails.commentary}
          </div>
        )}

        <div className="match-card-odds">
          <button
            className={`odds-btn ${isBetSelected(match.id, '1') ? 'selected' : ''}`}
            onClick={(e) => handleOddsClick(e, '1', match.odds.team1)}
          >
            <span className="odds-label">1</span>
            <span className="odds-value">
              {match.odds.team1.toFixed(2)}
              {match.oddsDirection?.team1 === 'up' && <span style={{ color: '#22c55e', marginLeft: '2px' }}>▲</span>}
              {match.oddsDirection?.team1 === 'down' && <span style={{ color: '#ef4444', marginLeft: '2px' }}>▼</span>}
            </span>
          </button>
          {match.odds.draw !== undefined && (
            <button
              className={`odds-btn ${isBetSelected(match.id, 'X') ? 'selected' : ''}`}
              onClick={(e) => handleOddsClick(e, 'X', match.odds.draw)}
            >
              <span className="odds-label">X</span>
              <span className="odds-value">
                {match.odds.draw.toFixed(2)}
                {match.oddsDirection?.draw === 'up' && <span style={{ color: '#22c55e', marginLeft: '2px' }}>▲</span>}
                {match.oddsDirection?.draw === 'down' && <span style={{ color: '#ef4444', marginLeft: '2px' }}>▼</span>}
              </span>
            </button>
          )}
          <button
            className={`odds-btn ${isBetSelected(match.id, '2') ? 'selected' : ''}`}
            onClick={(e) => handleOddsClick(e, '2', match.odds.team2)}
          >
            <span className="odds-label">2</span>
            <span className="odds-value">
              {match.odds.team2.toFixed(2)}
              {match.oddsDirection?.team2 === 'up' && <span style={{ color: '#22c55e', marginLeft: '2px' }}>▲</span>}
              {match.oddsDirection?.team2 === 'down' && <span style={{ color: '#ef4444', marginLeft: '2px' }}>▼</span>}
            </span>
          </button>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: '8px',
          fontSize: '0.7rem',
          color: '#7c3aed',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px'
        }}>
          <span>+28 More Markets (Player Runs, Dismissals, 50s)</span>
          <span>➔</span>
        </div>
      </div>
    </>
  );
}
