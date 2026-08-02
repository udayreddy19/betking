import { useState, useEffect } from 'react';
import { IoClose } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import { isMatchBettable, isMatchLive } from '../../utils/matchBetting';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import './MatchDetailModal.css';

// Roster database for realistic player names across sports
const teamRosters = {
  'South Africa E...': ['Tristan Stubbs', 'Dewald Brevis', 'Bryce Parsons', 'Matthew Breetzke'],
  'Bangladesh Em...': ['Towhid Hridoy', 'Tanzid Hasan', 'Parvez Hossain', 'Shamim Hossain'],
  'West Delhi Lions': ['Hiten Dalal', 'Nitish Rana', 'Himmat Singh', 'Shivam Gupta'],
  'New Delhi Tigers': ['Kshitiz Sharma', 'Himanshu Chauhan', 'Vaibhav Kandpal', 'Prince Yadav'],
  'Kenya': ['SR Bhudia', 'RR Patel', 'Rakep Patel', 'Alex Obanda'],
  'Bahrain': ['Haider Ali', 'Sarfraz Ali', 'Rizwan Butt', 'Junaid Niazi'],
  'Manchester City': ['Erling Haaland', 'Kevin De Bruyne', 'Phil Foden', 'Julian Alvarez'],
  'Arsenal': ['Bukayo Saka', 'Martin Odegaard', 'Gabriel Jesus', 'Kai Havertz'],
  'Real Madrid': ['Vinicius Jr', 'Jude Bellingham', 'Rodrygo', 'Kylian Mbappe'],
  'Barcelona': ['Robert Lewandowski', 'Lamine Yamal', 'Raphinha', 'Pedri'],
  'LA Lakers': ['LeBron James', 'Anthony Davis', 'Austin Reaves', 'D\'Angelo Russell'],
  'Boston Celtics': ['Jayson Tatum', 'Jaylen Brown', 'Kristaps Porzingis', 'Derrick White']
};

