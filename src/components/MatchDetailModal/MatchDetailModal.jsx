import { useState } from 'react';
import { IoClose, IoLockClosed } from 'react-icons/io5';
import { useBetSlip } from '../../context/BetSlipContext';
import './MatchDetailModal.css';

// Roster database for realistic player names across sports
const teamRosters = {
  'South Africa E...': ['Tristan Stubbs', 'Dewald Brevis', 'Bryce Parsons', 'Matthew Breetzke'],
  'Bangladesh Em...': ['Towhid Hridoy', 'Tanzid Hasan', 'Parvez Hossain', 'Shamim Hossain'],
  'West Delhi Lions': ['Hiten Dalal', 'Nitish Rana', 'Himmat Singh', 'Shivam Gupta'],
  'New Delhi Tigers': ['Kshitiz Sharma', 'Himanshu Chauhan', 'Vaibhav Kandpal', 'Prince Yadav'],
  'Hermes-Dvs': ['Daniel Doyle', 'Ashley Pringle', 'Ralph Elenbaas', 'Sebastiaan Braat'],
  'Rotterdam Cric...': ['Bas de Leede', 'Vikramjit Singh', 'Logan van Beek', 'Max O\'Dowd'],
  'Kenya': ['Rakep Patel', 'Collins Obuya', 'Alex Obanda', 'Shem Ngoche'],
  'Bahrain': ['Haider Ali', 'Sarfraz Ali', 'Sathaiya Veerapathiran', 'Junaid Niazi'],
  'Manchester City': ['Erling Haaland', 'Kevin De Bruyne', 'Phil Foden', 'Julian Alvarez'],
  'Arsenal': ['Bukayo Saka', 'Martin Odegaard', 'Gabriel Jesus', 'Kai Havertz'],
  'Real Madrid': ['Vinicius Jr', 'Jude Bellingham', 'Rodrygo', 'Kylian Mbappe'],
  'Barcelona': ['Robert Lewandowski', 'Lamine Yamal', 'Raphinha', 'Pedri'],
  'LA Lakers': ['LeBron James', 'Anthony Davis', 'Austin Reaves', 'D\'Angelo Russell'],
  'Boston Celtics': ['Jayson Tatum', 'Jaylen Brown', 'Kristaps Porzingis', 'Derrick White'],
  'Inter Miami': ['Lionel Messi', 'Luis Suarez', 'Sergio Busquets', 'Jordi Alba'],
  'Colombo Strikers': ['Thisara Perera', 'Nuwan Thushara', 'Dunith Wellalage', 'Chamika Karunaratne'],
  'Galle Gladiators': ['Bhanuka Rajapaksa', 'Isuru Udana', 'Kusal Mendis', 'Tabraiz Shamsi']
};

