import { useState } from 'react';
import { BiFootball, BiTennisBall, BiStats } from 'react-icons/bi';
import { HiOutlineUsers, HiOutlineViewList, HiOutlineChartBar } from 'react-icons/hi';
import './LiveMatchGraphicWidget.css';

export default function LiveMatchGraphicWidget({ match }) {
  const [activeWidgetTab, setActiveWidgetTab] = useState('field');

  if (!match) return null;

  const sport = match.sport || 'cricket';
  const team1 = match.team1?.name || 'Home Team';
  const team2 = match.team2?.name || 'Away Team';

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
        {/* Header */}
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">INN 2 | {overs}/20 OV</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        {/* Scores */}
        <div className="graphic-scores-row">
          <span className="main-score">{score1}/{wickets1}</span>
          <span className="score-divider">:</span>
          <span className="main-score">{score2}/{wickets2}</span>
        </div>

        {/* Chase requirement */}
        <div className="graphic-chase-text">
          {score2 > 0 ? `${team1} (${score1}/${wickets1}) require ${reqRuns} runs from 11 balls.` : `Match Status: ${match.liveDetails?.commentary || 'In Play'}`}
        </div>

        {/* Innings selector dropdown */}
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

        {/* Over Run Rate Bar Chart with Wicket Markers */}
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

        {/* Sub-tabs Navigation */}
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
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center'
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
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Scorecard List"
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
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Match Stats"
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
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Team Lineups"
          >
            <HiOutlineUsers />
          </button>
        </div>

        {/* Ball-by-ball delivery tracker row */}
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

        {/* Pitch Graphic & Overlay */}
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

        {/* Soccer Pitch Visualizer */}
        <div className="field-visualizer">
          <div className="soccer-pitch-bg">
            <div className="soccer-half-line" />
            <div className="soccer-center-circle" />
            <div className="soccer-box left" />
            <div className="soccer-box right" />
            <div className="soccer-ball" />

            <div className="field-overlay-content">
              <div className="field-stats-col">
                <div className="field-stat-header"><span>MATCH STATS</span><span>HOME</span><span>AWAY</span></div>
                <div className="field-stat-row"><span>Shots on Target</span><span>6</span><span>4</span></div>
                <div className="field-stat-row"><span>Possession %</span><span>56%</span><span>44%</span></div>
              </div>
              <div className="field-stats-col">
                <div className="field-stat-header"><span>KEY EVENTS</span><span>TOTAL</span></div>
                <div className="field-stat-row"><span>Corner Kicks</span><span className="stat-highlight">7 - 3</span></div>
                <div className="field-stat-row"><span>Yellow Cards</span><span className="stat-highlight">2 - 1</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- BASKETBALL GRAPHIC RENDERER ---
  if (sport === 'basketball') {
    const score1 = match.liveDetails?.score1 ?? 94;
    const score2 = match.liveDetails?.score2 ?? 88;
    const quarter = match.liveDetails?.quarter || '4th Qtr';

    return (
      <div className="live-graphic-card">
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">NBA | {quarter}</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        <div className="graphic-scores-row">
          <span className="main-score">{score1}</span>
          <span className="score-divider">:</span>
          <span className="main-score">{score2}</span>
        </div>

        <div className="graphic-chase-text" style={{ color: '#fbbf24' }}>
          🏀 {quarter} - 3-POINTER! Swish from downtown behind the arc!
        </div>

        <div className="field-visualizer">
          <div className="basketball-court-bg">
            <div className="court-center-line" />
            <div className="court-center-circle" />
            <div className="field-overlay-content">
              <div className="field-stats-col">
                <div className="field-stat-header"><span>GAME STATS</span><span>VALUE</span></div>
                <div className="field-stat-row"><span>Field Goal %</span><span>49.2% vs 45.1%</span></div>
                <div className="field-stat-row"><span>3-PT Made</span><span>14 vs 10</span></div>
              </div>
              <div className="field-stats-col">
                <div className="field-stat-header"><span>GAME LEADER</span><span>PTS</span></div>
                <div className="field-stat-row"><span>LeBron James</span><span className="stat-highlight">28 PTS / 8 AST</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT TENNIS / OTHER SPORTS GRAPHIC RENDERER ---
  return (
    <div className="live-graphic-card">
      <div className="graphic-scoreboard-header">
        <div className="graphic-team-name">{team1}</div>
        <div className="graphic-inn-badge">{sport.toUpperCase()} | LIVE</div>
        <div className="graphic-team-name">{team2}</div>
      </div>
      <div className="graphic-scores-row">
        <span className="main-score">{match.liveDetails?.score1 ?? 1}</span>
        <span className="score-divider">:</span>
        <span className="main-score">{match.liveDetails?.score2 ?? 0}</span>
      </div>
      <div className="field-visualizer">
        <div className="tennis-court-bg">
          <div className="tennis-net-line" />
          <div className="field-overlay-content">
            <div className="field-stats-col">
              <div className="field-stat-header"><span>MATCH STATUS</span><span>LIVE</span></div>
              <div className="field-stat-row"><span>Action</span><span className="stat-highlight">In Play</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
