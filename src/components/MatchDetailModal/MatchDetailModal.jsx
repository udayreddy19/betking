import { useState, useEffect, useMemo } from 'react';
import { IoClose } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import { isMatchBettable, isMatchLive } from '../../utils/matchBetting';
import { generateMatchMarkets } from '../../utils/oddsMarketsGenerator';
import { resolveCricketTeamScores, isCricketSecondInnings } from '../../utils/cricketScores';
import { getChaseText } from '../../utils/liveMatchWidgetData';
import { getMatchMaxOvers, isTestMatch, getTestMatchDayLabel, formatMatchCountdown } from '../../utils/cricketFormat';
import { getRosterForTeam } from '../../data/cricketRosters';
import { displayPlayerName } from '../../utils/cricketPlayers';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import TeamJersey from '../TeamJersey/TeamJersey';
import MatchCountdownTimer from '../MatchCountdownTimer/MatchCountdownTimer';
import LiveChartsWidget from '../LiveChartsWidget/LiveChartsWidget';
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
  const [builderLegs, setBuilderLegs] = useState([]);

  const toggleBuilderLeg = (label, odds) => {
    setBuilderLegs(prev => {
      const exists = prev.find(l => l.label === label);
      if (exists) return prev.filter(l => l.label !== label);
      if (prev.length >= 4) return prev;
      return [...prev, { label, odds: Number(odds) }];
    });
  };

  const builderCombinedOdds = useMemo(() => {
    if (!builderLegs.length) return 1.0;
    const product = builderLegs.reduce((acc, leg) => acc * leg.odds, 1);
    // Slight correlation discount factor for same match
    const discount = builderLegs.length > 1 ? 0.92 : 1.0;
    return Math.max(1.10, Math.round(product * discount * 100) / 100);
  }, [builderLegs]);


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

  const matchMarkets = useMemo(() => {
    return generateMatchMarkets(match);
  }, [match]);

  // Dynamic player names from realistic roster database
  const t1Roster = getRosterForTeam(team1Name);
  const t2Roster = getRosterForTeam(team2Name);
  const team1Players = t1Roster?.batters || [`${team1Name} Batter 1`, `${team1Name} Batter 2`, `${team1Name} Batter 3`, `${team1Name} Batter 4`];
  const team2Players = t2Roster?.batters || [`${team2Name} Batter 1`, `${team2Name} Batter 2`, `${team2Name} Batter 3`, `${team2Name} Batter 4`];

  // Dynamic Innings & Scores detection for Cricket
  const ld = match?.liveDetails || {};
  const cricketScores = resolveCricketTeamScores(match, ld);
  const isSecondInnings = isCricketSecondInnings(match, ld);
  const maxOvers = getMatchMaxOvers(match) || 20;

  const team1Score = cricketScores.team1;
  const team2Score = cricketScores.team2;
  const chaseText = getChaseText(match, { inningsNum: isSecondInnings ? 2 : 1, battingTeam: team2Name }, team1Name, team2Name);

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
        {(() => {
          const isTest = isTestMatch(match);
          const testDayBadge = isTest ? getTestMatchDayLabel(match) : null;
          const countdownText = !isLiveNow ? formatMatchCountdown(match) : null;

          return (
            <>
              <div className="match-detail-header">
                <div className="match-detail-league" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🌐 {match.league}</span>
                  <span className="match-detail-sport-tag">{sport.toUpperCase()}</span>
                  {isTest && testDayBadge && (
                    <span className="sports-test-day-badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                      📅 {testDayBadge}
                    </span>
                  )}
                </div>
                <button className="match-detail-close" onClick={onClose}>
                  <IoClose />
                </button>
              </div>

              {/* 10CRIC Style Live Scoreboard Header */}
              <div className="match-detail-scoreboard">
                <div className="scoreboard-team">
                  <TeamJersey team={match.team1} size={48} isFlying={isLiveNow && sport === 'cricket' && !isSecondInnings} />
                  <h4>{team1Name}</h4>
                  {isLiveNow && match.liveDetails && (
                    <div className="scoreboard-score">
                      {sport === 'cricket' && `${team1Score.runs}/${team1Score.wickets} (${team1Score.overs} ov)`}
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
                        sport === 'cricket' ? (testDayBadge ? `(${testDayBadge})` : (isSecondInnings ? `(INN 2 | ${team2Score.overs}/${maxOvers} OV)` : `(INN 1 | ${team1Score.overs}/${maxOvers} OV)`)) :
                        sport === 'soccer' ? `(${match.liveDetails?.minute || '74'}' In Play)` : '(In Play)'
                      }
                    </div>
                  ) : (
                    <div className="scoreboard-time">
                      <MatchCountdownTimer match={match} />
                    </div>
                  )}
                  <span className="vs-label">VS</span>
                </div>

                <div className="scoreboard-team">
                  <TeamJersey team={match.team2} size={48} isFlying={isLiveNow && sport === 'cricket' && isSecondInnings} />
                  <h4>{team2Name}</h4>
                  {isLiveNow && match.liveDetails && (
                    <div className="scoreboard-score">
                      {sport === 'cricket' && `${team2Score.runs}/${team2Score.wickets} (${team2Score.overs} ov)`}
                      {sport === 'soccer' && (match.liveDetails.score2 ?? 1)}
                      {sport === 'basketball' && (match.liveDetails.score2 ?? 88)}
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {/* Scrollable body: live stats, market tabs, and markets */}
        <div className="match-detail-scroll">
        {/* 10CRIC Live Cricket Scorecard & Match Center Bar */}
        {sport === 'cricket' && isLiveNow && (
          <div className="cricket-live-center">
            <div className="cricket-chase-pill">
              {chaseText
                ? `⚡ ${chaseText}`
                : isSecondInnings
                ? `⚡ 2nd Innings: ${team2Name} ${team2Score.runs}/${team2Score.wickets} (${team2Score.overs}/${maxOvers} Ov)`
                : `⚡ 1st Innings: ${team1Name} ${team1Score.runs}/${team1Score.wickets} (${team1Score.overs}/${maxOvers} Ov)`}
            </div>

            {(() => {
              const tossText = match.toss
                ? (typeof match.toss === 'string' ? match.toss : `${match.toss.winner || team1Name} won the toss & elected to ${match.toss.decision || 'bat'}`)
                : `${team1Name} won the toss & elected to bat`;
              return (
                <div className="cricket-toss-pill">
                  🪙 {tossText}
                </div>
              );
            })()}

            {/* Live Batter & Bowler Table */}
            {(() => {
              const ld = match.liveDetails || {};
              const b1 = ld.batter1 || {};
              const b2 = ld.batter2 || {};
              const b1Name = displayPlayerName(b1.name, team1Players[0], team1Name);
              const b2Name = displayPlayerName(b2.name, team1Players[1], team1Name);
              const bowlerName = displayPlayerName(ld.bowler?.name || ld.bowler, t2Roster?.bowlers?.[0] || team2Players[3], team2Name);
              const combinedFours = (b1.fours || 0) + (b2.fours || 0);
              const combinedSixes = (b1.sixes || 0) + (b2.sixes || 0);
              const fours = Math.max(ld.fours || 0, combinedFours);
              const sixes = Math.max(ld.sixes || 0, combinedSixes);
              const extras = ld.extras ?? 0;

              return (
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
                          <td>{b1Name} *</td>
                          <td>{b1.runs ?? 0}</td>
                          <td>{b1.balls ?? 0}</td>
                          <td>{b1.fours ?? 0}</td>
                          <td>{b1.sixes ?? 0}</td>
                        </tr>
                        <tr>
                          <td>{b2Name}</td>
                          <td>{b2.runs ?? 0}</td>
                          <td>{b2.balls ?? 0}</td>
                          <td>{b2.fours ?? 0}</td>
                          <td>{b2.sixes ?? 0}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="cricket-table-box">
                    <div className="cricket-table-title">CURRENT BOWLER & STATS</div>
                    <div className="bowler-stat-row">
                      <span>Bowler: <strong>{bowlerName}</strong></span>
                    </div>
                    <div className="innings-stats-grid">
                      <div><span>Fours:</span> <strong>{fours}</strong></div>
                      <div><span>Sixes:</span> <strong>{sixes}</strong></div>
                      <div><span>Extras:</span> <strong>{extras}</strong></div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Live Match Chart Analytics & Line Movement */}
        <LiveChartsWidget match={match} />

        {/* Market Category Filter Tabs */}
        <div className="market-tabs">
          {['all', 'main', 'overs-deliveries', 'player-props', 'specials', 'builder', 'insights'].map(cat => (
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
              {cat === 'builder' && '🛠️ Bet Builder'}
              {cat === 'insights' && '📊 Match Insights'}
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

          {/* DYNAMIC EXPANDED BETTING MARKETS */}
          {activeMarketCategory !== 'builder' && activeMarketCategory !== 'insights' && (
            matchMarkets.map((m) => {
              const isCatMatch = activeMarketCategory === 'all'
                || activeMarketCategory === 'main'
                || activeMarketCategory === m.category;
              if (!isCatMatch) return null;

              return (
                <div key={m.key} className="market-box">
                  <div className="market-title">
                    <span>{m.title}</span>
                    {m.key === 'winner' && <span className="market-cashout">CASHOUT AVAILABLE</span>}
                  </div>
                  <div className={`market-odds-grid ${m.options.length === 3 ? 'three-col' : (m.options.length === 4 ? 'four-col' : (m.options.length > 4 ? 'multi-col' : 'two-col'))}`}>
                    {m.options.map((opt) => (
                      <button
                        key={opt.selection}
                        type="button"
                        className={propOddsBtnClass(m.title, opt.name)}
                        disabled={!canBet}
                        onClick={(e) => handleOddsClick(e, opt.selection, opt.odds, opt.name)}
                      >
                        <span className="market-label">{opt.name}</span>
                        <span className="market-val">{Number(opt.odds).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {/* BET BUILDER UI VIEW */}
          {activeMarketCategory === 'builder' && (
            <div className="builder-view">
              <div className="builder-header-box">
                <h4>🛠️ Same Match Bet Builder</h4>
                <p>Select up to 4 legs from this match to construct a single custom parlay bet.</p>
              </div>

              <div className="builder-options-list">
                <div className="builder-option-group">
                  <h5>Match Winner</h5>
                  <div className="market-odds-grid two-col">
                    {[
                      { label: `${team1Name} to Win`, odds: match.odds.team1 || 1.85 },
                      { label: `${team2Name} to Win`, odds: match.odds.team2 || 1.95 },
                    ].map((opt) => {
                      const isSel = builderLegs.some(l => l.label === opt.label);
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          className={`market-odds-btn ${isSel ? 'selected' : ''}`}
                          onClick={() => toggleBuilderLeg(opt.label, opt.odds)}
                        >
                          <span className="market-label">{opt.label}</span>
                          <span className="market-val">{Number(opt.odds).toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="builder-option-group">
                  <h5>Match Total Score</h5>
                  <div className="market-odds-grid two-col">
                    {[
                      { label: 'Total Score Over 160.5', odds: 1.90 },
                      { label: 'Total Score Under 160.5', odds: 1.85 },
                    ].map((opt) => {
                      const isSel = builderLegs.some(l => l.label === opt.label);
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          className={`market-odds-btn ${isSel ? 'selected' : ''}`}
                          onClick={() => toggleBuilderLeg(opt.label, opt.odds)}
                        >
                          <span className="market-label">{opt.label}</span>
                          <span className="market-val">{opt.odds.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="builder-option-group">
                  <h5>Top Player Milestone</h5>
                  <div className="market-odds-grid two-col">
                    {[
                      { label: `${team1Players[0]} > 25.5 Runs/Points`, odds: 1.82 },
                      { label: `${team2Players[0]} > 25.5 Runs/Points`, odds: 1.88 },
                    ].map((opt) => {
                      const isSel = builderLegs.some(l => l.label === opt.label);
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          className={`market-odds-btn ${isSel ? 'selected' : ''}`}
                          onClick={() => toggleBuilderLeg(opt.label, opt.odds)}
                        >
                          <span className="market-label">{opt.label}</span>
                          <span className="market-val">{opt.odds.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="builder-summary-box">
                <div className="builder-legs-chips">
                  {builderLegs.length === 0 ? (
                    <span className="builder-empty-hint">Tap choices above to add legs to your builder</span>
                  ) : (
                    builderLegs.map((leg) => (
                      <span key={leg.label} className="builder-leg-chip">
                        {leg.label} ({leg.odds.toFixed(2)})
                        <button type="button" onClick={() => toggleBuilderLeg(leg.label, leg.odds)}>×</button>
                      </span>
                    ))
                  )}
                </div>

                <div className="builder-bottom-row">
                  <div className="builder-odds-result">
                    <span>Combined Odds:</span>
                    <strong>{builderCombinedOdds.toFixed(2)}</strong>
                  </div>

                  <button
                    type="button"
                    className="deposit-confirm-btn"
                    disabled={builderLegs.length === 0}
                    onClick={() => {
                      const desc = `BetBuilder (${builderLegs.length} legs): ${builderLegs.map(l => l.label).join(' + ')}`;
                      addBet(
                        match,
                        `Builder:${Date.now()}`,
                        builderCombinedOdds,
                        desc,
                        { marketName: '🛠️ Same Match Bet Builder' },
                      );
                      setBuilderLegs([]);
                    }}
                  >
                    Add Bet Builder to Slip
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MATCH INSIGHTS & H2H VIEW */}
          {activeMarketCategory === 'insights' && (
            <div className="insights-view">
              <div className="insights-card">
                <h4>⚡ Live Win Probability</h4>
                <div className="insights-win-meter">
                  <div className="insights-meter-labels">
                    <span>{team1Name} 64%</span>
                    <span>{team2Name} 36%</span>
                  </div>
                  <div className="insights-meter-bar">
                    <div className="meter-team1" style={{ width: '64%' }} />
                    <div className="meter-team2" style={{ width: '36%' }} />
                  </div>
                </div>
              </div>

              <div className="insights-card">
                <h4>🤝 Head-to-Head Record (Last 5 Encounters)</h4>
                <div className="insights-h2h-grid">
                  <div className="h2h-stat-box">
                    <strong>3 Wins</strong>
                    <span>{team1Name}</span>
                  </div>
                  <div className="h2h-stat-box">
                    <strong>0 Draws</strong>
                    <span>Tied / NR</span>
                  </div>
                  <div className="h2h-stat-box">
                    <strong>2 Wins</strong>
                    <span>{team2Name}</span>
                  </div>
                </div>
              </div>

              <div className="insights-card">
                <h4>🔥 Recent Form Guide</h4>
                <div className="form-guide-row">
                  <div className="form-team">
                    <span>{team1Name}:</span>
                    <div className="form-badges">
                      <span className="badge-w">W</span>
                      <span className="badge-w">W</span>
                      <span className="badge-l">L</span>
                      <span className="badge-w">W</span>
                      <span className="badge-w">W</span>
                    </div>
                  </div>
                  <div className="form-team">
                    <span>{team2Name}:</span>
                    <div className="form-badges">
                      <span className="badge-l">L</span>
                      <span className="badge-w">W</span>
                      <span className="badge-w">W</span>
                      <span className="badge-l">L</span>
                      <span className="badge-l">L</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="insights-card">
                <h4>⭐ Key Player Matchup</h4>
                <div className="player-matchup-grid">
                  <div className="player-box">
                    <strong>{team1Players[0] || 'Batter 1'}</strong>
                    <span>42.5 Avg Runs / 148.2 SR</span>
                  </div>
                  <div className="player-vs">VS</div>
                  <div className="player-box">
                    <strong>{team2Players[2] || 'Bowler 1'}</strong>
                    <span>2.1 Wkts/Match / 6.4 Econ</span>
                  </div>
                </div>
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
