import { getIPLSRLStandings, getIPLSRLPlayoffs } from '../../../lib/iplSrlEngine.mjs';

export default function IPLSRLStandings() {
  const standings = getIPLSRLStandings();
  const playoffs = getIPLSRLPlayoffs();

  return (
    <div className="iplsrl-hub-container">
      <h2>📊 IPLSRL Standings & Playoff Brackets</h2>

      <div className="iplsrl-section">
        <h3>Points Table</h3>
        <table className="iplsrl-mini-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>L</th>
              <th>NR</th>
              <th>PTS</th>
              <th>NRR</th>
              <th>Runs For</th>
              <th>Runs Against</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(s => (
              <tr key={s.teamId} className={s.rank <= 4 ? 'playoff-qualified' : ''}>
                <td><strong>#{s.rank}</strong></td>
                <td><strong>{s.teamName}</strong></td>
                <td>{s.matches}</td>
                <td>{s.won}</td>
                <td>{s.lost}</td>
                <td>{s.noResult}</td>
                <td><strong>{s.points}</strong></td>
                <td>{s.nrr > 0 ? `+${s.nrr}` : s.nrr}</td>
                <td>{s.runsFor} ({s.oversFor} ov)</td>
                <td>{s.runsAgainst} ({s.oversAgainst} ov)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="iplsrl-section" style={{ marginTop: '30px' }}>
        <h3>🏆 Playoff Brackets</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '16px' }}>
          {playoffs.map(p => (
            <div key={p.fixtureId} style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f97316' }}>{p.matchNumber}</span>
              <h4 style={{ margin: '8px 0' }}>{p.homeTeamName} vs {p.awayTeamName}</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Venue: {p.venue}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