export default function MatchDetailModal({ match, isOpen, onClose }) {
  const { addBet, isBetSelected, betCount } = useBetSlip();
  const [activeMarketCategory, setActiveMarketCategory] = useState('all');

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !match) return null;

  const canBet = isMatchBettable(match);
  const isLiveNow = isMatchLive(match);

  const team1Name = match.team1.name;
  const team2Name = match.team2.name;
  const sport = match.sport || 'cricket';

  // Dynamic player names
  const team1Players = teamRosters[team1Name] || [`${match.team1.shortName} Opener`, `${match.team1.shortName} Captain`, `${match.team1.shortName} Batter 3`, `${match.team1.shortName} All-Rounder`];
  const team2Players = teamRosters[team2Name] || [`${match.team2.shortName} Opener`, `${match.team2.shortName} Captain`, `${match.team2.shortName} Batter 3`, `${match.team2.shortName} All-Rounder`];

  // Innings detection for Cricket
  const isSecondInnings = sport === 'cricket' && isLiveNow && match.liveDetails && match.liveDetails.score2 !== undefined && match.liveDetails.runs !== undefined;
  const targetScore = (match.liveDetails?.score2 || 0) + 1;
  const currentScore = match.liveDetails?.runs || 0;
  const wicketsLost = match.liveDetails?.wickets || 0;
  const reqRuns = Math.max(0, targetScore - currentScore);
  const oversDone = match.liveDetails?.overs || '0.0';

  const handleOddsClick = (arg1, arg2, arg3, arg4) => {
    let e;
    let selection;
    let odds;
    let selectionName;

    if (arg1?.stopPropagation) {
      e = arg1;
      selection = arg2;
      odds = arg3;
      selectionName = arg4;
    } else {
      // Legacy prop-market calls: (marketName, label, odds)
      selection = `${arg1}:${arg2}`;
      odds = arg3;
      selectionName = String(arg2);
    }

    e?.stopPropagation?.();
    if (!canBet) return;
    const marketName = typeof arg1 === 'string' && !arg1?.stopPropagation ? arg1 : 'Match Winner';
    addBet(match, selection, odds, selectionName, { singlePerMatch: true, skipMobileOpen: true, marketName });
  };

  const propOddsBtnClass = (marketName, label) => {
    const selection = `${marketName}:${label}`;
    return `market-odds-btn ${isBetSelected(match.id, selection) ? 'selected' : ''}`;
  };

  const oddsBtnClass = (selection) =>
    `market-odds-btn ${isBetSelected(match.id, selection) ? 'selected' : ''}`;

  return (
    <div className="match-detail-overlay" onClick={onClose} role="presentation">
      <div
        className={`match-detail-modal ${betCount > 0 ? 'has-betslip' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${team1Name} vs ${team2Name}`}
      >
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

        {/* 10CRIC Style Live Scoreboard Header */}
        <div className="match-detail-scoreboard">
          <div className="scoreboard-team">
            <span className="scoreboard-jersey" style={{ color: match.team1.color }}>👕</span>
            <h4>{team1Name}</h4>
            {isLiveNow && match.liveDetails && (
              <div className="scoreboard-score">
                {sport === 'cricket' && `${currentScore}/${wicketsLost}`}
                {sport === 'soccer' && (match.liveDetails.score1 ?? 2)}
                {sport === 'basketball' && (match.liveDetails.score1 ?? 94)}
              </div>
            )}
          </div>

          <div className="scoreboard-vs">
            {isLiveNow ? (
              <div className="scoreboard-live-badge">
                <span className="live-pulse" />
                LIVE {
                  sport === 'cricket' ? (isSecondInnings ? `(INN 2 | ${oversDone}/20 OV)` : `(INN 1 | ${oversDone}/20 OV)`) :
                  sport === 'soccer' ? `(${match.liveDetails?.minute || '74'}' In Play)` : '(In Play)'
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
            {isLiveNow && match.liveDetails && (
              <div className="scoreboard-score">
                {sport === 'cricket' && `${match.liveDetails.score2 || 148}/${match.liveDetails.wickets2 || 5}`}
                {sport === 'soccer' && (match.liveDetails.score2 ?? 1)}
                {sport === 'basketball' && (match.liveDetails.score2 ?? 88)}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable body: live stats, market tabs, and markets */}
        <div className="match-detail-scroll">
        {/* 10CRIC Live Cricket Scorecard & Match Center Bar */}
        {sport === 'cricket' && isLiveNow && (
          <div className="cricket-live-center">
            <div className="cricket-chase-pill">
              {isSecondInnings
                ? `⚡ ${team1Name} (${currentScore}/${wicketsLost}) require ${reqRuns} runs from 69 balls.`
                : `⚡ 1st Innings in progress: ${team1Name} ${currentScore}/${wicketsLost} (${oversDone}/20 Ov)`}
            </div>

            {/* Live Batter & Bowler Table */}
            <div className="cricket-live-tables">
              <div className="cricket-table-box">
                <div className="cricket-table-title">BATTER</div>
                <table className="cricket-mini-table">
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>R</th>
                      <th>B</th>
                      <th>4S</th>
                      <th>6S</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{team1Players[0] || 'SR Bhudia'} *</td>
                      <td>{Math.floor(currentScore * 0.3)}</td>
                      <td>18</td>
                      <td>3</td>
                      <td>1</td>
                    </tr>
                    <tr>
                      <td>{team1Players[1] || 'RR Patel'}</td>
                      <td>{Math.floor(currentScore * 0.2)}</td>
                      <td>12</td>
                      <td>2</td>
                      <td>0</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="cricket-table-box">
                <div className="cricket-table-title">CURRENT BOWLER & STATS</div>
                <div className="bowler-stat-row">
                  <span>Bowler: <strong>{team2Players[2] || 'Rizwan Butt'}</strong></span>
                </div>
                <div className="innings-stats-grid">
                  <div><span>Fours:</span> <strong>9</strong></div>
                  <div><span>Sixes:</span> <strong>3</strong></div>
                  <div><span>Extras:</span> <strong>8</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Market Category Filter Tabs */}
        <div className="market-tabs">
          {['all', 'main', 'overs-deliveries', 'player-props', 'specials'].map(cat => (
            <button
              key={cat}
              className={`market-tab ${activeMarketCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveMarketCategory(cat)}
            >
              {cat === 'all' && 'All Markets'}
              {cat === 'main' && 'Main / Winner'}
              {cat === 'overs-deliveries' && (sport === 'cricket' ? 'Overs & Deliveries' : 'Interval Markets')}
              {cat === 'player-props' && 'Player Props'}
              {cat === 'specials' && 'Specials'}
            </button>
          ))}
        </div>

        {!canBet && (
          <div className="match-detail-suspended">
            Markets are closed for this match.
          </div>
        )}

        {/* Markets Content List - 10CRIC Style */}
        <div className="market-content">

          {/* 1. Main Winner Market */}
          {(activeMarketCategory === 'all' || activeMarketCategory === 'main') && (
            <div className="market-box">
              <div className="market-title">
                <span>Winner (incl. super over)</span>
                <span className="market-cashout">CASHOUT AVAILABLE</span>
              </div>
              <div className={`market-odds-grid ${match.odds.draw !== undefined ? 'three-col' : 'two-col'}`}>
                <button
                  type="button"
                  className={oddsBtnClass('1')}
                  disabled={!canBet}
                  onClick={(e) => handleOddsClick(e, '1', match.odds.team1)}
                >
                  <span className="market-label">{team1Name}</span>
                  <span className="market-val">{Number(match.odds.team1).toFixed(2)}</span>
                </button>
                {match.odds.draw !== undefined && (
                  <button
                    type="button"
                    className={oddsBtnClass('X')}
                    disabled={!canBet}
                    onClick={(e) => handleOddsClick(e, 'X', match.odds.draw)}
                  >
                    <span className="market-label">Draw</span>
                    <span className="market-val">{Number(match.odds.draw).toFixed(2)}</span>
                  </button>
                )}
                <button
                  type="button"
                  className={oddsBtnClass('2')}
                  disabled={!canBet}
                  onClick={(e) => handleOddsClick(e, '2', match.odds.team2)}
                >
                  <span className="market-label">{team2Name}</span>
                  <span className="market-val">{Number(match.odds.team2).toFixed(2)}</span>
                </button>
              </div>
            </div>
          )}

          {/* CRICKET SPECIFIC 10CRIC MARKETS */}
          {(sport === 'cricket' || sport === 'virtual-cricket') && (
            <>
              {/* Over-by-Over & Ball-by-Ball Delivery Markets */}
              {(activeMarketCategory === 'all' || activeMarketCategory === 'overs-deliveries') && (
                <>
                  <div className="market-box">
                    <div className="market-title"><span>{isSecondInnings ? '2nd' : '1st'} innings over 10 - {team1Name} total</span></div>
                    <div className="market-odds-grid two-col">
                      <button type="button" className={propOddsBtnClass('Over 10 Total', 'Over 6.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 10 Total', 'Over 6.5', 2.06)}>
                        <span className="market-label">Over 6.5</span>
                        <span className="market-val">2.06</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 10 Total', 'Under 6.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 10 Total', 'Under 6.5', 1.63)}>
                        <span className="market-label">Under 6.5</span>
                        <span className="market-val">1.63</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 10 Total', 'Over 7.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 10 Total', 'Over 7.5', 2.66)}>
                        <span className="market-label">Over 7.5</span>
                        <span className="market-val">2.66</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 10 Total', 'Under 7.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 10 Total', 'Under 7.5', 1.38)}>
                        <span className="market-label">Under 7.5</span>
                        <span className="market-val">1.38</span>
                      </button>
                    </div>
                  </div>

                  <div className="market-box">
                    <div className="market-title"><span>{isSecondInnings ? '2nd' : '1st'} innings over 11 - {team1Name} total</span></div>
                    <div className="market-odds-grid two-col">
                      <button type="button" className={propOddsBtnClass('Over 11 Total', 'Over 6.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 11 Total', 'Over 6.5', 2.00)}>
                        <span className="market-label">Over 6.5</span>
                        <span className="market-val">2.00</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 11 Total', 'Under 6.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 11 Total', 'Under 6.5', 1.66)}>
                        <span className="market-label">Under 6.5</span>
                        <span className="market-val">1.66</span>
                      </button>
                    </div>
                  </div>

                  <div className="market-box">
                    <div className="market-title"><span>{isSecondInnings ? '2nd' : '1st'} innings overs 0 to 12 - {team1Name} total</span></div>
                    <div className="market-odds-grid two-col">
                      <button type="button" className={propOddsBtnClass('Overs 0-12 Total', 'Over 92.5')} disabled={!canBet} onClick={() => handleOddsClick('Overs 0-12 Total', 'Over 92.5', 1.80)}>
                        <span className="market-label">Over 92.5</span>
                        <span className="market-val">1.80</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Overs 0-12 Total', 'Under 92.5')} disabled={!canBet} onClick={() => handleOddsClick('Overs 0-12 Total', 'Under 92.5', 1.80)}>
                        <span className="market-label">Under 92.5</span>
                        <span className="market-val">1.80</span>
                      </button>
                    </div>
                  </div>

                  {/* Ball-by-Ball Delivery Odds */}
                  <div className="market-box">
                    <div className="market-title"><span>{isSecondInnings ? '2nd' : '1st'} innings over 9 - 5th delivery {team1Name} total</span></div>
                    <div className="market-odds-grid multi-col">
                      <button type="button" className={propOddsBtnClass('Over 9 Ball 5', 'Over 0.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 9 Ball 5', 'Over 0.5', 1.42)}>
                        <span className="market-label">Over 0.5</span>
                        <span className="market-val">1.42</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 9 Ball 5', 'Under 0.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 9 Ball 5', 'Under 0.5', 2.28)}>
                        <span className="market-label">Under 0.5</span>
                        <span className="market-val">2.28</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 9 Ball 5', 'Over 1.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 9 Ball 5', 'Over 1.5', 4.00)}>
                        <span className="market-label">Over 1.5</span>
                        <span className="market-val">4.00</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 9 Ball 5', 'Over 3.5')} disabled={!canBet} onClick={() => handleOddsClick('Over 9 Ball 5', 'Over 3.5', 6.00)}>
                        <span className="market-label">Over 3.5</span>
                        <span className="market-val">6.00</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Player Props */}
              {(activeMarketCategory === 'all' || activeMarketCategory === 'player-props') && (
                <div className="market-box">
                  <div className="market-title"><span>Player Performance Props</span></div>
                  {team1Players.slice(0, 2).map((player, idx) => {
                    const line = (17.5 + idx * 8).toFixed(1);
                    return (
                      <div key={player} className="market-subgroup">
                        <div className="market-subtitle">{player} total runs</div>
                        <div className="market-odds-grid two-col">
                          <button type="button" className={propOddsBtnClass(`${player} Total Runs`, `Over ${line}`)} disabled={!canBet} onClick={() => handleOddsClick(`${player} Total Runs`, `Over ${line}`, 1.83)}>
                            <span className="market-label">Over {line}</span>
                            <span className="market-val">1.83</span>
                          </button>
                          <button type="button" className={propOddsBtnClass(`${player} Total Runs`, `Under ${line}`)} disabled={!canBet} onClick={() => handleOddsClick(`${player} Total Runs`, `Under ${line}`, 1.83)}>
                            <span className="market-label">Under {line}</span>
                            <span className="market-val">1.83</span>
                          </button>
                        </div>
                      </div>
                    );
                    })}
                </div>
              )}

              {/* Dismissal Method & Odd/Even Specials */}
              {(activeMarketCategory === 'all' || activeMarketCategory === 'specials') && (
                <>
                  <div className="market-box">
                    <div className="market-title"><span>{team1Name} total at 4th dismissal</span></div>
                    <div className="market-odds-grid two-col">
                      <button type="button" className={propOddsBtnClass('4th Dismissal Total', 'Over 89.5')} disabled={!canBet} onClick={() => handleOddsClick('4th Dismissal Total', 'Over 89.5', 1.82)}>
                        <span className="market-label">Over 89.5</span>
                        <span className="market-val">1.82</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('4th Dismissal Total', 'Under 89.5')} disabled={!canBet} onClick={() => handleOddsClick('4th Dismissal Total', 'Under 89.5', 1.82)}>
                        <span className="market-label">Under 89.5</span>
                        <span className="market-val">1.82</span>
                      </button>
                    </div>
                  </div>

                  <div className="market-box">
                    <div className="market-title"><span>Over 10 Total Runs - Odd/Even</span></div>
                    <div className="market-odds-grid two-col">
                      <button type="button" className={propOddsBtnClass('Over 10 Odd/Even', 'Odd')} disabled={!canBet} onClick={() => handleOddsClick('Over 10 Odd/Even', 'Odd', 1.82)}>
                        <span className="market-label">Odd</span>
                        <span className="market-val">1.82</span>
                      </button>
                      <button type="button" className={propOddsBtnClass('Over 10 Odd/Even', 'Even')} disabled={!canBet} onClick={() => handleOddsClick('Over 10 Odd/Even', 'Even', 1.82)}>
                        <span className="market-label">Even</span>
                        <span className="market-val">1.82</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* SOCCER / BASKETBALL MARKETS */}
          {sport !== 'cricket' && sport !== 'virtual-cricket' && (
            <div className="market-box">
              <div className="market-title"><span>Match Props</span></div>
              <div className="market-odds-grid two-col">
                <button type="button" className={propOddsBtnClass('Both Teams to Score', 'Yes')} disabled={!canBet} onClick={() => handleOddsClick('Both Teams to Score', 'Yes', 1.80)}>
                  <span className="market-label">Both Teams Score: Yes</span>
                  <span className="market-val">1.80</span>
                </button>
                <button type="button" className={propOddsBtnClass('Both Teams to Score', 'No')} disabled={!canBet} onClick={() => handleOddsClick('Both Teams to Score', 'No', 2.00)}>
                  <span className="market-label">Both Teams Score: No</span>
                  <span className="market-val">2.00</span>
                </button>
              </div>
            </div>
          )}

        </div>

        </div>

        <BetSlipFooter variant="modal" onPlaced={onClose} />
      </div>
    </div>
  );
}
