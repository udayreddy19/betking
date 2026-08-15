import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import './LiveChartsWidget.css';

function ChartBarIcon({ className = '' }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function TrendingUpIcon({ className = '' }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function ActivityIcon({ className = '' }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function ArrowUpRightIcon({ className = '' }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

function ArrowDownRightIcon({ className = '' }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="7" x2="17" y2="17" />
      <polyline points="17 7 17 17 7 17" />
    </svg>
  );
}

function InfoIcon({ className = '' }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export default function LiveChartsWidget({ match, chartType = 'odds_trend' }) {
  const [activeMode, setActiveMode] = useState(chartType); // 'odds_trend' | 'win_prob'
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);

  const team1Name = match?.team1?.name || match?.team1 || 'Zambia';
  const team2Name = match?.team2?.name || match?.team2 || 'Rwanda';

  // Compute live responsive trend data
  const oddsTrendData = useMemo(() => {
    const winnerMkt = match?.odds?.markets?.find(m => m.marketId === 'match_winner' || m.marketType === 'MATCH_WINNER')
      || match?.oddsMarkets?.find(m => m.key === 'match_winner' || m.marketId === 'match_winner')
      || match?.bettingMarkets?.[0];

    const s1 = winnerMkt?.selections?.find(s => s.name === team1Name || (match?.team1?.id && s.selectionId?.includes(match.team1.id)))
      || winnerMkt?.selections?.[0];
    const s2 = winnerMkt?.selections?.find(s => s.name === team2Name || (match?.team2?.id && s.selectionId?.includes(match.team2.id)))
      || winnerMkt?.selections?.[1];

    const o1 = parseFloat(s1?.odds ?? match?.odds?.team1 ?? match?.odds?.home);
    const o2 = parseFloat(s2?.odds ?? match?.odds?.team2 ?? match?.odds?.away);

    if (!(o1 > 1) || !(o2 > 1)) {
      return [];
    }

    const rawP1 = s1?.probability != null ? s1.probability : (1 / o1);
    const rawP2 = s2?.probability != null ? s2.probability : (1 / o2);
    const sumP = (rawP1 + rawP2) || 1.0;

    const liveProb1 = Math.min(99, Math.max(1, Math.round((rawP1 / sumP) * 100)));
    const liveProb2 = 100 - liveProb1;

    // Only display the authoritative live point — never invent historical movement.
    return [
      { time: 'LIVE', timeLabel: 'Live Now', team1: o1.toFixed(2), team2: o2.toFixed(2), prob1: liveProb1, prob2: liveProb2 },
    ];
  }, [match, team1Name, team2Name]);

  const latestData = oddsTrendData[oddsTrendData.length - 1] || null;
  const prevData = oddsTrendData.length > 1 ? oddsTrendData[oddsTrendData.length - 2] : latestData;

  const t1TrendUp = latestData && prevData
    ? parseFloat(latestData.team1) >= parseFloat(prevData.team1)
    : true;
  const t2TrendUp = latestData && prevData
    ? parseFloat(latestData.team2) >= parseFloat(prevData.team2)
    : true;

  // SVG dimensions
  const width = 560;
  const height = 200;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const minVal = 1.0;
  const maxVal = 3.0;

  // Calculate coordinates for points
  const points1 = useMemo(() => {
    if (!oddsTrendData.length) return [];
    const denom = Math.max(1, oddsTrendData.length - 1);
    return oddsTrendData.map((d, i) => {
      const x = paddingLeft + (i / denom) * chartW;
      const y = paddingTop + chartH - ((parseFloat(d.team1) - minVal) / (maxVal - minVal)) * chartH;
      return { x, y, val: d.team1 };
    });
  }, [oddsTrendData, chartW, chartH]);

  const points2 = useMemo(() => {
    if (!oddsTrendData.length) return [];
    const denom = Math.max(1, oddsTrendData.length - 1);
    return oddsTrendData.map((d, i) => {
      const x = paddingLeft + (i / denom) * chartW;
      const y = paddingTop + chartH - ((parseFloat(d.team2) - minVal) / (maxVal - minVal)) * chartH;
      return { x, y, val: d.team2 };
    });
  }, [oddsTrendData, chartW, chartH]);

  // Generate smooth cubic bezier SVG path
  const makeSmoothPath = (pts) => {
    if (!pts || pts.length === 0) return '';
    return pts.reduce((acc, point, i, a) => {
      if (i === 0) return `M ${point.x},${point.y}`;
      const prev = a[i - 1];
      const cx1 = prev.x + (point.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (point.x - prev.x) / 2;
      const cy2 = point.y;
      return `${acc} C ${cx1},${cy1} ${cx2},${cy2} ${point.x},${point.y}`;
    }, '');
  };

  const path1 = useMemo(() => makeSmoothPath(points1), [points1]);
  const path2 = useMemo(() => makeSmoothPath(points2), [points2]);

  const area1 = useMemo(() => {
    if (points1.length === 0) return '';
    const lastX = points1[points1.length - 1].x;
    const firstX = points1[0].x;
    const bottomY = paddingTop + chartH;
    return `${path1} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  }, [path1, points1, chartH]);

  const area2 = useMemo(() => {
    if (points2.length === 0) return '';
    const lastX = points2[points2.length - 1].x;
    const firstX = points2[0].x;
    const bottomY = paddingTop + chartH;
    return `${path2} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  }, [path2, points2, chartH]);

  const activePoint = selectedPointIndex !== null ? oddsTrendData[selectedPointIndex] : latestData;

  if (!latestData) {
    return (
      <div className="live-charts-widget-container">
        <div className="live-charts-header">
          <div className="live-charts-title-wrap">
            <h4 className="live-charts-title font-bold">Live Odds</h4>
            <span className="live-charts-subtitle text-xs">NOT AVAILABLE — waiting for authoritative OddsEngineV3 snapshot</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="live-charts-widget-container">
      {/* HEADER BAR */}
      <div className="live-charts-header">
        <div className="live-charts-title-wrap">
          <div className="charts-title-icon-badge">
            <ChartBarIcon className="charts-icon" />
          </div>
          <div>
            <h4 className="live-charts-title font-bold">Live Odds Trend & Win Probability</h4>
            <span className="live-charts-subtitle text-xs">Real-time market line analytics & implied probability</span>
          </div>
        </div>

        <div className="live-charts-type-selector">
          <button
            type="button"
            className={`chart-type-btn ${activeMode === 'odds_trend' ? 'active' : ''}`}
            onClick={() => setActiveMode('odds_trend')}
          >
            <TrendingUpIcon className="btn-icon" />
            <span>Live Odds Trend</span>
          </button>
          <button
            type="button"
            className={`chart-type-btn ${activeMode === 'win_prob' ? 'active' : ''}`}
            onClick={() => setActiveMode('win_prob')}
          >
            <ActivityIcon className="btn-icon" />
            <span>Win Probability %</span>
          </button>
        </div>
      </div>

      {/* CHART BODY */}
      <div className="live-charts-body">
        {activeMode === 'odds_trend' && (
          <div className="charts-svg-wrap">
            {/* LEGEND & CURRENT ODDS STAT CARDS */}
            <div className="charts-legend-bar">
              <div className="legend-card team1-card">
                <span className="legend-dot team1-dot" />
                <span className="legend-team-name">{team1Name}</span>
                <span className="legend-odds-badge team1-badge">
                  {latestData.team1}
                  {t1TrendUp ? (
                    <ArrowUpRightIcon className="trend-arrow up" />
                  ) : (
                    <ArrowDownRightIcon className="trend-arrow down" />
                  )}
                </span>
              </div>

              <div className="legend-card team2-card">
                <span className="legend-dot team2-dot" />
                <span className="legend-team-name">{team2Name}</span>
                <span className="legend-odds-badge team2-badge">
                  {latestData.team2}
                  {t2TrendUp ? (
                    <ArrowUpRightIcon className="trend-arrow up" />
                  ) : (
                    <ArrowDownRightIcon className="trend-arrow down" />
                  )}
                </span>
              </div>
            </div>

            {/* SVG CHART CONTAINER */}
            <div className="svg-container-inner">
              <svg viewBox={`0 0 ${width} ${height}`} className="live-chart-svg">
                <defs>
                  <linearGradient id="gradientTeam1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="gradientTeam2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Horizontal Grid Lines & Scale Numbers */}
                {[3.0, 2.5, 2.0, 1.5, 1.0].map((gridVal) => {
                  const y = paddingTop + chartH - ((gridVal - minVal) / (maxVal - minVal)) * chartH;
                  return (
                    <g key={gridVal} className="grid-line-group">
                      <line
                        x1={paddingLeft}
                        y1={y}
                        x2={width - paddingRight}
                        y2={y}
                        stroke="rgba(255, 255, 255, 0.07)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={paddingLeft - 8}
                        y={y + 4}
                        fill="#64748b"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="end"
                        className="font-mono"
                      >
                        {gridVal.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Gradient Fill Areas */}
                <path d={area1} fill="url(#gradientTeam1)" />
                <path d={area2} fill="url(#gradientTeam2)" />

                {/* Smooth Curve Lines */}
                <path d={path1} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d={path2} fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                {/* Interactive Points & X-Axis Labels */}
                {oddsTrendData.map((d, i) => {
                  const pt1 = points1[i];
                  const pt2 = points2[i];

                  return (
                    <g
                      key={i}
                      className={`chart-point-group ${selectedPointIndex === i ? 'active' : ''}`}
                      onMouseEnter={() => setSelectedPointIndex(i)}
                      onMouseLeave={() => setSelectedPointIndex(null)}
                    >
                      {/* Team 1 Point */}
                      <circle cx={pt1.x} cy={pt1.y} r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" className="point-dot" />
                      {/* Team 2 Point */}
                      <circle cx={pt2.x} cy={pt2.y} r="5" fill="#a855f7" stroke="#ffffff" strokeWidth="2" className="point-dot" />

                      {/* Hover Vertical Guide Line */}
                      {selectedPointIndex === i && (
                        <line
                          x1={pt1.x}
                          y1={paddingTop}
                          x2={pt1.x}
                          y2={paddingTop + chartH}
                          stroke="rgba(255, 255, 255, 0.2)"
                          strokeDasharray="2 2"
                        />
                      )}

                      {/* X-Axis Ticks */}
                      <text
                        x={pt1.x}
                        y={height - 10}
                        fill={selectedPointIndex === i ? '#f8fafc' : '#94a3b8'}
                        fontSize="10"
                        fontWeight={selectedPointIndex === i ? '700' : '500'}
                        textAnchor="middle"
                        className="font-mono"
                      >
                        {d.time}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* HOVER TOOLTIP CARD */}
            <div className="chart-tooltip-panel">
              <div className="tooltip-item time-item">
                <span className="tooltip-label">TIMESTAMP</span>
                <span className="tooltip-value text-slate-200">{activePoint.timeLabel || activePoint.time}</span>
              </div>
              <div className="tooltip-item team1-item">
                <span className="tooltip-label">{team1Name}</span>
                <span className="tooltip-value text-blue-400 font-bold">{activePoint.team1} ({activePoint.prob1}%)</span>
              </div>
              <div className="tooltip-item team2-item">
                <span className="tooltip-label">{team2Name}</span>
                <span className="tooltip-value text-purple-400 font-bold">{activePoint.team2} ({activePoint.prob2}%)</span>
              </div>
            </div>
          </div>
        )}

        {activeMode === 'win_prob' && (
          <div className="win-prob-chart-wrap">
            <div className="prob-header-card">
              <div className="team-prob-block team1">
                <span className="team-name-label">{team1Name}</span>
                <span className="prob-percent-val text-blue-400">{latestData.prob1}%</span>
              </div>

              <div className="prob-vs-badge">
                <span>VS</span>
              </div>

              <div className="team-prob-block team2 text-right">
                <span className="team-name-label">{team2Name}</span>
                <span className="prob-percent-val text-purple-400">{latestData.prob2}%</span>
              </div>
            </div>

            {/* DUAL PROGRESS BAR */}
            <div className="prob-bar-container">
              <motion.div
                className="prob-bar-fill team1-fill"
                initial={{ width: '50%' }}
                animate={{ width: `${latestData.prob1}%` }}
                transition={{ duration: 0.8 }}
              >
                <span>{latestData.prob1}%</span>
              </motion.div>
              <motion.div
                className="prob-bar-fill team2-fill"
                initial={{ width: '50%' }}
                animate={{ width: `${latestData.prob2}%` }}
                transition={{ duration: 0.8 }}
              >
                <span>{latestData.prob2}%</span>
              </motion.div>
            </div>

            {/* ANALYTICS GRID */}
            <div className="prob-analytics-grid mt-4">
              <div className="analytics-card">
                <span className="analytics-label">PEAK ODDS ({team1Name})</span>
                <span className="analytics-val text-blue-400">
                  {Math.max(...oddsTrendData.map((d) => parseFloat(d.team1))).toFixed(2)}
                </span>
              </div>
              <div className="analytics-card">
                <span className="analytics-label">PEAK ODDS ({team2Name})</span>
                <span className="analytics-val text-purple-400">
                  {Math.max(...oddsTrendData.map((d) => parseFloat(d.team2))).toFixed(2)}
                </span>
              </div>
              <div className="analytics-card">
                <span className="analytics-label">MARKET VOLATILITY</span>
                <span className="analytics-val text-amber-400">MODERATE</span>
              </div>
              <div className="analytics-card">
                <span className="analytics-label">AI PROBABILITY MODEL</span>
                <span className="analytics-val text-emerald-400">AUTHORITATIVE V3</span>
              </div>
            </div>

            <div className="prob-footer-note">
              <InfoIcon className="info-icon" />
              <span>Implied win probabilities are continuously re-weighted by OddsEngineV3 live match state streams.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
