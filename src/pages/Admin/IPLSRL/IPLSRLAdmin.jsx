import { useState } from 'react';
import { getAllIPLSRLTeams, createIPLSRLTeam, updateIPLSRLTeam } from '../../../../lib/iplSrlTeamEngine.mjs';
import { getAllIPLSRLPlayers, updateIPLSRLPlayer } from '../../../../lib/iplSrlPlayerEngine.mjs';
import { getIPLSRLSeason, getIPLSRLStandings } from '../../../../lib/iplSrlEngine.mjs';
import './IPLSRLAdmin.css';

export default function IPLSRLAdmin() {
  const [activeTab, setActiveTab] = useState('simulation'); // 'simulation' | 'teams' | 'players' | 'audit'
  const [simulationSpeed, setSimulationSpeed] = useState('NORMAL'); // 'PAUSED' | 'SLOW' | 'NORMAL' | 'FAST' | 'ULTRA'
  const [pitchCondition, setPitchCondition] = useState('BALANCED');
  const [weatherCondition, setWeatherCondition] = useState('CLEAR');
  const [teams, setTeams] = useState(getAllIPLSRLTeams());
  const [players, setPlayers] = useState(getAllIPLSRLPlayers());
  const [season, setSeason] = useState(getIPLSRLSeason());
  const [auditLogs, setAuditLogs] = useState([
    { id: 1, action: 'Simulation Speed Changed', detail: 'Set to NORMAL', time: 'Just now', admin: 'SuperAdmin' },
    { id: 2, action: 'Team Rating Updated', detail: 'CSK SRL strength adjusted to 85', time: '5 mins ago', admin: 'SuperAdmin' },
  ]);

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShort, setNewTeamShort] = useState('');

  const handleCreateTeam = (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const created = createIPLSRLTeam({ teamName: newTeamName, shortName: newTeamShort || newTeamName.substring(0, 3).toUpperCase() });
    setTeams([...getAllIPLSRLTeams()]);
    setNewTeamName('');
    setNewTeamShort('');
    addAuditLog('Created Team', `Created ${created.teamName}`);
  };

  const addAuditLog = (action, detail) => {
    setAuditLogs(prev => [
      { id: Date.now(), action, detail, time: 'Just now', admin: 'SuperAdmin' },
      ...prev,
    ]);
  };

  return (
    <div className="iplsrl-admin-container">
      <div className="iplsrl-admin-header">
        <div className="iplsrl-admin-title">
          <h2>🏏 IPLSRL Simulation & Competition Control Panel</h2>
          <span className="iplsrl-admin-badge">ADMIN CONTROL SUITE</span>
        </div>
        <div className="iplsrl-admin-tabs">
          {['simulation', 'teams', 'players', 'audit'].map(tab => (
            <button
              key={tab}
              className={`iplsrl-tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'simulation' && (
        <div className="iplsrl-admin-grid">
          <div className="iplsrl-admin-card">
            <h3>⚡ Simulation Control</h3>
            <div className="iplsrl-speed-selector">
              <label>Simulation Speed:</label>
              <div className="iplsrl-speed-buttons">
                {['PAUSED', 'SLOW', 'NORMAL', 'FAST', 'ULTRA'].map(speed => (
                  <button
                    key={speed}
                    className={`speed-btn ${simulationSpeed === speed ? 'active' : ''}`}
                    onClick={() => {
                      setSimulationSpeed(speed);
                      addAuditLog('Speed Updated', `Speed set to ${speed}`);
                    }}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>

            <div className="iplsrl-form-group">
              <label>Pitch Condition:</label>
              <select value={pitchCondition} onChange={e => setPitchCondition(e.target.value)}>
                <option value="BALANCED">Balanced Pitch</option>
                <option value="BATTING_PARADISE">Batting Paradise (High Scoring)</option>
                <option value="SPIN_FRIENDLY">Spin Friendly (Turn & Low Bounce)</option>
                <option value="PACE_BOUNCE">Pace & Bounce (Seam Friendly)</option>
              </select>
            </div>

            <div className="iplsrl-form-group">
              <label>Weather Condition:</label>
              <select value={weatherCondition} onChange={e => setWeatherCondition(e.target.value)}>
                <option value="CLEAR">Clear Sky (Optimal)</option>
                <option value="HUMID">Humid (Dew Factor in 2nd Innings)</option>
                <option value="OVERCAST">Overcast (Swing Assistance)</option>
              </select>
            </div>

            <div className="iplsrl-action-buttons">
              <button className="iplsrl-btn primary" onClick={() => addAuditLog('Match Triggered', 'Manual delivery simulated')}>
                ▶ Trigger Live Delivery
              </button>
              <button className="iplsrl-btn warning" onClick={() => addAuditLog('Match Paused', 'Simulation paused')}>
                ⏸ Pause Active Simulations
              </button>
            </div>
          </div>

          <div className="iplsrl-admin-card">
            <h3>🏆 Active Competition Overview</h3>
            <div className="iplsrl-season-meta">
              <p><strong>Season:</strong> {season.name}</p>
              <p><strong>Edition:</strong> Edition {season.edition}</p>
              <p><strong>Status:</strong> <span className="status-pill active">{season.status}</span></p>
              <p><strong>Active Teams:</strong> {teams.length}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'teams' && (
        <div className="iplsrl-admin-card">
          <h3>🛡️ Manage Teams & Strength Ratings</h3>
          <form className="iplsrl-inline-form" onSubmit={handleCreateTeam}>
            <input
              type="text"
              placeholder="Team Name (e.g. Hyderabad Sunrisers SRL)"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Short Name (e.g. SRH)"
              value={newTeamShort}
              onChange={e => setNewTeamShort(e.target.value)}
            />
            <button type="submit" className="iplsrl-btn primary">Create Team</button>
          </form>

          <table className="iplsrl-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Short</th>
                <th>Venue</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(t => (
                <tr key={t.teamId}>
                  <td><strong>{t.teamName}</strong></td>
                  <td>{t.shortName}</td>
                  <td>{t.homeVenue}</td>
                  <td>
                    <input
                      type="number"
                      value={t.strengthRating}
                      className="rating-input"
                      onChange={e => {
                        updateIPLSRLTeam(t.teamId, { strengthRating: Number(e.target.value) });
                        setTeams([...getAllIPLSRLTeams()]);
                      }}
                    />
                  </td>
                  <td><span className="status-pill active">{t.status}</span></td>
                  <td>
                    <button className="iplsrl-btn sm danger" onClick={() => addAuditLog('Disabled Team', t.teamName)}>
                      Disable
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="iplsrl-admin-card">
          <h3>📋 Immutable Audit Log</h3>
          <table className="iplsrl-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(log => (
                <tr key={log.id}>
                  <td>{log.time}</td>
                  <td><strong>{log.action}</strong></td>
                  <td>{log.detail}</td>
                  <td>{log.admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
