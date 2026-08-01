import { useState } from 'react';
import { HiOutlineUsers, HiOutlineViewList, HiOutlineChartBar } from 'react-icons/hi';
import './LiveMatchGraphicWidget.css';

export default function LiveMatchGraphicWidget({ match }) {
  const [activeWidgetTab, setActiveWidgetTab] = useState('field');

  if (!match) return null;

  const sport = match.sport || 'cricket';
  const team1 = match.team1?.name || 'Brisbane Heat SRL';
  const team2 = match.team2?.name || 'Perth Scorchers SRL';

  // --- CRICKET GRAPHIC RENDERER ---
  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const score1 = match.liveDetails?.runs ?? 95;
    const wickets1 = match.liveDetails?.wickets ?? 3;
    const score2 = match.liveDetails?.score2 ?? 179;
    const wickets2 = match.liveDetails?.wickets2 ?? 4;
    const overs = match.liveDetails?.overs || '12.3';
    const reqRuns = Math.max(0, score2 - score1);

    const b1 = match.liveDetails?.batter1 || { name: 'Wildermuth, Jack - SRL', runs: 34, balls: 32, fours: 3, sixes: 0 };
    const b2 = match.liveDetails?.batter2 || { name: 'M Bryant', runs: 14, balls: 8, fours: 2, sixes: 0 };

    return (
      <div className="live-graphic-card-10cric">
        {/* Light Header Section */}
        <div className="graphic-top-header">
          <div className="graphic-inn-pill">INN 2 | {overs}/20 OV</div>
          <div className="graphic-teams-row">
            <span className="team-title-left">{team1}</span>
            <span className="team-title-right">{team2}</span>
          </div>
          <div className="graphic-large-scores">
            <span>{score1}/{wickets1}</span>
            <span className="colon-sep">:</span>
            <span>{score2}/{wickets2}</span>
          </div>
          <div className="graphic-chase-sentence">
            {team1} are {score1}/{wickets1} after {overs} overs chasing {score2}
          </div>
        </div>

        {/* Innings Selector Dropdown */}
        <div className="innings-dropdown-container">
          <select className="innings-select-box">
            <option>{team1} INNS</option>
            <option>{team2} INNS</option>
          </select>
        </div>

        {/* Over Bar Chart with Purple Wickets */}
        <div className="bar-chart-container">
          <div className="chart-bars-track">
            {[2, 4, 3, 5, 8, 12, 6, 9, 14, 4, 11, 7, 9, 15, 6, 12, 9, 10, 8, 5].map((runs, i) => {
              const hasWicket = [5, 9, 11].includes(i);
              return (
                <div key={i} className="chart-column">
                  {hasWicket && <span className="wicket-badge-w">W</span>}
                  <div className={`chart-col-bar ${i === 12 ? 'current-active' : ''}`} style={{ height: `${(runs / 16) * 35}px` }} />
                </div>
              );
            })}
          </div>
          <div className="chart-xaxis">
            <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span><span>20</span>
          </div>
        </div>

        {/* Purple Sub-Tabs Bar */}
        <div className="purple-subtabs-row">
          <button
            onClick={() => setActiveWidgetTab('field')}
            className={`subtab-btn ${activeWidgetTab === 'field' ? 'purple-active' : ''}`}
            title="Pitch Visualizer"
          >
            <span className="subtab-icon-circle">🏟️</span>
          </button>
          <button
            onClick={() => setActiveWidgetTab('scorecard')}
            className={`subtab-btn ${activeWidgetTab === 'scorecard' ? 'purple-active' : ''}`}
            title="Scorecard List"
          >
            <HiOutlineViewList className="subtab-react-icon" />
          </button>
          <button
            onClick={() => setActiveWidgetTab('stats')}
            className={`subtab-btn ${activeWidgetTab === 'stats' ? 'purple-active' : ''}`}
            title="Stats & Graphs"
          >
            <HiOutlineChartBar className="subtab-react-icon" />
          </button>
          <button
            onClick={() => setActiveWidgetTab('lineups')}
            className={`subtab-btn ${activeWidgetTab === 'lineups' ? 'purple-active' : ''}`}
            title="Team Lineups"
          >
            <HiOutlineUsers className="subtab-react-icon" />
          </button>
        </div>

        {/* TAB 1: PITCH VISUALIZER */}
        {activeWidgetTab === 'field' && (
          <>
            {/* Delivery Tracker Row (OVER 12 & OVER 13) */}
            <div className="over-delivery-row">
              <span className="over-num-heading">OVER 12</span>
              <div className="delivery-pills-list">
                <span className="del-pill wicket-w">W</span>
                <span className="del-pill legbye">1lb</span>
                <span className="del-pill">1</span>
                <span className="del-pill">1</span>
                <span className="del-pill dot">•</span>
                <span className="del-pill">2</span>
                <span className="del-pill">1</span>
                <span className="del-pill dot">•</span>
              </div>
              <span className="over-num-heading" style={{ marginLeft: 'auto' }}>OVER 13</span>
              <div className="delivery-pills-list">
                <span className="del-pill four">4</span>
                <span className="del-pill">2</span>
                <span className="del-pill four">4</span>
              </div>
            </div>

            {/* Pitch Graphic Overlay */}
            <div className="pitch-visualizer-card">
              <div className="cricket-grass-background">
                <div className="pitch-stumps-graphic" />

                <div className="pitch-overlay-tables">
                  <div className="pitch-stats-column">
                    <div className="table-header-row">
                      <span>BATTER</span><span>R</span><span>B</span><span>4S</span><span>6S</span>
                    </div>
                    <div className="table-data-row">
                      <span>{b1.name}</span><span>{b1.runs}</span><span>{b1.balls}</span><span>{b1.fours}</span><span>{b1.sixes}</span>
                    </div>
                    <div className="table-data-row active-striker">
                      <span>{b2.name} 🏏</span><span>{b2.runs}</span><span>{b2.balls}</span><span>{b2.fours}</span><span>{b2.sixes}</span>
                    </div>

                    <div className="table-header-row" style={{ marginTop: '12px' }}>
                      <span>CURRENT BOWLER</span>
                    </div>
                    <div className="table-data-row">
                      <span>AM Hardie 🏏</span>
                    </div>
                  </div>

                  <div className="pitch-stats-column">
                    <div className="table-header-row">
                      <span>INNINGS STATS</span>
                    </div>
                    <div className="table-data-row">
                      <span>Fours</span><span className="highlight-stat-val">8</span>
                    </div>
                    <div className="table-data-row">
                      <span>Sixes</span><span className="highlight-stat-val">0</span>
                    </div>
                    <div className="table-data-row">
                      <span>Extras</span><span className="highlight-stat-val">17</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: SCORECARD LIST */}
        {activeWidgetTab === 'scorecard' && (
          <div className="subtab-content-panel">
            <h4 style={{ color: '#a855f7', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
              📋 {team1} Live Scorecard
            </h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e293b' }}>
              <span>{b1.name}</span>
              <span><strong>{b1.runs}</strong> ({b1.balls}b, {b1.fours}x4, {b1.sixes}x6)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>{b2.name} 🏏</span>
              <span><strong>{b2.runs}</strong> ({b2.balls}b, {b2.fours}x4, {b2.sixes}x6)</span>
            </div>
          </div>
        )}

        {/* TAB 3: STATS */}
        {activeWidgetTab === 'stats' && (
          <div className="subtab-content-panel">
            <h4 style={{ color: '#38bdf8', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
              📊 Match Win Probability & Stats
            </h4>
            <div style={{ padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                <span>{team1} 58%</span>
                <span>{team2} 42%</span>
              </div>
              <div style={{ height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginTop: '4px' }}>
                <div style={{ width: '58%', background: '#a855f7' }} />
                <div style={{ width: '42%', background: '#22c55e' }} />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LINEUPS */}
        {activeWidgetTab === 'lineups' && (
          <div className="subtab-content-panel">
            <h4 style={{ color: '#22c55e', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
              👥 Playing XI Lineups
            </h4>
            <p style={{ color: '#94a3b8' }}>Confirmed XI rosters at toss</p>
          </div>
        )}
      </div>
    );
  }

  // --- SOCCER GRAPHIC RENDERER ---
  return (
    <div className="live-graphic-card-10cric">
      <div className="graphic-top-header">
        <div className="graphic-inn-badge">SOCCER | LIVE</div>
        <div className="graphic-teams-row">
          <span className="team-title-left">{team1}</span>
          <span className="team-title-right">{team2}</span>
        </div>
        <div className="graphic-large-scores">
          <span>{match.liveDetails?.score1 ?? 2}</span>
          <span className="colon-sep">:</span>
          <span>{match.liveDetails?.score2 ?? 1}</span>
        </div>
      </div>
    </div>
  );
}
