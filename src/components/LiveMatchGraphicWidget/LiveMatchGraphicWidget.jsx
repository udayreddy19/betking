import { useState } from 'react';
import './LiveMatchGraphicWidget.css';

export default function LiveMatchGraphicWidget({ match }) {
  if (!match) return null;

  const isCricket = match.sport === 'cricket' || match.sport === 'virtual-cricket';
  const team1 = match.team1?.name || 'Kenya';
  const team2 = match.team2?.name || 'Bahrain';
  
  const score1 = match.liveDetails?.runs || 71;
  const wickets1 = match.liveDetails?.wickets || 3;
  const score2 = match.liveDetails?.score2 || 148;
  const wickets2 = match.liveDetails?.wickets2 || 5;
  const overs = match.liveDetails?.overs || '8.5';
  
  const reqRuns = Math.max(0, (score2 + 1) - score1);

  return (
    <div className="live-graphic-card">
      {/* 10CRIC Live Match Scoreboard Header */}
      <div className="graphic-scoreboard-header">
        <div className="graphic-team-name">{team1}</div>
        <div className="graphic-inn-badge">INN 2 | {overs}/20 OV</div>
        <div className="graphic-team-name">{team2}</div>
      </div>

      <div className="graphic-scores-row">
        <span className="main-score">{score1}/{wickets1}</span>
        <span className="score-divider">:</span>
        <span className="main-score">{score2}/{wickets2}</span>
      </div>

      <div className="graphic-chase-text">
        {team1} ({score1}/{wickets1}) require {reqRuns} runs from 67 balls.
      </div>

      {/* Dynamic Over Run Rate Bar Chart */}
      <div className="graphic-chart-box">
        <div className="chart-bars">
          {[4, 6, 2, 8, 12, 10, 5, 9, 14, 8, 11, 7, 3, 15, 6, 12, 9, 4, 10, 8].map((runs, i) => (
            <div
              key={i}
              className={`chart-bar ${i === 8 ? 'active-over' : ''}`}
              style={{ height: `${Math.min(100, (runs / 16) * 100)}%` }}
              title={`Over ${i + 1}: ${runs} runs`}
            />
          ))}
        </div>
        <div className="chart-axis-labels">
          <span>0</span>
          <span>4</span>
          <span>8</span>
          <span>12</span>
          <span>16</span>
          <span>20</span>
        </div>
      </div>

      {/* Recent Ball Tracker */}
      <div className="ball-tracker-row">
        <span className="over-label">OVER 8</span>
        <div className="ball-pills">
          <span className="ball-pill wicket">W</span>
          <span className="ball-pill">1</span>
          <span className="ball-pill">2</span>
          <span className="ball-pill">2</span>
          <span className="ball-pill">1</span>
          <span className="ball-pill">1</span>
        </div>
        <span className="over-label" style={{ marginLeft: 'auto' }}>OVER 9</span>
        <div className="ball-pills">
          <span className="ball-pill">1</span>
          <span className="ball-pill dot">•</span>
          <span className="ball-pill dot">•</span>
        </div>
      </div>

      {/* Realistic Green Cricket Ground Field Pitch Visualizer */}
      <div className="field-visualizer">
        <div className="cricket-field-bg">
          {/* Pitch Strip */}
          <div className="pitch-strip">
            <div className="pitch-stumps top" />
            <div className="pitch-crease top" />
            <div className="pitch-ball-impact" />
            <div className="pitch-crease bottom" />
            <div className="pitch-stumps bottom" />
          </div>

          {/* Overlay Live Batsmen & Bowler Scoreboard */}
          <div className="field-overlay-content">
            <div className="field-stats-col">
              <div className="field-stat-header">
                <span>BATTER</span>
                <span>R</span>
                <span>B</span>
                <span>4S</span>
                <span>6S</span>
              </div>
              <div className="field-stat-row active-batter">
                <span>SR Bhudia ✓</span>
                <span>2</span>
                <span>4</span>
                <span>0</span>
                <span>0</span>
              </div>
              <div className="field-stat-row">
                <span>RR Patel</span>
                <span>7</span>
                <span>8</span>
                <span>0</span>
                <span>0</span>
              </div>
            </div>

            <div className="field-stats-col">
              <div className="field-stat-header">
                <span>CURRENT BOWLER</span>
                <span>INNINGS STATS</span>
              </div>
              <div className="field-stat-row">
                <span>Rizwan Butt</span>
                <span className="stat-highlight">Fours: 9</span>
              </div>
              <div className="field-stat-row">
                <span>3.2-0-18-1</span>
                <span className="stat-highlight">Sixes: 1</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
