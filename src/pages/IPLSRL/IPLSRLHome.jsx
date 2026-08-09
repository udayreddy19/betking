import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIPLSRLSeason, getIPLSRLStandings, getIPLSRLFixtures } from '../../../lib/iplSrlEngine.mjs';
import { getAllIPLSRLTeams } from '../../../lib/iplSrlTeamEngine.mjs';
import { formatInr } from '../../utils/walletBalance';
import { useBetSlip } from '../../context/BetSlipContext';
import './IPLSRLHome.css';

export default function IPLSRLHome() {
  const navigate = useNavigate();
  const { addBet } = useBetSlip();
  const season = getIPLSRLSeason();
  const standings = getIPLSRLStandings();
  const fixtures = getIPLSRLFixtures();
  const teams = getAllIPLSRLTeams();

  // Simulated Live Match state
  const [liveMatch, setLiveMatch] = useState({
    matchId: 'fix_IPLSRL_2026_m1',
    homeTeam: teams[0],
    awayTeam: teams[1],
    scoreHome: '178/4 (18.2 overs)',
    scoreAway: 'Yet to bat',
    target: 196,
    crr: 9.70,
    rrr: 8.45,
    status: 'IN_PROGRESS',
    recentBalls: ['4', '1', '6', 'W', '1', '2'],
    homeOdds: 1.62,
    awayOdds: 2.35,
  });

  return (
    <div className="iplsrl-hub-container">
      {/* Disclaimer Banner */}
      <div className="iplsrl-disclaimer-banner">
        <span className="iplsrl-badge">SIMULATED REALITY LEAGUE</span>
        <span>IPLSRL is a virtual simulated cricket competition. All match outcomes are AI & probability simulated.</span>
      </div>

      {/* Hero Live Match Feature */}
      <div className="iplsrl-hero-match-card">
        <div className="iplsrl-hero-header">
          <span className="live-indicator">🔴 LIVE NOW</span>
          <span>{season.name} · League Match #1</span>
        </div>

        <div className="iplsrl-teams-versus">
          <div className="iplsrl-team-side">
            <span className="team-logo">{liveMatch.homeTeam.logo}</span>
            <div className="team-info">
              <h4>{liveMatch.homeTeam.teamName}</h4>
              <p className="team-score">{liveMatch.scoreHome}</p>
            </div>
          </div>

          <div className="iplsrl-vs-divider">
            <span className="vs-badge">VS</span>
            <span className="rr-info">CRR: {liveMatch.crr}</span>
          </div>

          <div className="iplsrl-team-side away">
            <div className="team-info">
              <h4>{liveMatch.awayTeam.teamName}</h4>
              <p className="team-score">{liveMatch.scoreAway}</p>
            </div>
            <span className="team-logo">{liveMatch.awayTeam.logo}</span>
          </div>
        </div>

        {/* Live Recent Balls */}
        <div className="iplsrl-recent-balls">
          <span>Recent:</span>
          {liveMatch.recentBalls.map((b, i) => (
            <span key={i} className={`ball-chip ${b === '6' || b === '4' ? 'boundary' : b === 'W' ? 'wicket' : ''}`}>
              {b}
            </span>
          ))}
        </div>

        {/* Live Quick Odds */}
        <div className="iplsrl-hero-odds">
          <button
            type="button"
            className="iplsrl-odds-btn"
            onClick={() => addBet({ id: `${liveMatch.matchId}_1`, match: `${liveMatch.homeTeam.shortName} vs ${liveMatch.awayTeam.shortName}`, selection: `${liveMatch.homeTeam.shortName} to Win`, odds: liveMatch.homeOdds })}
          >
            <span>{liveMatch.homeTeam.shortName} Win</span>
            <span className="val">{liveMatch.homeOdds.toFixed(2)}</span>
          </button>

          <button
            type="button"
            className="iplsrl-odds-btn"
            onClick={() => addBet({ id: `${liveMatch.matchId}_2`, match: `${liveMatch.homeTeam.shortName} vs ${liveMatch.awayTeam.shortName}`, selection: `${liveMatch.awayTeam.shortName} to Win`, odds: liveMatch.awayOdds })}
          >
            <span>{liveMatch.awayTeam.shortName} Win</span>
            <span className="val">{liveMatch.awayOdds.toFixed(2)}</span>
          </button>

          <button
            type="button"
            className="iplsrl-btn-center"
            onClick={() => navigate('/iplsrl/match-center')}
          >
            Enter Live Match Center ➔
          </button>
        </div>
      </div>

      {/* IPLSRL Navigation Grid */}
      <div className="iplsrl-sub-nav">
        <button onClick={() => navigate('/iplsrl/standings')}>📊 Standings & Playoffs</button>
        <button onClick={() => navigate('/iplsrl/stats')}>🏆 Orange & Purple Cap Leaderboards</button>
        <button onClick={() => navigate('/iplsrl/teams')}>🛡️ Teams & Squad Rosters</button>
      </div>

      {/* Upcoming IPL Daily Schedule (7:30 PM IST) */}
      <div className="iplsrl-section" style={{ marginBottom: '30px' }}>
        <h3>📅 Upcoming IPL Match Schedule (Daily @ 7:30 PM IST)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '12px' }}>
          {fixtures.slice(0, 6).map(f => (
            <div key={f.fixtureId} style={{ background: 'var(--color-surface)', padding: '14px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#f97316', fontWeight: 800 }}>
                <span>MATCH #{f.matchNumber}</span>
                <span>{f.timeDisplay || '07:30 PM IST'}</span>
              </div>
              <h4 style={{ margin: '8px 0', fontSize: '1rem' }}>{f.homeTeamShort} vs {f.awayTeamShort}</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>Date: {f.date}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Standings Quick Preview */}
      <div className="iplsrl-section">
        <h3>🏆 Points Table Preview</h3>
        <table className="iplsrl-mini-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>L</th>
              <th>PTS</th>
              <th>NRR</th>
            </tr>
          </thead>
          <tbody>
            {standings.slice(0, 4).map(s => (
              <tr key={s.teamId}>
                <td><strong>#{s.rank}</strong></td>
                <td>{s.teamName}</td>
                <td>{s.matches}</td>
                <td>{s.won}</td>
                <td>{s.lost}</td>
                <td><strong>{s.points}</strong></td>
                <td>{s.nrr > 0 ? `+${s.nrr}` : s.nrr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
