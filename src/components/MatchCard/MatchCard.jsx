import { useBetSlip } from '../../context/BetSlipContext';
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

  const handleOddsClick = (selection, odds) => {
    addBet(match, selection, odds);
  };

  return (
    <div className="match-card" id={`match-${match.id}`}>
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

      <div className="match-card-odds">
        <button
          className={`odds-btn ${isBetSelected(match.id, '1') ? 'selected' : ''}`}
          onClick={() => handleOddsClick('1', match.odds.team1)}
        >
          <span className="odds-label">1</span>
          <span className="odds-value">{match.odds.team1.toFixed(2)}</span>
        </button>
        {match.odds.draw !== undefined && (
          <button
            className={`odds-btn ${isBetSelected(match.id, 'X') ? 'selected' : ''}`}
            onClick={() => handleOddsClick('X', match.odds.draw)}
          >
            <span className="odds-label">X</span>
            <span className="odds-value">{match.odds.draw.toFixed(2)}</span>
          </button>
        )}
        <button
          className={`odds-btn ${isBetSelected(match.id, '2') ? 'selected' : ''}`}
          onClick={() => handleOddsClick('2', match.odds.team2)}
        >
          <span className="odds-label">2</span>
          <span className="odds-value">{match.odds.team2.toFixed(2)}</span>
        </button>
      </div>
    </div>
  );
}
