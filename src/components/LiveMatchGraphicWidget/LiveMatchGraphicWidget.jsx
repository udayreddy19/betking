import { useState } from 'react';
import { HiOutlineUsers, HiOutlineViewList, HiOutlineChartBar } from 'react-icons/hi';
import './LiveMatchGraphicWidget.css';

const playerRostersDatabase = {
  'South Africa E...': [
    { name: 'Tristan Stubbs', role: 'Batter', runs: 42, balls: 28, fours: 4, sixes: 2 },
    { name: 'Dewald Brevis', role: 'Batter', runs: 35, balls: 19, fours: 3, sixes: 3 },
    { name: 'Bryce Parsons', role: 'All-Rounder', runs: 18, balls: 12, fours: 2, sixes: 0 },
    { name: 'Matthew Breetzke', role: 'Wicketkeeper', runs: 24, balls: 16, fours: 3, sixes: 0 },
    { name: 'George Linde', role: 'Spinner', overs: '4.0', wickets: 2, runsConceded: 24 },
    { name: 'Lungi Ngidi', role: 'Fast Bowler', overs: '3.4', wickets: 3, runsConceded: 28 }
  ],
  'Bangladesh Em...': [
    { name: 'Towhid Hridoy', role: 'Batter', runs: 48, balls: 32, fours: 5, sixes: 2 },
    { name: 'Tanzid Hasan', role: 'Opener', runs: 29, balls: 20, fours: 4, sixes: 1 },
    { name: 'Parvez Hossain', role: 'Wicketkeeper', runs: 16, balls: 11, fours: 2, sixes: 0 },
    { name: 'Shamim Hossain', role: 'All-Rounder', runs: 22, balls: 14, fours: 2, sixes: 1 },
    { name: 'Tanzim Sakib', role: 'Fast Bowler', overs: '4.0', wickets: 2, runsConceded: 31 },
    { name: 'Rishad Hossain', role: 'Leg Spinner', overs: '4.0', wickets: 1, runsConceded: 26 }
  ],
  'Kenya': [
    { name: 'Sachin Gill', role: 'Captain / Batter', runs: 16, balls: 12, fours: 2, sixes: 0 },
    { name: 'LN Oluoch', role: 'Opener', runs: 5, balls: 4, fours: 0, sixes: 0 },
    { name: 'SR Bhudia', role: 'Batter', runs: 34, balls: 22, fours: 4, sixes: 1 },
    { name: 'RR Patel', role: 'Wicketkeeper', runs: 28, balls: 19, fours: 3, sixes: 1 },
    { name: 'Rakep Patel', role: 'All-Rounder', overs: '4.0', wickets: 2, runsConceded: 25 },
    { name: 'Alex Obanda', role: 'Opener', runs: 41, balls: 26, fours: 5, sixes: 2 }
  ],
  'Bahrain': [
    { name: 'Haider Ali', role: 'Opener', runs: 38, balls: 25, fours: 4, sixes: 2 },
    { name: 'Sarfraz Ali', role: 'Captain', runs: 45, balls: 29, fours: 6, sixes: 1 },
    { name: 'Rizwan Butt', role: 'Fast Bowler', overs: '3.4', wickets: 2, runsConceded: 22 },
    { name: 'Junaid Niazi', role: 'All-Rounder', runs: 21, balls: 14, fours: 2, sixes: 1 }
  ],
  'Manchester City': [
    { name: 'Erling Haaland', role: 'Striker', goals: 2, shots: 5, passes: 18 },
    { name: 'Kevin De Bruyne', role: 'Playmaker', goals: 0, assists: 2, passes: 54 },
    { name: 'Phil Foden', role: 'Winger', goals: 0, shots: 3, passes: 38 },
    { name: 'Rodri', role: 'Midfielder', tackles: 4, passes: 72 }
  ],
  'Arsenal': [
    { name: 'Bukayo Saka', role: 'Winger', goals: 1, assists: 0, shots: 4 },
    { name: 'Martin Odegaard', role: 'Captain / Playmaker', goals: 0, assists: 1, passes: 48 },
    { name: 'Kai Havertz', role: 'Forward', goals: 0, shots: 2, passes: 26 }
  ]
};

