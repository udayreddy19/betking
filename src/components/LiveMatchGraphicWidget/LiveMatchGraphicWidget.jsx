import { useState, useMemo } from 'react';
import { HiOutlineViewList, HiOutlineChartBar, HiOutlineUsers, HiOutlineVideoCamera } from 'react-icons/hi';
import { IoShirtOutline } from 'react-icons/io5';
import LiveStreamPlayer from '../LiveStreamPlayer/LiveStreamPlayer';
import PlayerStatsPanel from '../PlayerStatsPanel/PlayerStatsPanel';
import { useMatchPlayers } from '../../hooks/useMatchPlayers';
import './LiveMatchGraphicWidget.css';

const playerRosterMap = {
  'London Spirit W': {
    batters: ['M. Bouchier', 'S. Molineux', 'A. Capsey', 'D. Wyatt'],
    bowlers: ['C. Dean', 'L. Smith', 'A. Capsey'],
  },
  'Southern Brave W': {
    batters: ['D. Wyatt', 'S. Taylor', 'M. Bouchier', 'G. Adams'],
    bowlers: ['C. Dean', 'L. Smith', 'A. Capsey'],
  },
  'Birmingham Phoenix': {
    batters: ['J. Root', 'J. Cox', 'L. Livingstone', 'W. Smeed'],
    bowlers: ['A. Zampa', 'T. Southee', 'S. Mahmood'],
  },
  'Welsh Fire': {
    batters: ['J. Bairstow', 'T. Kohler-Cadmore', 'D. Payne', 'L. Wells'],
    bowlers: ['S. Mahmood', 'D. Payne', 'M. Crane'],
  },
  'South Delhi Superstarz': {
    batters: ['Priyansh Arya', 'Tejaswi Dahiya', 'Ayush Badoni', 'Dhruv Singh'],
    bowlers: ['Kuldip Yadav', 'Digvesh Rathi', 'Sarthak Ray'],
  },
  'East Delhi Riders': {
    batters: ['Anuj Rawat', 'Sujal Singh', 'Hardik Sharma', 'Rohan Rathi'],
    bowlers: ['Simarjeet Singh', 'Navdeep Saini', 'Harsh Tyagi'],
  },
};

const WAGON_SECTORS = [
  { runs: 10, angle: 0 },
  { runs: 2, angle: 45 },
  { runs: 3, angle: 90 },
  { runs: 13, angle: 135 },
  { runs: 4, angle: 180 },
  { runs: 13, angle: 225 },
  { runs: 1, angle: 270 },
  { runs: 0, angle: 315 },
];

function getTeamShort(name) {
  return name.replace(' W', '').split(' ')[0].slice(0, 3).toUpperCase();
}

function getInningsInfo(match, team1, team2, score1, wickets1, score2, wickets2, overs) {
  const overs2 = match?.liveDetails?.overs2 || overs;
  const hasSecondInnings = score2 > 0 || wickets2 > 0 || match?.liveDetails?.score2 !== undefined;
  const isChasing = hasSecondInnings && match?.matchState === 'in';

  if (isChasing) {
    return {
      inningsNum: 2,
      battingTeam: team2,
      battingShort: getTeamShort(team2),
      displayScore1: score1,
      displayWickets1: wickets1,
      displayScore2: score2,
      displayWickets2: wickets2,
      displayOvers: overs2,
      defaultInnings: `${getTeamShort(team2)} INNS`,
    };
  }

  return {
    inningsNum: 1,
    battingTeam: team1,
    battingShort: getTeamShort(team1),
    displayScore1: score1,
    displayWickets1: wickets1,
    displayScore2: score2,
    displayWickets2: wickets2,
    displayOvers: overs,
    defaultInnings: `${getTeamShort(team1)} INNS`,
  };
}

