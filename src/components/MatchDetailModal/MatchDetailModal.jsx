import { useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { useBetSlip } from '../../context/BetSlipContext';
import './MatchDetailModal.css';

export default function MatchDetailModal({ match, isOpen, onClose }) {
  const { addBet } = useBetSlip();
  const [activeMarketCategory, setActiveMarketCategory] = useState('all');

  if (!isOpen || !match) return null;

  const team1Name = match.team1.name;
  const team2Name = match.team2.name;
  const sport = match.sport || 'cricket';

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
            <span className="match-detail-sport-tag">{sport.toUpperCase()}</span>
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
              <div className="scoreboard-score">
                {sport === 'cricket' && `${match.liveDetails.runs || 145}/${match.liveDetails.wickets || 3}`}
                {sport === 'soccer' && (match.liveDetails.score1 ?? 2)}
                {sport === 'basketball' && (match.liveDetails.score1 ?? 94)}
                {sport !== 'cricket' && sport !== 'soccer' && sport !== 'basketball' && (match.liveDetails.score1 ?? 1)}
              </div>
            )}
          </div>

          <div className="scoreboard-vs">
            {match.isLive ? (
              <div className="scoreboard-live-badge">
                <span className="live-pulse" />
                LIVE ({
                  sport === 'cricket' ? `${match.liveDetails?.overs || '14.2'} Ov` :
                  sport === 'soccer' ? `${match.liveDetails?.minute || '74'}'` :
                  sport === 'basketball' ? (match.liveDetails?.quarter || '4th Qtr') : 'In Play'
                })
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
              <div className="scoreboard-score">
                {sport === 'cricket' && `${match.liveDetails.score2 || 132}/${match.liveDetails.wickets2 || 4}`}
                {sport === 'soccer' && (match.liveDetails.score2 ?? 1)}
                {sport === 'basketball' && (match.liveDetails.score2 ?? 88)}
                {sport !== 'cricket' && sport !== 'soccer' && sport !== 'basketball' && (match.liveDetails.score2 ?? 0)}
              </div>
            )}
          </div>
        </div>

        {match.isLive && match.liveDetails?.commentary && (
          <div className="match-detail-commentary">
            ⚡ {match.liveDetails.commentary}
          </div>
        )}

        {/* Market Category Filter Tabs */}
        <div className="market-tabs">
          {['all', 'main', 'props', 'totals', 'specials'].map(cat => (
            <button
              key={cat}
              className={`market-tab ${activeMarketCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveMarketCategory(cat)}
            >
              {cat === 'all' && 'All Markets'}
              {cat === 'main' && 'Main / Winner'}
              {cat === 'props' && (sport === 'cricket' ? 'Player Props' : 'Game Props')}
              {cat === 'totals' && 'Over / Under Totals'}
              {cat === 'specials' && 'Specials'}
            </button>
          ))}
        </div>

        {/* Markets Content List - Sport Aware */}
        <div className="market-content">

          {/* 1. Main Winner Market */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'main') && (
            <div className="market-box">
              <div className="market-title">
                <span>{sport === 'soccer' ? 'Full Time 1X2' : 'Match Winner'}</span>
                <span className="market-cashout">CASHOUT AVAILABLE</span>
              </div>
              <div className={`market-odds-grid ${match.odds.draw !== undefined ? 'three-col' : 'two-col'}`}>
                <button className="market-odds-btn" onClick={() => handleOddsClick('Match Winner', team1Name, match.odds.team1)}>
                  <span className="market-label">{team1Name}</span>
                  <span className="market-val">{match.odds.team1.toFixed(2)}</span>
                </button>
                {match.odds.draw !== undefined && (
                  <button className="market-odds-btn" onClick={() => handleOddsClick('Match Winner', 'Draw', match.odds.draw)}>
                    <span className="market-label">Draw</span>
                    <span className="market-val">{match.odds.draw.toFixed(2)}</span>
                  </button>
                )}
                <button className="market-odds-btn" onClick={() => handleOddsClick('Match Winner', team2Name, match.odds.team2)}>
                  <span className="market-label">{team2Name}</span>
                  <span className="market-val">{match.odds.team2.toFixed(2)}</span>
                </button>
              </div>
            </div>
          )}

          {/* CRICKET SPECIFIC MARKETS */}
          {(sport === 'cricket' || sport === 'virtual-cricket') && (
            <>
              {(activeMarketCategory === 'all' || activeMarketCategory === 'props') && (
                <div className="market-box">
                  <div className="market-title"><span>1st Innings - 1st Dismissal Method</span></div>
                  <div className="market-odds-grid multi-col">
                    {[
                      { label: 'Fielder Catch', val: 1.46 },
                      { label: 'Bowled', val: 4.30 },
                      { label: 'Keeper Catch', val: 7.00 },
                      { label: 'LBW', val: 11.00 },
                      { label: 'Run Out', val: 10.00 },
                      { label: 'Stumped', val: 21.00 }
                    ].map(item => (
                      <button key={item.label} className="market-odds-btn" onClick={() => handleOddsClick('1st Dismissal', item.label, item.val)}>
                        <span className="market-label">{item.label}</span>
                        <span className="market-val">{item.val.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(activeMarketCategory === 'all' || activeMarketCategory === 'totals') && (
                <div className="market-box">
                  <div className="market-title"><span>Player Performance & Total Runs</span></div>
                  {[
                    { name: 'Nitish Rana', line: '24.5', over: 1.83, under: 1.83 },
                    { name: 'Himmat Singh', line: '24.5', over: 1.83, under: 1.83 },
                    { name: 'Hiten Dalal', line: '16.5', over: 1.83, under: 1.83 },
                    { name: 'Shivam Gupta', line: '19.5', over: 1.83, under: 1.83 }
                  ].map(p => (
                    <div key={p.name} className="market-subgroup">
                      <div className="market-subtitle">1st innings - {p.name} total runs</div>
                      <div className="market-odds-grid two-col">
                        <button className="market-odds-btn" onClick={() => handleOddsClick(`${p.name} Total`, `Over ${p.line}`, p.over)}>
                          <span className="market-label">Over {p.line}</span>
                          <span className="market-val">{p.over}</span>
                        </button>
                        <button className="market-odds-btn" onClick={() => handleOddsClick(`${p.name} Total`, `Under ${p.line}`, p.under)}>
                          <span className="market-label">Under {p.line}</span>
                          <span className="market-val">{p.under}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(activeMarketCategory === 'all' || activeMarketCategory === 'specials') && (
                <div className="market-box">
                  <div className="market-title"><span>Cricket Specials</span></div>
                  <div className="market-subgroup">
                    <div className="market-subtitle">Any Player to Score 100 in Match</div>
                    <div className="market-odds-grid two-col">
                      <button className="market-odds-btn" onClick={() => handleOddsClick('Player Score 100', 'Yes', 6.40)}>
                        <span className="market-label">Yes</span>
                        <span className="market-val">6.40</span>
                      </button>
                      <button className="market-odds-btn" onClick={() => handleOddsClick('Player Score 100', 'No', 1.05)}>
                        <span className="market-label">No</span>
                        <span className="market-val">1.05</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* SOCCER SPECIFIC MARKETS */}
          {(sport === 'soccer' || sport === 'esoccer') && (
            <>
              {(activeMarketCategory === 'all' || activeMarketCategory === 'props') && (
                <div className="market-box">
                  <div className="market-title"><span>Both Teams To Score (BTTS)</span></div>
                  <div className="market-odds-grid two-col">
                    <button className="market-odds-btn" onClick={() => handleOddsClick('Both Teams Score', 'Yes', 1.75)}>
                      <span className="market-label">Yes</span>
                      <span className="market-val">1.75</span>
                    </button>
                    <button className="market-odds-btn" onClick={() => handleOddsClick('Both Teams Score', 'No', 2.05)}>
                      <span className="market-label">No</span>
                      <span className="market-val">2.05</span>
                    </button>
                  </div>
                </div>
              )}

              {(activeMarketCategory === 'all' || activeMarketCategory === 'totals') && (
                <div className="market-box">
                  <div className="market-title"><span>Total Match Goals (Over / Under)</span></div>
                  <div className="market-subgroup">
                    <div className="market-subtitle">Over/Under 2.5 Goals</div>
                    <div className="market-odds-grid two-col">
                      <button className="market-odds-btn" onClick={() => handleOddsClick('Total Goals', 'Over 2.5', 1.85)}>
                        <span className="market-label">Over 2.5</span>
                        <span className="market-val">1.85</span>
                      </button>
                      <button className="market-odds-btn" onClick={() => handleOddsClick('Total Goals', 'Under 2.5', 1.95)}>
                        <span className="market-label">Under 2.5</span>
                        <span className="market-val">1.95</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(activeMarketCategory === 'all' || activeMarketCategory === 'specials') && (
                <div className="market-box">
                  <div className="market-title"><span>Correct Score</span></div>
                  <div className="market-odds-grid multi-col">
                    {[
                      { score: '1 - 0', val: 6.50 },
                      { score: '2 - 0', val: 8.50 },
                      { score: '2 - 1', val: 7.50 },
                      { score: '1 - 1', val: 6.00 },
                      { score: '0 - 1', val: 9.00 },
                      { score: '0 - 2', val: 12.00 }
                    ].map(s => (
                      <button key={s.score} className="market-odds-btn" onClick={() => handleOddsClick('Correct Score', s.score, s.val)}>
                        <span className="market-label">{s.score}</span>
                        <span className="market-val">{s.val.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* BASKETBALL SPECIFIC MARKETS */}
          {sport === 'basketball' && (
            <>
              {(activeMarketCategory === 'all' || activeMarketCategory === 'props') && (
                <div className="market-box">
                  <div className="market-title"><span>Point Spread (Handicap)</span></div>
                  <div className="market-odds-grid two-col">
                    <button className="market-odds-btn" onClick={() => handleOddsClick('Point Spread', `${team1Name} -4.5`, 1.90)}>
                      <span className="market-label">{team1Name} -4.5</span>
                      <span className="market-val">1.90</span>
                    </button>
                    <button className="market-odds-btn" onClick={() => handleOddsClick('Point Spread', `${team2Name} +4.5`, 1.90)}>
                      <span className="market-label">{team2Name} +4.5</span>
                      <span className="market-val">1.90</span>
                    </button>
                  </div>
                </div>
              )}

              {(activeMarketCategory === 'all' || activeMarketCategory === 'totals') && (
                <div className="market-box">
                  <div className="market-title"><span>Total Match Points (Over / Under)</span></div>
                  <div className="market-subgroup">
                    <div className="market-subtitle">Over/Under 218.5 Points</div>
                    <div className="market-odds-grid two-col">
                      <button className="market-odds-btn" onClick={() => handleOddsClick('Total Points', 'Over 218.5', 1.88)}>
                        <span className="market-label">Over 218.5</span>
                        <span className="market-val">1.88</span>
                      </button>
                      <button className="market-odds-btn" onClick={() => handleOddsClick('Total Points', 'Under 218.5', 1.88)}>
                        <span className="market-label">Under 218.5</span>
                        <span className="market-val">1.88</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TENNIS & TABLE TENNIS MARKETS */}
          {(sport === 'tennis' || sport === 'table-tennis') && (
            <>
              {(activeMarketCategory === 'all' || activeMarketCategory === 'props') && (
                <div className="market-box">
                  <div className="market-title"><span>1st Set Winner</span></div>
                  <div className="market-odds-grid two-col">
                    <button className="market-odds-btn" onClick={() => handleOddsClick('1st Set Winner', team1Name, 1.72)}>
                      <span className="market-label">{team1Name}</span>
                      <span className="market-val">1.72</span>
                    </button>
                    <button className="market-odds-btn" onClick={() => handleOddsClick('1st Set Winner', team2Name, 2.10)}>
                      <span className="market-label">{team2Name}</span>
                      <span className="market-val">2.10</span>
                    </button>
                  </div>
                </div>
              )}

              {(activeMarketCategory === 'all' || activeMarketCategory === 'totals') && (
                <div className="market-box">
                  <div className="market-title"><span>Total Games (Over / Under)</span></div>
                  <div className="market-odds-grid two-col">
                    <button className="market-odds-btn" onClick={() => handleOddsClick('Total Games', 'Over 22.5', 1.85)}>
                      <span className="market-label">Over 22.5</span>
                      <span className="market-val">1.85</span>
                    </button>
                    <button className="market-odds-btn" onClick={() => handleOddsClick('Total Games', 'Under 22.5', 1.95)}>
                      <span className="market-label">Under 22.5</span>
                      <span className="market-val">1.95</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* KABADDI MARKETS */}
          {sport === 'kabaddi' && (
            <div className="market-box">
              <div className="market-title"><span>Total Raid Points (Over / Under)</span></div>
              <div className="market-odds-grid two-col">
                <button className="market-odds-btn" onClick={() => handleOddsClick('Total Raid Points', 'Over 38.5', 1.82)}>
                  <span className="market-label">Over 38.5</span>
                  <span className="market-val">1.82</span>
                </button>
                <button className="market-odds-btn" onClick={() => handleOddsClick('Total Raid Points', 'Under 38.5', 1.82)}>
                  <span className="market-label">Under 38.5</span>
                  <span className="market-val">1.82</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
