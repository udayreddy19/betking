import { useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { FiChevronRight, FiShield, FiTrendingUp } from 'react-icons/fi';
import { useBetSlip } from '../../context/BetSlipContext';
import './MatchDetailModal.css';

export default function MatchDetailModal({ match, isOpen, onClose }) {
  const { addBet, isBetSelected } = useBetSlip();
  const [activeMarketCategory, setActiveMarketCategory] = useState('all');

  if (!isOpen || !match) return null;

  // Generate dynamic 10CRIC style markets based on match teams
  const team1Name = match.team1.name;
  const team2Name = match.team2.name;

  const playerList = [
    { name: 'Nitish Rana', line: '24.5', overOdds: 1.83, underOdds: 1.83, yes50: 3.30, no50: 1.27 },
    { name: 'Himmat Singh', line: '24.5', overOdds: 1.83, underOdds: 1.83, yes50: 3.40, no50: 1.26 },
    { name: 'Hiten Dalal', line: '16.5', overOdds: 1.83, underOdds: 1.83, yes50: 5.70, no50: 1.09 },
    { name: 'Shivam Gupta', line: '19.5', overOdds: 1.83, underOdds: 1.83, yes50: 4.70, no50: 1.14 },
    { name: 'Ankit Rajesh', line: '17.5', overOdds: 1.83, underOdds: 1.83, yes50: 5.40, no50: 1.10 }
  ];

  const handleOddsClick = (marketName, selection, odds) => {
    const customMatch = {
      ...match,
      id: `${match.id}_${marketName}_${selection}`
    };
    addBet(customMatch, `${marketName}: ${selection}`, odds);
  };

  return (
    <div className="match-detail-overlay" onClick={onClose}>
      <div className="match-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="match-detail-header">
          <div className="match-detail-league">
            <span>🌐 {match.league}</span>
            <span className="match-detail-sport-tag">{match.sport.toUpperCase()}</span>
          </div>
          <button className="match-detail-close" onClick={onClose}>
            <IoClose />
          </button>
        </div>

        {/* Live Score Scoreboard Banner */}
        <div className="match-detail-scoreboard">
          <div className="scoreboard-team">
            <span className="scoreboard-jersey" style={{ color: match.team1.color }}>👕</span>
            <h4>{team1Name}</h4>
            {match.isLive && match.liveDetails && (
              <div className="scoreboard-score">{match.liveDetails.runs || 145}/{match.liveDetails.wickets || 3}</div>
            )}
          </div>

          <div className="scoreboard-vs">
            {match.isLive ? (
              <div className="scoreboard-live-badge">
                <span className="live-pulse" />
                LIVE ({match.liveDetails?.overs || '14.2'} Ov)
              </div>
            ) : (
              <div className="scoreboard-time">{match.time}</div>
            )}
            <span className="vs-label">VS</span>
          </div>

          <div className="scoreboard-team">
            <span className="scoreboard-jersey" style={{ color: match.team2.color }}>👕</span>
            <h4>{team2Name}</h4>
            {match.isLive && match.liveDetails && (
              <div className="scoreboard-score">{match.liveDetails.score2 || 132}/{match.liveDetails.wickets2 || 4}</div>
            )}
          </div>
        </div>

        {match.isLive && match.liveDetails?.commentary && (
          <div className="match-detail-commentary">
            ⚡ {match.liveDetails.commentary}
          </div>
        )}

        {/* Market Filter Tabs */}
        <div className="market-tabs">
          {['all', 'main', 'player-props', 'innings', 'specials'].map(cat => (
            <button
              key={cat}
              className={`market-tab ${activeMarketCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveMarketCategory(cat)}
            >
              {cat === 'all' && 'All Markets'}
              {cat === 'main' && 'Main / Winner'}
              {cat === 'player-props' && 'Player Props'}
              {cat === 'innings' && 'Innings & Overs'}
              {cat === 'specials' && 'Specials'}
            </button>
          ))}
        </div>

        {/* Markets Content List */}
        <div className="market-content">
          
          {/* 1. Winner 1x2 Market */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'main') && (
            <div className="market-box">
              <div className="market-title">
                <span>Winner (incl. super over)</span>
                <span className="market-cashout">CASHOUT</span>
              </div>
              <div className="market-odds-grid two-col">
                <button
                  className="market-odds-btn"
                  onClick={() => handleOddsClick('Match Winner', team1Name, match.odds.team1)}
                >
                  <span className="market-label">{team1Name}</span>
                  <span className="market-val">{match.odds.team1.toFixed(2)}</span>
                </button>
                <button
                  className="market-odds-btn"
                  onClick={() => handleOddsClick('Match Winner', team2Name, match.odds.team2)}
                >
                  <span className="market-label">{team2Name}</span>
                  <span className="market-val">{match.odds.team2.toFixed(2)}</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. 1st Innings 1st Dismissal Method */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'innings') && (
            <div className="market-box">
              <div className="market-title">
                <span>1st innings - 1st dismissal method (extended)</span>
              </div>
              <div className="market-odds-grid multi-col">
                {[
                  { label: 'Fielder Catch', val: 1.46 },
                  { label: 'Bowled', val: 4.30 },
                  { label: 'Keeper Catch', val: 7.00 },
                  { label: 'LBW', val: 11.00 },
                  { label: 'Run Out', val: 10.00 },
                  { label: 'Stumped', val: 21.00 },
                  { label: 'Other', val: 100.00 }
                ].map(item => (
                  <button
                    key={item.label}
                    className="market-odds-btn"
                    onClick={() => handleOddsClick('1st Dismissal Method', item.label, item.val)}
                  >
                    <span className="market-label">{item.label}</span>
                    <span className="market-val">{item.val.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Player Total Runs (Over / Under) */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'player-props') && (
            <div className="market-box">
              <div className="market-title">
                <span>Player Performance & Total Runs (Over/Under)</span>
              </div>
              {playerList.map(player => (
                <div key={player.name} className="market-subgroup">
                  <div className="market-subtitle">1st innings - {player.name} total runs</div>
                  <div className="market-odds-grid two-col">
                    <button
                      className="market-odds-btn"
                      onClick={() => handleOddsClick(`${player.name} Total Runs`, `Over ${player.line}`, player.overOdds)}
                    >
                      <span className="market-label">Over {player.line}</span>
                      <span className="market-val">{player.overOdds}</span>
                    </button>
                    <button
                      className="market-odds-btn"
                      onClick={() => handleOddsClick(`${player.name} Total Runs`, `Under ${player.line}`, player.underOdds)}
                    >
                      <span className="market-label">Under {player.line}</span>
                      <span className="market-val">{player.underOdds}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 4. Player To Score 50 / 100 */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'player-props') && (
            <div className="market-box">
              <div className="market-title">
                <span>Player To Score 50</span>
              </div>
              {playerList.slice(0, 3).map(player => (
                <div key={player.name} className="market-subgroup">
                  <div className="market-subtitle">1st innings - {player.name} to score 50</div>
                  <div className="market-odds-grid two-col">
                    <button
                      className="market-odds-btn"
                      onClick={() => handleOddsClick(`${player.name} to Score 50`, 'Yes', player.yes50)}
                    >
                      <span className="market-label">Yes</span>
                      <span className="market-val">{player.yes50}</span>
                    </button>
                    <button
                      className="market-odds-btn"
                      onClick={() => handleOddsClick(`${player.name} to Score 50`, 'No', player.no50)}
                    >
                      <span className="market-label">No</span>
                      <span className="market-val">{player.no50}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 5. Team with Top Batter & Top Bowler */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'specials') && (
            <>
              <div className="market-box">
                <div className="market-title">
                  <span>Team with Top Batter</span>
                </div>
                <div className="market-odds-grid two-col">
                  <button
                    className="market-odds-btn"
                    onClick={() => handleOddsClick('Team Top Batter', team1Name, 1.70)}
                  >
                    <span className="market-label">{team1Name}</span>
                    <span className="market-val">1.70</span>
                  </button>
                  <button
                    className="market-odds-btn"
                    onClick={() => handleOddsClick('Team Top Batter', team2Name, 1.99)}
                  >
                    <span className="market-label">{team2Name}</span>
                    <span className="market-val">1.99</span>
                  </button>
                </div>
              </div>

              <div className="market-box">
                <div className="market-title">
                  <span>Any player to score 100 in match</span>
                </div>
                <div className="market-odds-grid two-col">
                  <button
                    className="market-odds-btn"
                    onClick={() => handleOddsClick('Any Player Score 100', 'Yes', 6.40)}
                  >
                    <span className="market-label">Yes</span>
                    <span className="market-val">6.40</span>
                  </button>
                  <button
                    className="market-odds-btn"
                    onClick={() => handleOddsClick('Any Player Score 100', 'No', 1.05)}
                  >
                    <span className="market-label">No</span>
                    <span className="market-val">1.05</span>
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