function WagonWheel() {
  const cx = 60;
  const cy = 60;
  const r = 52;

  return (
    <svg className="wagon-wheel" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="rgba(15,23,42,0.55)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      {WAGON_SECTORS.map((sector, i) => {
        const startAngle = (sector.angle - 22.5) * (Math.PI / 180);
        const endAngle = (sector.angle + 22.5) * (Math.PI / 180);
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const midAngle = sector.angle * (Math.PI / 180);
        const labelR = r * 0.62;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);

        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x1} y2={y1} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="wagon-label">
              {sector.runs}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="6" fill="#c4a35a" />
    </svg>
  );
}

export default function LiveMatchGraphicWidget({ match }) {
  const [activeWidgetTab, setActiveWidgetTab] = useState('field');
  const [selectedInnings, setSelectedInnings] = useState('');
  const { players, source, loading: playersLoading, refreshing: playersRefreshing, error: playersError } = useMatchPlayers(match);

  const sport = match?.sport || 'cricket';
  const team1 = match?.team1?.name || 'Team 1';
  const team2 = match?.team2?.name || 'Team 2';
  const leagueLabel = (match?.league || 'CRICKET').toUpperCase();

  const score1 = match?.liveDetails?.runs ?? 0;
  const wickets1 = match?.liveDetails?.wickets ?? 0;
  const score2 = match?.liveDetails?.score2 ?? 0;
  const wickets2 = match?.liveDetails?.wickets2 ?? 0;
  const overs = match?.liveDetails?.overs || '0.0';
  const matchState = match?.matchState || (match?.isLive ? 'in' : 'pre');

  const innings = match
    ? getInningsInfo(match, team1, team2, score1, wickets1, score2, wickets2, overs)
    : null;
  const activeInnings = selectedInnings || innings?.defaultInnings || '';

  const t1Data = playerRosterMap[team1] || {
    batters: [`${team1.split(' ')[0]} Batter 1`, `${team1.split(' ')[0]} Batter 2`],
    bowlers: [`${team1.split(' ')[0]} Bowler`],
  };
  const t2Data = playerRosterMap[team2] || {
    batters: [`${team2.split(' ')[0]} Batter 1`, `${team2.split(' ')[0]} Batter 2`],
    bowlers: [`${team2.split(' ')[0]} Bowler`],
  };

  const team1Short = getTeamShort(team1);
  const team2Short = getTeamShort(team2);
  const battingRoster = activeInnings.includes(team2Short) ? t2Data : t1Data;
  const bowlingRoster = activeInnings.includes(team2Short) ? t1Data : t2Data;

  const striker = match?.liveDetails?.batter1?.name || battingRoster.batters[0];
  const nonStriker = match?.liveDetails?.batter2?.name || battingRoster.batters[1];
  const bowler = match?.liveDetails?.bowler?.name || bowlingRoster.bowlers[0];

  const currentOverNum = Math.max(1, Math.ceil(parseFloat(
    innings?.inningsNum === 2 ? (match?.liveDetails?.overs2 || overs) : overs
  ) || 1));
  const overBalls = match?.liveDetails?.currentOverBalls || ['2', '1', '1', '4', '1'];

  const wicketOvers = useMemo(() => {
    const seed = (match?.id || 'm1').charCodeAt(1) || 2;
    return new Set([1, (seed % 5) + 6, (seed % 4) + 10].filter(o => o <= 20));
  }, [match?.id]);

  const b1 = useMemo(() => ({
    name: striker,
    runs: match?.liveDetails?.batter1?.runs ?? Math.max(12, Math.floor(score2 * 0.38) || 28),
    balls: match?.liveDetails?.batter1?.balls ?? Math.max(8, Math.floor(score2 * 0.24) || 22),
    fours: match?.liveDetails?.batter1?.fours ?? 3,
    sixes: match?.liveDetails?.batter1?.sixes ?? 1,
  }), [match, score2, striker]);

  const b2 = useMemo(() => ({
    name: nonStriker,
    runs: match?.liveDetails?.batter2?.runs ?? Math.max(5, Math.floor(score2 * 0.22) || 14),
    balls: match?.liveDetails?.batter2?.balls ?? Math.max(4, Math.floor(score2 * 0.15) || 11),
    fours: match?.liveDetails?.batter2?.fours ?? 1,
    sixes: match?.liveDetails?.batter2?.sixes ?? 0,
  }), [match, score2, nonStriker]);

  if (!match) {
    return (
      <div className="live-graphic-card-10cric live-graphic-empty">
        <p>Select a match to view live tracker</p>
      </div>
    );
  }

  if (sport !== 'cricket' && sport !== 'virtual-cricket') {
    return (
      <div className="live-graphic-card-10cric">
        <div className="live-widget-league">{leagueLabel}</div>
        <div className="live-widget-body">
          <div className="live-widget-teams-row">
            <span>{team1}</span>
            <span className="live-widget-scoreline">
              {match.liveDetails?.score1 ?? 0} : {match.liveDetails?.score2 ?? 0}
            </span>
            <span>{team2}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="live-graphic-card-10cric">
      <div className="live-widget-league">{leagueLabel}</div>

      <div className="live-widget-body">
        <div className="live-widget-inn-badge">
          {matchState === 'in'
            ? `INN ${innings.inningsNum} | ${innings.displayOvers}/20 OV`
            : matchState === 'post'
              ? 'MATCH COMPLETE'
              : 'UPCOMING'}
        </div>

        <div className="live-widget-teams-row">
          <span className="live-widget-team">{team1.replace(' W', '')}</span>
          <span className="live-widget-scoreline">
            {innings.displayScore1}/{innings.displayWickets1}
            <span className="live-widget-score-sep">:</span>
            {innings.displayScore2}/{innings.displayWickets2}
          </span>
          <span className="live-widget-team">{team2.replace(' W', '')}</span>
        </div>

        <div className="live-widget-innings-select-wrap">
          <select
            className="live-widget-innings-select"
            value={activeInnings}
            onChange={e => setSelectedInnings(e.target.value)}
          >
            <option value={`${team1Short} INNS`}>{team1Short} INNS</option>
            <option value={`${team2Short} INNS`}>{team2Short} INNS</option>
          </select>
        </div>

        <div className="live-widget-timeline" aria-hidden="true">
          <div className="live-widget-timeline-track">
            {Array.from({ length: 21 }, (_, i) => (
              <div key={i} className="live-widget-timeline-tick">
                {wicketOvers.has(i) && i > 0 && <span className="live-widget-wicket">W</span>}
                {i % 2 === 0 && <span className="live-widget-timeline-label">{i}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="live-widget-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'video'}
            onClick={() => setActiveWidgetTab('video')}
            className={`live-widget-tab ${activeWidgetTab === 'video' ? 'active' : ''}`}
          >
            <HiOutlineVideoCamera />
            <span className="live-widget-tab-label">Video</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'field'}
            onClick={() => setActiveWidgetTab('field')}
            className={`live-widget-tab ${activeWidgetTab === 'field' ? 'active' : ''}`}
          >
            <span className="live-widget-tab-icon live-widget-tab-icon--stadium">🏟</span>
            <span className="live-widget-tab-label">Field</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'scorecard'}
            onClick={() => setActiveWidgetTab('scorecard')}
            className={`live-widget-tab ${activeWidgetTab === 'scorecard' ? 'active' : ''}`}
          >
            <HiOutlineViewList />
            <span className="live-widget-tab-label">Score</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'stats'}
            onClick={() => setActiveWidgetTab('stats')}
            className={`live-widget-tab ${activeWidgetTab === 'stats' ? 'active' : ''}`}
          >
            <HiOutlineChartBar />
            <span className="live-widget-tab-label">Stats</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'lineups'}
            onClick={() => setActiveWidgetTab('lineups')}
            className={`live-widget-tab ${activeWidgetTab === 'lineups' ? 'active' : ''}`}
          >
            <HiOutlineUsers />
            <span className="live-widget-tab-label">Players</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWidgetTab === 'kits'}
            onClick={() => setActiveWidgetTab('kits')}
            className={`live-widget-tab ${activeWidgetTab === 'kits' ? 'active' : ''}`}
          >
            <IoShirtOutline />
            <span className="live-widget-tab-label">Kits</span>
          </button>
        </div>

        {activeWidgetTab === 'video' && (
          <LiveStreamPlayer match={match} />
        )}

        {activeWidgetTab === 'field' && (
          <div className="live-widget-visualizer">
            <div className="live-widget-player-bar">
              <div className="live-widget-bowler">
                <span className="live-widget-bowler-icon">🏏</span>
                <span className="live-widget-bowler-name">{bowler}</span>
              </div>
              <div className="live-widget-batters">
                <span className="live-widget-striker">{striker}</span>
                <span className="live-widget-non-striker">{nonStriker}</span>
              </div>
              <div className="live-widget-wicket-icon" title="Last ball">
                <span>🏏</span>
              </div>
            </div>

            <div className="live-widget-pitch">
              <div className="live-widget-pitch-grass" />
              <div className="live-widget-pitch-strip" />
              <div className="live-widget-batsman" />

              <div className="live-widget-over-box">
                <div className="live-widget-over-label">OVER {currentOverNum}</div>
                <div className="live-widget-over-balls">
                  {overBalls.map((ball, idx) => (
                    <span key={idx} className={`live-widget-ball ${ball === '4' ? 'boundary' : ''}`}>
                      {ball}
                    </span>
                  ))}
                </div>
              </div>

              <div className="live-widget-wagon-wrap">
                <WagonWheel />
              </div>
            </div>
          </div>
        )}

        {activeWidgetTab === 'scorecard' && (
          <div className="live-widget-panel">
            <h4 className="live-widget-panel-title">Scorecard</h4>
            <div className="live-widget-scorecard-row header">
              <span>Batter</span><span>R</span><span>B</span><span>4s</span><span>6s</span>
            </div>
            <div className="live-widget-scorecard-row striker">
              <span>{b1.name}</span><span>{b1.runs}</span><span>{b1.balls}</span><span>{b1.fours}</span><span>{b1.sixes}</span>
            </div>
            <div className="live-widget-scorecard-row">
              <span>{b2.name}</span><span>{b2.runs}</span><span>{b2.balls}</span><span>{b2.fours}</span><span>{b2.sixes}</span>
            </div>
            <div className="live-widget-scorecard-bowler">
              <span>Bowler</span>
              <span>{bowler}</span>
            </div>
          </div>
        )}

        {activeWidgetTab === 'stats' && (
          <div className="live-widget-panel">
            <h4 className="live-widget-panel-title">Match statistics</h4>
            <div className="live-widget-stat-bar">
              <span>{team1.replace(' W', '')}</span>
              <span>{team2.replace(' W', '')}</span>
            </div>
            <div className="live-widget-prob-track">
              <div
                className="live-widget-prob-fill team1"
                style={{ width: `${Math.min(85, Math.max(15, Math.round((score1 / (score2 || score1 || 1)) * 50)))}%` }}
              />
            </div>
            <div className="live-widget-stat-grid">
              <div><span>Run rate</span><strong>{(score2 / Math.max(1, parseFloat(overs) || 1)).toFixed(2)}</strong></div>
              <div><span>Boundaries</span><strong>{b1.fours + b2.fours + b1.sixes + b2.sixes}</strong></div>
            </div>
          </div>
        )}

        {activeWidgetTab === 'lineups' && (
          <PlayerStatsPanel
            players={players}
            source={source}
            loading={playersLoading}
            refreshing={playersRefreshing}
            error={playersError}
            team1={team1}
            team2={team2}
          />
        )}

        {activeWidgetTab === 'kits' && (
          <div className="live-widget-panel live-widget-kits">
            <div className="live-widget-kit-card">
              <IoShirtOutline className="live-widget-kit-icon" style={{ color: match.team1?.color || '#6366f1' }} />
              <span>{team1.replace(' W', '')}</span>
            </div>
            <div className="live-widget-kit-card">
              <IoShirtOutline className="live-widget-kit-icon" style={{ color: match.team2?.color || '#ef4444' }} />
              <span>{team2.replace(' W', '')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