export default function MatchDetailModal({ match, isOpen, onClose }) {
  const { addBet } = useBetSlip();
  const [activeMarketCategory, setActiveMarketCategory] = useState('all');

  if (!isOpen || !match) return null;

  const team1Name = match.team1.name;
  const team2Name = match.team2.name;
  const sport = match.sport || 'cricket';

  // Get dynamic player names for both teams
  const team1Players = teamRosters[team1Name] || [`${match.team1.shortName} Opener`, `${match.team1.shortName} Captain`, `${match.team1.shortName} Batter 3`, `${match.team1.shortName} All-Rounder`];
  const team2Players = teamRosters[team2Name] || [`${match.team2.shortName} Opener`, `${match.team2.shortName} Captain`, `${match.team2.shortName} Batter 3`, `${match.team2.shortName} All-Rounder`];

  // Innings detection for Cricket
  // In our live simulation: if team2 has a completed score (e.g. Bangladesh 132/4) and team1 is currently batting (e.g. SA 38/3), we are in 2nd Innings!
  const isSecondInnings = sport === 'cricket' && match.isLive && match.liveDetails && match.liveDetails.score2 !== undefined && match.liveDetails.runs !== undefined;

  // Half time detection for Soccer
  const isSecondHalf = sport === 'soccer' && match.isLive && (match.liveDetails?.minute || 0) > 45;

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
                {sport === 'cricket' && `${match.liveDetails.runs || 38}/${match.liveDetails.wickets || 3}`}
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
                LIVE {
                  sport === 'cricket' ? (isSecondInnings ? `(2nd Inn - ${match.liveDetails?.overs || '1.2'} Ov)` : `(1st Inn - ${match.liveDetails?.overs || '14.2'} Ov)`) :
                  sport === 'soccer' ? `(${match.liveDetails?.minute || '74'}' ${isSecondHalf ? '2nd Half' : '1st Half'})` :
                  sport === 'basketball' ? `(${match.liveDetails?.quarter || '4th Qtr'})` : '(In Play)'
                }
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

        {/* Markets Content List - Minute Detail & Innings Aware */}
        <div className="market-content">

          {/* 1. Main Winner Market */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'main') && (
            <div className="market-box">
              <div className="market-title">
                <span>{sport === 'soccer' ? 'Full Time 1X2' : 'Match Winner (incl. Super Over)'}</span>
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
              {/* 2nd Innings Active Markets (when 1st innings is finished) */}
              {isSecondInnings ? (
                <>
                  {/* Settled 1st Innings Banner */}
                  <div className="market-box settled-box">
                    <div className="market-title" style={{ color: '#94a3b8' }}>
                      <span><IoLockClosed style={{ marginRight: '4px' }} /> 1st Innings Markets</span>
                      <span className="settled-badge">SETTLED (1st Inn: {team2Name} {match.liveDetails.score2}/{match.liveDetails.wickets2 || 4})</span>
                    </div>
                  </div>

                  {/* Active 2nd Innings Markets */}
                  {(activeMarketCategory === 'all' || activeMarketCategory === 'props') && (
                    <div className="market-box">
                      <div className="market-title"><span>2nd Innings - Next Wicket Dismissal Method</span></div>
                      <div className="market-odds-grid multi-col">
                        {[
                          { label: 'Fielder Catch', val: 1.52 },
                          { label: 'Bowled', val: 3.80 },
                          { label: 'Keeper Catch', val: 6.50 },
                          { label: 'LBW', val: 9.50 },
                          { label: 'Run Out', val: 12.00 },
                          { label: 'Stumped', val: 18.00 }
                        ].map(item => (
                          <button key={item.label} className="market-odds-btn" onClick={() => handleOddsClick('2nd Inn Wicket Method', item.label, item.val)}>
                            <span className="market-label">{item.label}</span>
                            <span className="market-val">{item.val.toFixed(2)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(activeMarketCategory === 'all' || activeMarketCategory === 'totals') && (
                    <div className="market-box">
                      <div className="market-title"><span>2nd Innings - Active Batsmen Total Runs</span></div>
                      {team1Players.slice(0, 3).map((player, idx) => {
                        const line = (18.5 + idx * 6).toFixed(1);
                        return (
                          <div key={player} className="market-subgroup">
                            <div className="market-subtitle">2nd innings - {player} total runs</div>
                            <div className="market-odds-grid two-col">
                              <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} 2nd Inn Runs`, `Over ${line}`, 1.83)}>
                                <span className="market-label">Over {line}</span>
                                <span className="market-val">1.83</span>
                              </button>
                              <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} 2nd Inn Runs`, `Under ${line}`, 1.83)}>
                                <span className="market-label">Under {line}</span>
                                <span className="market-val">1.83</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                /* 1st Innings Active Markets */
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
                      <div className="market-title"><span>1st Innings - Player Total Runs ({team1Name})</span></div>
                      {team1Players.map((player, idx) => {
                        const line = (16.5 + idx * 5).toFixed(1);
                        return (
                          <div key={player} className="market-subgroup">
                            <div className="market-subtitle">1st innings - {player} total runs</div>
                            <div className="market-odds-grid two-col">
                              <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} Total Runs`, `Over ${line}`, 1.83)}>
                                <span className="market-label">Over {line}</span>
                                <span className="market-val">1.83</span>
                              </button>
                              <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} Total Runs`, `Under ${line}`, 1.83)}>
                                <span className="market-label">Under {line}</span>
                                <span className="market-val">1.83</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Player 50s & Player 100s with REAL Player Names */}
              {(activeMarketCategory === 'all' || activeMarketCategory === 'props') && (
                <div className="market-box">
                  <div className="market-title"><span>Player To Score 50 ({team1Name} & {team2Name})</span></div>
                  {[...team1Players.slice(0, 2), ...team2Players.slice(0, 2)].map(player => (
                    <div key={player} className="market-subgroup">
                      <div className="market-subtitle">{player} to score 50 in match</div>
                      <div className="market-odds-grid two-col">
                        <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} to Score 50`, 'Yes', 3.40)}>
                          <span className="market-label">{player} - Yes</span>
                          <span className="market-val">3.40</span>
                        </button>
                        <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} to Score 50`, 'No', 1.26)}>
                          <span className="market-label">{player} - No</span>
                          <span className="market-val">1.26</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* SOCCER SPECIFIC MARKETS WITH REAL PLAYERS */}
          {(sport === 'soccer' || sport === 'esoccer') && (
            <>
              {isSecondHalf && (
                <div className="market-box settled-box">
                  <div className="market-title" style={{ color: '#94a3b8' }}>
                    <span><IoLockClosed style={{ marginRight: '4px' }} /> 1st Half Markets</span>
                    <span className="settled-badge">SETTLED (1st Half Complete)</span>
                  </div>
                </div>
              )}

              {(activeMarketCategory === 'all' || activeMarketCategory === 'props') && (
                <div className="market-box">
                  <div className="market-title"><span>Anytime Goalscorer</span></div>
                  {[...team1Players.slice(0, 2), ...team2Players.slice(0, 2)].map(player => (
                    <div key={player} className="market-subgroup">
                      <div className="market-subtitle">{player} to score anytime</div>
                      <div className="market-odds-grid two-col">
                        <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} Goalscorer`, 'Yes', 2.40)}>
                          <span className="market-label">{player} to Score</span>
                          <span className="market-val">2.40</span>
                        </button>
                        <button className="market-odds-btn" onClick={() => handleOddsClick(`${player} Goalscorer`, 'First Goal', 5.50)}>
                          <span className="market-label">{player} First Goal</span>
                          <span className="market-val">5.50</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
