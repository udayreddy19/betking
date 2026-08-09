import { useState } from 'react';
import { getAllIPLSRLTeams } from '../../../lib/iplSrlTeamEngine.mjs';
import { getIPLSRLPlayersByTeam } from '../../../lib/iplSrlPlayerEngine.mjs';

export default function IPLSRLTeams() {
  const teams = getAllIPLSRLTeams();
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.teamId || 'csk_srl');

  const selectedTeam = teams.find(t => t.teamId === selectedTeamId) || teams[0];
  const squad = getIPLSRLPlayersByTeam(selectedTeamId);

  return (
    <div className="iplsrl-hub-container">
      <h2>🛡️ IPLSRL Franchise Teams & Squad Rosters</h2>

      <div style={{ display: 'flex', gap: '10px', margin: '20px 0', flexWrap: 'wrap' }}>
        {teams.map(t => (
          <button
            key={t.teamId}
            onClick={() => setSelectedTeamId(t.teamId)}
            style={{
              padding: '10px 16px',
              background: selectedTeamId === t.teamId ? '#f97316' : 'var(--color-surface)',
              color: selectedTeamId === t.teamId ? '#fff' : 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.logo} {t.shortName}
          </button>
        ))}
      </div>

      <div className="iplsrl-hero-match-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '3rem' }}>{selectedTeam.logo}</span>
          <div>
            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{selectedTeam.teamName}</h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: '4px 0' }}>Home Venue: {selectedTeam.homeVenue}</p>
            <span className="iplsrl-badge">Strength Rating: {selectedTeam.strengthRating}</span>
          </div>
        </div>
      </div>

      <div className="iplsrl-section">
        <h3>Squad Players ({squad.length})</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px', marginTop: '14px' }}>
          {squad.map(p => (
            <div key={p.playerId} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                <span>{p.name}</span>
                <span style={{ color: '#f97316', fontSize: '0.8rem' }}>{p.role}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
                <p>Batting Rating: <strong>{p.battingRating}</strong> ({p.battingStyle})</p>
                <p>Bowling Rating: <strong>{p.bowlingRating}</strong> ({p.bowlingStyle})</p>
                <p>Career Runs: <strong>{p.stats.runs}</strong> | Wickets: <strong>{p.stats.wickets}</strong></p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
