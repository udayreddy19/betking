import { useState } from 'react';
import { getAllIPLSRLTeams, createIPLSRLTeam, updateIPLSRLTeam } from '../../../../lib/iplSrlTeamEngine.mjs';
import { getAllIPLSRLPlayers, updateIPLSRLPlayer, createIPLSRLPlayer, PLAYER_ROLES } from '../../../../lib/iplSrlPlayerEngine.mjs';
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
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerTeam, setNewPlayerTeam] = useState('csk_srl');
  const [newPlayerRole, setNewPlayerRole] = useState(PLAYER_ROLES.BATTER);
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

  const handleCreatePlayer = (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    const created = createIPLSRLPlayer({
      name: newPlayerName,
      displayName: newPlayerName.split(' ').map(w => w[0]).join(' ') + ' ' + newPlayerName.split(' ').slice(-1)[0],
      teamId: newPlayerTeam,
      role: newPlayerRole,
    });
    setPlayers([...getAllIPLSRLPlayers()]);
    setNewPlayerName('');
    addAuditLog('Created Player', `Added ${created.name} to ${created.teamId}`);
  };

  const filteredPlayers = players.filter(p => {
    const matchesTeam = selectedTeamFilter === 'ALL' || p.teamId === selectedTeamFilter;
    const matchesSearch = !playerSearchQuery || p.name.toLowerCase().includes(playerSearchQuery.toLowerCase()) || p.displayName.toLowerCase().includes(playerSearchQuery.toLowerCase());
    return matchesTeam && matchesSearch;
  });

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

      {activeTab === 'players' && (
        <div className="iplsrl-admin-card">
          <h3>👤 Manage Player Roster & Player Names</h3>
          <p className="iplsrl-card-sub text-muted">
            Edit player full names, display names, team assignments, roles, and skill ratings in real time.
          </p>

          <form className="iplsrl-inline-form" onSubmit={handleCreatePlayer} style={{ marginBottom: '1.25rem' }}>
            <input
              type="text"
              placeholder="Player Name (e.g. Jasprit Bumrah SRL)"
              value={newPlayerName}
              onChange={e => setNewPlayerName(e.target.value)}
              style={{ flex: 2 }}
            />
            <select value={newPlayerTeam} onChange={e => setNewPlayerTeam(e.target.value)}>
              {teams.map(t => (
                <option key={t.teamId} value={t.teamId}>{t.shortName} ({t.teamName})</option>
              ))}
            </select>
            <select value={newPlayerRole} onChange={e => setNewPlayerRole(e.target.value)}>
              {Object.entries(PLAYER_ROLES).map(([key, val]) => (
                <option key={key} value={val}>{val}</option>
              ))}
            </select>
            <button type="submit" className="iplsrl-btn primary">Add Player</button>
          </form>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="🔍 Search players by name..."
                value={playerSearchQuery}
                onChange={e => setPlayerSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
              />
            </div>
            <div>
              <select
                value={selectedTeamFilter}
                onChange={e => setSelectedTeamFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
              >
                <option value="ALL">All Teams ({players.length} Players)</option>
                {teams.map(t => (
                  <option key={t.teamId} value={t.teamId}>{t.shortName}</option>
                ))}
              </select>
            </div>
          </div>

          <table className="iplsrl-table">
            <thead>
              <tr>
                <th>Player Full Name</th>
                <th>Display Name</th>
                <th>Team</th>
                <th>Role</th>
                <th>Batting</th>
                <th>Bowling</th>
                <th>Form</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map(p => (
                <tr key={p.playerId}>
                  <td>
                    <input
                      type="text"
                      value={p.name}
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.35rem 0.5rem', borderRadius: '4px', width: '100%', fontWeight: '600' }}
                      onChange={e => {
                        const updatedName = e.target.value;
                        updateIPLSRLPlayer(p.playerId, { name: updatedName });
                        setPlayers([...getAllIPLSRLPlayers()]);
                        addAuditLog('Updated Player Name', `${p.playerId} -> ${updatedName}`);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={p.displayName || ''}
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.35rem 0.5rem', borderRadius: '4px', width: '100%' }}
                      onChange={e => {
                        const updatedDisplay = e.target.value;
                        updateIPLSRLPlayer(p.playerId, { displayName: updatedDisplay });
                        setPlayers([...getAllIPLSRLPlayers()]);
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={p.teamId || ''}
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.35rem 0.5rem', borderRadius: '4px' }}
                      onChange={e => {
                        updateIPLSRLPlayer(p.playerId, { teamId: e.target.value });
                        setPlayers([...getAllIPLSRLPlayers()]);
                      }}
                    >
                      {teams.map(t => (
                        <option key={t.teamId} value={t.teamId}>{t.shortName}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={p.role}
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.35rem 0.5rem', borderRadius: '4px' }}
                      onChange={e => {
                        updateIPLSRLPlayer(p.playerId, { role: e.target.value });
                        setPlayers([...getAllIPLSRLPlayers()]);
                      }}
                    >
                      {Object.entries(PLAYER_ROLES).map(([key, val]) => (
                        <option key={key} value={val}>{val}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={p.battingRating}
                      className="rating-input"
                      onChange={e => {
                        updateIPLSRLPlayer(p.playerId, { battingRating: Number(e.target.value) });
                        setPlayers([...getAllIPLSRLPlayers()]);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={p.bowlingRating}
                      className="rating-input"
                      onChange={e => {
                        updateIPLSRLPlayer(p.playerId, { bowlingRating: Number(e.target.value) });
                        setPlayers([...getAllIPLSRLPlayers()]);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={p.formRating}
                      className="rating-input"
                      onChange={e => {
                        updateIPLSRLPlayer(p.playerId, { formRating: Number(e.target.value) });
                        setPlayers([...getAllIPLSRLPlayers()]);
                      }}
                    />
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