export default function LiveMatchGraphicWidget({ match }) {
  const [activeWidgetTab, setActiveWidgetTab] = useState('field');

  if (!match) return null;

  const sport = match.sport || 'cricket';
  const team1 = match.team1?.name || 'Home Team';
  const team2 = match.team2?.name || 'Away Team';

  const roster1 = playerRostersDatabase[team1] || [
    { name: `${team1.split(' ')[0]} Star 1`, role: 'Captain', runs: 38, balls: 24, fours: 4, sixes: 1 },
    { name: `${team1.split(' ')[0]} Star 2`, role: 'Batter', runs: 28, balls: 18, fours: 3, sixes: 0 },
    { name: `${team1.split(' ')[0]} Keeper`, role: 'Wicketkeeper', runs: 19, balls: 12, fours: 2, sixes: 0 }
  ];

  const roster2 = playerRostersDatabase[team2] || [
    { name: `${team2.split(' ')[0]} Star 1`, role: 'Opener', runs: 44, balls: 30, fours: 5, sixes: 2 },
    { name: `${team2.split(' ')[0]} Star 2`, role: 'Bowler', overs: '4.0', wickets: 2, runsConceded: 26 }
  ];

  // --- CRICKET GRAPHIC RENDERER ---
  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const score1 = match.liveDetails?.runs ?? 130;
    const wickets1 = match.liveDetails?.wickets ?? 7;
    const score2 = match.liveDetails?.score2 ?? 148;
    const wickets2 = match.liveDetails?.wickets2 ?? 5;
    const overs = match.liveDetails?.overs || '18.1';
    const reqRuns = Math.max(0, (score2 + 1) - score1);
    const ballHistory = match.liveDetails?.ballHistory || ['4', '•', 'W', '2', '•', '2', '1', '1', '2'];
    const b1 = match.liveDetails?.batter1 || { name: 'Sachin Gill', runs: 16, balls: 12, fours: 2, sixes: 0 };
    const b2 = match.liveDetails?.batter2 || { name: 'LN Oluoch', runs: 5, balls: 4, fours: 0, sixes: 0 };

    return (
      <div className="live-graphic-card">
        {/* Scoreboard Header */}
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">INN 2 | {overs}/20 OV</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        {/* Live Scores Row */}
        <div className="graphic-scores-row">
          <span className="main-score">{score1}/{wickets1}</span>
          <span className="score-divider">:</span>
          <span className="main-score">{score2}/{wickets2}</span>
        </div>

        {/* Chase Text */}
        <div className="graphic-chase-text">
          {score2 > 0 ? `${team1} (${score1}/${wickets1}) require ${reqRuns} runs from 11 balls.` : `Match Status: ${match.liveDetails?.commentary || 'In Play'}`}
        </div>

        {/* Innings Selector */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
          <select style={{
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '2px 8px',
            fontSize: '0.7rem',
            fontWeight: 700
          }}>
            <option>{team1} INNS</option>
            <option>{team2} INNS</option>
          </select>
        </div>

        {/* Over Run-Rate Chart */}
        <div className="graphic-chart-box">
          <div className="chart-bars">
            {[4, 6, 2, 8, 12, 10, 5, 9, 14, 8, 11, 7, 3, 15, 6, 12, 9, 14, 8, 6].map((runs, i) => {
              const isWicketOver = [5, 6, 7, 15, 16, 17].includes(i);
              return (
                <div
                  key={i}
                  className={`chart-bar ${i === 18 ? 'active-over' : ''}`}
                  style={{ height: `${Math.min(100, (runs / 16) * 100)}%`, position: 'relative' }}
                  title={`Over ${i + 1}: ${runs} runs`}
                >
                  {isWicketOver && (
                    <span style={{
                      position: 'absolute',
                      top: '-12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#a855f7',
                      color: 'white',
                      fontSize: '0.55rem',
                      fontWeight: 900,
                      borderRadius: '3px',
                      padding: '0 2px'
                    }}>W</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="chart-axis-labels">
            <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span><span>20</span>
          </div>
        </div>

        {/* Widget Sub-tabs Bar */}
        <div style={{
          display: 'flex',
          justify: 'space-around',
          background: '#0f172a',
          padding: '6px',
          borderRadius: '8px',
          margin: '8px 0',
          border: '1px solid #1e293b'
        }}>
          <button
            onClick={() => setActiveWidgetTab('field')}
            style={{
              background: activeWidgetTab === 'field' ? '#3b82f6' : 'transparent',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
            title="Pitch Visualizer"
          >
            🏟️
          </button>
          <button
            onClick={() => setActiveWidgetTab('scorecard')}
            style={{
              background: activeWidgetTab === 'scorecard' ? '#3b82f6' : 'transparent',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
            title="Full Scorecard"
          >
            <HiOutlineViewList />
          </button>
          <button
            onClick={() => setActiveWidgetTab('stats')}
            style={{
              background: activeWidgetTab === 'stats' ? '#3b82f6' : 'transparent',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
            title="Match Stats & Momentum"
          >
            <HiOutlineChartBar />
          </button>
          <button
            onClick={() => setActiveWidgetTab('lineups')}
            style={{
              background: activeWidgetTab === 'lineups' ? '#3b82f6' : 'transparent',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
            title="Player Roster & Lineups"
          >
            <HiOutlineUsers />
          </button>
        </div>

        {/* TAB 1: FIELD PITCH GRAPHIC */}
        {activeWidgetTab === 'field' && (
          <>
            <div className="ball-tracker-row">
              <span className="over-label">OVER 18</span>
              <div className="ball-pills">
                {ballHistory.map((b, idx) => (
                  <span key={idx} className={`ball-pill ${b === 'W' ? 'wicket' : b === '•' ? 'dot' : ''}`}>
                    {b}
                  </span>
                ))}
              </div>
              <span className="over-label" style={{ marginLeft: 'auto' }}>OVER 19</span>
            </div>

            <div className="field-visualizer">
              <div className="cricket-field-bg">
                <div className="pitch-strip">
                  <div className="pitch-stumps top" />
                  <div className="pitch-crease top" />
                  <div className="pitch-ball-impact" />
                  <div className="pitch-crease bottom" />
                  <div className="pitch-stumps bottom" />
                </div>

                <div className="field-overlay-content">
                  <div className="field-stats-col">
                    <div className="field-stat-header">
                      <span>BATTER</span><span>R</span><span>B</span><span>4S</span><span>6S</span>
                    </div>
                    <div className="field-stat-row active-batter">
                      <span>{b1.name} ✓</span><span>{b1.runs}</span><span>{b1.balls}</span><span>{b1.fours}</span><span>{b1.sixes}</span>
                    </div>
                    <div className="field-stat-row">
                      <span>{b2.name}</span><span>{b2.runs}</span><span>{b2.balls}</span><span>{b2.fours}</span><span>{b2.sixes}</span>
                    </div>
                  </div>
                  <div className="field-stats-col">
                    <div className="field-stat-header">
                      <span>CURRENT BOWLER</span><span>INNINGS STATS</span>
                    </div>
                    <div className="field-stat-row">
                      <span>{match.liveDetails?.bowler?.name || 'Rizwan Butt'}</span><span className="stat-highlight">Fours: {match.liveDetails?.fours || 14}</span>
                    </div>
                    <div className="field-stat-row">
                      <span>18.1-0-22-1</span><span className="stat-highlight">Sixes: {match.liveDetails?.sixes || 2}</span>
                    </div>
                    <div className="field-stat-row">
                      <span style={{ color: '#94a3b8' }}>Extras: 8</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: DETAILED LIVE SCORECARD LIST */}
        {activeWidgetTab === 'scorecard' && (
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', color: 'white', fontSize: '0.75rem' }}>
            <h4 style={{ color: '#fbbf24', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '8px' }}>
              📋 {team1} Live Batting Scorecard
            </h4>
            {roster1.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
                <span style={{ fontWeight: 700 }}>{p.name} <small style={{ color: '#94a3b8' }}>({p.role})</small></span>
                <span>{p.runs ?? 0} runs ({p.balls ?? 0}b, {p.fours ?? 0}x4, {p.sixes ?? 0}x6)</span>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: MATCH STATS & MOMENTUM CHART */}
        {activeWidgetTab === 'stats' && (
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', color: 'white', fontSize: '0.75rem' }}>
            <h4 style={{ color: '#38bdf8', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '8px' }}>
              📊 Match Win Probability & Stats
            </h4>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '4px' }}>
                <span>{team1} 64%</span>
                <span>{team2} 36%</span>
              </div>
              <div style={{ height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: '64%', background: '#22c55e' }} />
                <div style={{ width: '36%', background: '#ef4444' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: '#cbd5e1' }}>
              <div>Boundary Fours: <strong style={{ color: 'white' }}>14 vs 11</strong></div>
              <div>Boundary Sixes: <strong style={{ color: 'white' }}>4 vs 2</strong></div>
              <div>Run Rate: <strong style={{ color: 'white' }}>7.85 vs 7.40</strong></div>
              <div>Extras Conceded: <strong style={{ color: 'white' }}>8 vs 5</strong></div>
            </div>
          </div>
        )}

        {/* TAB 4: PLAYER ROSTER & LINEUPS */}
        {activeWidgetTab === 'lineups' && (
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', color: 'white', fontSize: '0.75rem' }}>
            <h4 style={{ color: '#a855f7', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '8px' }}>
              👥 {team1} Active Playing XI Roster
            </h4>
            {roster1.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
                <span>👤 <strong>{p.name}</strong></span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{p.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- SOCCER / FOOTBALL GRAPHIC RENDERER ---
  if (sport === 'soccer' || sport === 'esoccer') {
    const score1 = match.liveDetails?.score1 ?? 2;
    const score2 = match.liveDetails?.score2 ?? 1;
    const minute = match.liveDetails?.minute || "74' 2nd Half";

    return (
      <div className="live-graphic-card">
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">SOCCER | {minute}</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        <div className="graphic-scores-row">
          <span className="main-score">{score1}</span>
          <span className="score-divider">:</span>
          <span className="main-score">{score2}</span>
        </div>

        <div className="graphic-chase-text" style={{ color: '#4ade80' }}>
          ⚡ {minute} - Dangerous attack on goal! High possession in opponent penalty box.
        </div>

        <div className="field-visualizer">
          <div className="soccer-pitch-bg">
            <div className="soccer-half-line" />
            <div className="soccer-center-circle" />
            <div className="soccer-box left" />
            <div className="soccer-box right" />
            <div className="soccer-ball" />

            <div className="field-overlay-content">
              <div className="field-stats-col">
                <div className="field-stat-header"><span>STARTERS & GOALS</span><span>STATS</span></div>
                {roster1.slice(0, 3).map((p, idx) => (
                  <div key={idx} className="field-stat-row">
                    <span>{p.name} ({p.role})</span>
                    <span className="stat-highlight">{p.goals ? `${p.goals} Goals` : 'Active'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- BASKETBALL GRAPHIC RENDERER ---
  return (
    <div className="live-graphic-card">
      <div className="graphic-scoreboard-header">
        <div className="graphic-team-name">{team1}</div>
        <div className="graphic-inn-badge">{sport.toUpperCase()} | LIVE</div>
        <div className="graphic-team-name">{team2}</div>
      </div>
      <div className="graphic-scores-row">
        <span className="main-score">{match.liveDetails?.score1 ?? 94}</span>
        <span className="score-divider">:</span>
        <span className="main-score">{match.liveDetails?.score2 ?? 88}</span>
      </div>
      <div className="field-visualizer">
        <div className="basketball-court-bg">
          <div className="court-center-line" />
          <div className="court-center-circle" />
          <div className="field-overlay-content">
            <div className="field-stats-col">
              <div className="field-stat-header"><span>ACTIVE PLAYERS</span><span>PTS</span></div>
              {roster1.slice(0, 3).map((p, idx) => (
                <div key={idx} className="field-stat-row">
                  <span>{p.name}</span>
                  <span className="stat-highlight">{p.runs || 28} PTS</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
