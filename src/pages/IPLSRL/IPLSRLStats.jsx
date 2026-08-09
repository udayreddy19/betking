import { getIPLSRLStatistics, getIPLSRLRecords } from '../../../lib/statisticsEngine.mjs';

export default function IPLSRLStats() {
  const stats = getIPLSRLStatistics();
  const records = getIPLSRLRecords();

  return (
    <div className="iplsrl-hub-container">
      <h2>🏆 IPLSRL Leaderboards & Historical Records</h2>

      <div className="iplsrl-admin-grid" style={{ marginTop: '20px' }}>
        {/* Golden Bat Leaderboard */}
        <div className="iplsrl-admin-card">
          <h3>🏏 Golden Bat (Top Run Scorers)</h3>
          <table className="iplsrl-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Team</th>
                <th>Runs</th>
                <th>SR</th>
              </tr>
            </thead>
            <tbody>
              {stats.goldenBatLeaderboard.map(p => (
                <tr key={p.rank}>
                  <td><strong>#{p.rank}</strong></td>
                  <td>{p.name}</td>
                  <td>{p.team}</td>
                  <td><strong>{p.runs}</strong></td>
                  <td>{p.sr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Golden Ball Leaderboard */}
        <div className="iplsrl-admin-card">
          <h3>⚡ Golden Ball (Top Wicket Takers)</h3>
          <table className="iplsrl-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Team</th>
                <th>Wickets</th>
                <th>Econ</th>
              </tr>
            </thead>
            <tbody>
              {stats.goldenBallLeaderboard.map(p => (
                <tr key={p.rank}>
                  <td><strong>#{p.rank}</strong></td>
                  <td>{p.name}</td>
                  <td>{p.team}</td>
                  <td><strong>{p.wickets}</strong></td>
                  <td>{p.economy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Records Section */}
      <div className="iplsrl-section" style={{ marginTop: '30px' }}>
        <h3>📜 All-Time Competition Records</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginTop: '16px' }}>
          <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f97316' }}>HIGHEST INDIVIDUAL SCORE</span>
            <h4 style={{ margin: '6px 0' }}>{records.highestIndividualScore.player}</h4>
            <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>{records.highestIndividualScore.score} ({records.highestIndividualScore.balls} balls)</p>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f97316' }}>BEST BOWLING FIGURES</span>
            <h4 style={{ margin: '6px 0' }}>{records.bestBowlingFigures.player}</h4>
            <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>{records.bestBowlingFigures.figures} ({records.bestBowlingFigures.overs} overs)</p>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f97316' }}>FASTEST FIFTY</span>
            <h4 style={{ margin: '6px 0' }}>{records.fastestFifty.player}</h4>
            <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>50 off {records.fastestFifty.balls} balls</p>
          </div>
        </div>
      </div>
    </div>
  );
}
