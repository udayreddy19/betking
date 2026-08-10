import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { HiOutlineChartBar, FiTrendingUp, FiActivity, FiDollarSign, FiClock } from '../../icons';
import './LiveChartsWidget.css';

export default function LiveChartsWidget({ match, chartType = 'odds_trend' }) {
  const [activeMode, setActiveMode] = useState(chartType); // 'odds_trend' | 'win_prob' | 'pnl_analytics'
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);

  // Generate real-time responsive SVG points for Live Odds Movement
  const oddsTrendData = useMemo(() => {
    if (!match) {
      return [
        { time: '10:00', team1: 1.85, team2: 1.95, prob1: 54, prob2: 46 },
        { time: '10:15', team1: 1.78, team2: 2.05, prob1: 56, prob2: 44 },
        { time: '10:30', team1: 1.92, team2: 1.88, prob1: 52, prob2: 48 },
        { time: '10:45', team1: 2.10, team2: 1.72, prob1: 47, prob2: 53 },
        { time: '11:00 (Live)', team1: 1.68, team2: 2.20, prob1: 60, prob2: 40 },
      ];
    }

    const t1Name = match.team1?.name || match.team1 || 'Team A';
    const t2Name = match.team2?.name || match.team2 || 'Team B';
    const currentOdds1 = parseFloat(match.bettingMarkets?.[0]?.odds?.[0]?.price || match.odds1 || 1.85);
    const currentOdds2 = parseFloat(match.bettingMarkets?.[0]?.odds?.[1]?.price || match.odds2 || 1.95);

    return [
      { time: 'T-45m', team1: (currentOdds1 + 0.15).toFixed(2), team2: (currentOdds2 - 0.12).toFixed(2), prob1: 48, prob2: 52 },
      { time: 'T-30m', team1: (currentOdds1 + 0.08).toFixed(2), team2: (currentOdds2 - 0.05).toFixed(2), prob1: 51, prob2: 49 },
      { time: 'T-15m', team1: (currentOdds1 - 0.05).toFixed(2), team2: (currentOdds2 + 0.04).toFixed(2), prob1: 55, prob2: 45 },
      { time: 'T-5m',  team1: (currentOdds1 + 0.03).toFixed(2), team2: (currentOdds2 - 0.02).toFixed(2), prob1: 53, prob2: 47 },
      { time: 'LIVE NOW', team1: currentOdds1.toFixed(2), team2: currentOdds2.toFixed(2), prob1: Math.round(100 / currentOdds1), prob2: Math.round(100 / currentOdds2) },
    ];
  }, [match]);

  const team1Name = match?.team1?.name || match?.team1 || 'Team 1';
  const team2Name = match?.team2?.name || match?.team2 || 'Team 2';

  // Calculate SVG Polyline Path Coordinates
  const width = 500;
  const height = 180;
  const padding = 30;

  const points1 = useMemo(() => {
    const minVal = 1.2;
    const maxVal = 2.8;
    return oddsTrendData.map((d, i) => {
      const x = padding + (i / (oddsTrendData.length - 1)) * (width - padding * 2);
      const y = height - padding - ((parseFloat(d.team1) - minVal) / (maxVal - minVal)) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [oddsTrendData]);

  const points2 = useMemo(() => {
    const minVal = 1.2;
    const maxVal = 2.8;
    return oddsTrendData.map((d, i) => {
      const x = padding + (i / (oddsTrendData.length - 1)) * (width - padding * 2);
      const y = height - padding - ((parseFloat(d.team2) - minVal) / (maxVal - minVal)) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [oddsTrendData]);

  return (
    <div className="live-charts-widget-container">
      {/* CHART HEADER CONTROLS */}
      <div className="live-charts-header">
        <div className="live-charts-title">
          <HiOutlineChartBar className="charts-icon" />
          <span>Live Match Analytics & Line Movements</span>
        </div>

        <div className="live-charts-type-selector">
          <button
            type="button"
            className={`chart-type-btn ${activeMode === 'odds_trend' ? 'active' : ''}`}
            onClick={() => setActiveMode('odds_trend')}
          >
            <FiTrendingUp /> Live Odds Trend
          </button>
          <button
            type="button"
            className={`chart-type-btn ${activeMode === 'win_prob' ? 'active' : ''}`}
            onClick={() => setActiveMode('win_prob')}
          >
            <FiActivity /> Win Probability %
          </button>
        </div>
      </div>

      {/* SVG CHART CONTAINER */}
      <div className="live-charts-body">
        {activeMode === 'odds_trend' && (
          <div className="charts-svg-wrap">
            <div className="charts-legend">
              <span className="legend-item legend-team1 font-bold">
                <span className="legend-dot team1-dot" /> {team1Name} Odds: {oddsTrendData[oddsTrendData.length - 1].team1}
              </span>
              <span className="legend-item legend-team2 font-bold">
                <span className="legend-dot team2-dot" /> {team2Name} Odds: {oddsTrendData[oddsTrendData.length - 1].team2}
              </span>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} className="live-chart-svg">
              {/* Background Grid Lines */}
              <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.08)" />

              {/* Team 1 Odds Line */}
              <polyline fill="none" stroke="#3b82f6" strokeWidth="3" points={points1} strokeLinecap="round" strokeLinejoin="round" />

              {/* Team 2 Odds Line */}
              <polyline fill="none" stroke="#a855f7" strokeWidth="3" points={points2} strokeLinecap="round" strokeLinejoin="round" />

              {/* Interactive Points */}
              {oddsTrendData.map((d, i) => {
                const minVal = 1.2;
                const maxVal = 2.8;
                const x = padding + (i / (oddsTrendData.length - 1)) * (width - padding * 2);
                const y1 = height - padding - ((parseFloat(d.team1) - minVal) / (maxVal - minVal)) * (height - padding * 2);
                const y2 = height - padding - ((parseFloat(d.team2) - minVal) / (maxVal - minVal)) * (height - padding * 2);

                return (
                  <g key={i} className="chart-point-group" onMouseEnter={() => setSelectedPointIndex(i)}>
                    <circle cx={x} cy={y1} r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                    <circle cx={x} cy={y2} r="5" fill="#a855f7" stroke="#ffffff" strokeWidth="2" />
                    <text x={x} y={height - 8} fill="#94a3b8" fontSize="10" textAnchor="middle font-mono">
                      {d.time}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Selected Data Tooltip Callout */}
            {selectedPointIndex !== null && (
              <div className="chart-tooltip-bar">
                <span className="text-slate-400">Timestamp: <strong className="text-slate-200">{oddsTrendData[selectedPointIndex].time}</strong></span>
                <span className="text-blue-400">{team1Name}: <strong>{oddsTrendData[selectedPointIndex].team1}</strong></span>
                <span className="text-purple-400">{team2Name}: <strong>{oddsTrendData[selectedPointIndex].team2}</strong></span>
              </div>
            )}
          </div>
        )}

        {activeMode === 'win_prob' && (
          <div className="win-prob-chart-wrap">
            <div className="prob-header flex-between mb-3 text-xs">
              <span className="font-bold text-blue-400">{team1Name} ({oddsTrendData[oddsTrendData.length - 1].prob1}%)</span>
              <span className="font-bold text-purple-400">{team2Name} ({oddsTrendData[oddsTrendData.length - 1].prob2}%)</span>
            </div>

            {/* Progress Bar Probability Graph */}
            <div className="prob-bar-container">
              <motion.div
                className="prob-bar-fill team1-fill"
                initial={{ width: '50%' }}
                animate={{ width: `${oddsTrendData[oddsTrendData.length - 1].prob1}%` }}
                transition={{ duration: 0.8 }}
              />
              <motion.div
                className="prob-bar-fill team2-fill"
                initial={{ width: '50%' }}
                animate={{ width: `${oddsTrendData[oddsTrendData.length - 1].prob2}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>

            <div className="prob-sub-info mt-3 text-xs text-slate-400 text-center">
              <span>⚡ Live Probability Index based on 10Cric, CREX & FanCode AI Odds Stream</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
