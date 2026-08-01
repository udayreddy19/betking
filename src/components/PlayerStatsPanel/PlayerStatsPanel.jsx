import { useMemo, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { getSourceLabel } from '../../services/playerStatsService';
import './PlayerStatsPanel.css';

function StatCell({ label, value }) {
  if (value === null || value === undefined || value === '—') return null;
  return (
    <div className="player-stat-cell">
      <span className="player-stat-label">{label}</span>
      <span className="player-stat-value">{value}</span>
    </div>
  );
}

function PlayerCardSkeleton() {
  return (
    <div className="player-card player-card--skeleton" aria-hidden="true">
      <div className="player-card-header">
        <div className="player-avatar player-avatar--skeleton" />
        <div className="player-card-info">
          <div className="skeleton-line skeleton-line--name" />
          <div className="skeleton-line skeleton-line--meta" />
          <div className="skeleton-line skeleton-line--stat" />
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, expanded, onToggle }) {
  const ms = player.matchStats;
  const batting = ms && !ms.bowling ? ms : ms?.runs !== undefined ? ms : null;
  const bowling = ms?.bowling || (player.bowling && !batting ? { ...player.bowling } : null);

  return (
    <article className={`player-card ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="player-card-header" onClick={onToggle}>
        {player.headshot ? (
          <img src={player.headshot} alt="" className="player-avatar" loading="lazy" />
        ) : (
          <div className="player-avatar player-avatar--placeholder">🏏</div>
        )}
        <div className="player-card-info">
          <span className="player-name">{player.name}</span>
          <span className="player-meta">{player.role} · {player.team}</span>
          {batting && (
            <span className="player-live-stat">
              {batting.runs} ({batting.balls}) · 4s {batting.fours} · 6s {batting.sixes}
            </span>
          )}
          {bowling && !batting && (
            <span className="player-live-stat">
              {bowling.wickets}/{bowling.runs ?? '—'} ({bowling.overs} ov)
            </span>
          )}
        </div>
        <span className="player-expand-icon">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="player-card-body">
          <div className="player-styles">
            <span>🪶 {player.battingStyle}</span>
            {player.bowlingStyle && player.bowlingStyle !== '—' && (
              <span>🎯 {player.bowlingStyle}</span>
            )}
          </div>

          {player.t20 && (
            <div className="player-stat-group">
              <h5>T20 career</h5>
              <div className="player-stat-grid">
                <StatCell label="Matches" value={player.t20.matches} />
                <StatCell label="Runs" value={player.t20.runs} />
                <StatCell label="Avg" value={player.t20.average} />
                <StatCell label="SR" value={player.t20.strikeRate} />
              </div>
            </div>
          )}

          {player.bowling && (
            <div className="player-stat-group">
              <h5>Bowling</h5>
              <div className="player-stat-grid">
                <StatCell label="Wkts" value={player.bowling.wickets} />
                <StatCell label="Econ" value={player.bowling.economy} />
                <StatCell label="Avg" value={player.bowling.average} />
                <StatCell label="Best" value={player.bowling.best} />
              </div>
            </div>
          )}

          {player.recentForm && (
            <p className="player-recent-form">
              <strong>Recent:</strong> {player.recentForm}
            </p>
          )}

          {player.cricinfoUrl && (
            <a href={player.cricinfoUrl} target="_blank" rel="noopener noreferrer" className="player-external-link">
              {player.source?.includes('cricbuzz') ? 'View on Cricbuzz →' : 'View on ESPNcricinfo →'}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function filterPlayers(players, { searchQuery, teamFilter, team1, team2 }) {
  let list = [...players];

  if (teamFilter === 'team1' && team1) {
    list = list.filter(p => p.team === team1 || p.team?.includes(team1.replace(' W', '')));
  } else if (teamFilter === 'team2' && team2) {
    list = list.filter(p => p.team === team2 || p.team?.includes(team2.replace(' W', '')));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.team?.toLowerCase().includes(q) ||
      p.role?.toLowerCase().includes(q)
    );
  }

  return list;
}

function sortPlayers(players, sortBy) {
  const list = [...players];
  if (sortBy === 'runs') {
    list.sort((a, b) => (b.matchStats?.runs ?? 0) - (a.matchStats?.runs ?? 0));
  } else if (sortBy === 'wickets') {
    list.sort((a, b) => (b.bowling?.wickets ?? b.matchStats?.bowling?.wickets ?? 0) - (a.bowling?.wickets ?? a.matchStats?.bowling?.wickets ?? 0));
  } else if (sortBy === 'role') {
    list.sort((a, b) => (a.role || '').localeCompare(b.role || ''));
  } else {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  return list;
}

export default function PlayerStatsPanel({
  players,
  source,
  loading,
  refreshing,
  error,
  team1,
  team2,
  className = '',
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [sortBy, setSortBy] = useState('runs');

  const filtered = useMemo(
    () => sortPlayers(filterPlayers(players, { searchQuery, teamFilter, team1, team2 }), sortBy),
    [players, searchQuery, teamFilter, team1, team2, sortBy]
  );

  const isInitialLoad = loading && players.length === 0;

  if (isInitialLoad) {
    return (
      <div className={`player-stats-panel ${className}`.trim()}>
        <div className="player-stats-toolbar">
          <div className="skeleton-line skeleton-line--toolbar" />
        </div>
        <div className="player-stats-list">
          {Array.from({ length: 5 }, (_, i) => <PlayerCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error && players.length === 0) {
    return (
      <div className={`player-stats-panel player-stats-panel--empty ${className}`.trim()}>
        <p>Could not load live player data.</p>
        <span className="player-stats-source">Try again in a moment</span>
      </div>
    );
  }

  if (!loading && players.length === 0) {
    return (
      <div className={`player-stats-panel player-stats-panel--empty ${className}`.trim()}>
        <p>No player data for this match.</p>
      </div>
    );
  }

  const team1Short = team1?.replace(' W', '').split(' ').pop() || 'Team 1';
  const team2Short = team2?.replace(' W', '').split(' ').pop() || 'Team 2';

  return (
    <div className={`player-stats-panel ${className}`.trim()}>
      <div className="player-stats-header">
        <span className="player-stats-count">
          {filtered.length} player{filtered.length !== 1 ? 's' : ''}
          {refreshing && <span className="player-stats-refreshing" aria-label="Refreshing" />}
        </span>
        <span className="player-stats-source">{getSourceLabel(source)}</span>
      </div>

      <div className="player-stats-toolbar">
        <div className="player-stats-search">
          <FiSearch className="player-stats-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="player-stats-search-input"
            placeholder="Search players…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search players"
          />
        </div>
        <div className="player-stats-filters">
          <button
            type="button"
            className={`player-stats-chip ${teamFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTeamFilter('all')}
          >
            All
          </button>
          {team1 && (
            <button
              type="button"
              className={`player-stats-chip ${teamFilter === 'team1' ? 'active' : ''}`}
              onClick={() => setTeamFilter('team1')}
            >
              {team1Short}
            </button>
          )}
          {team2 && (
            <button
              type="button"
              className={`player-stats-chip ${teamFilter === 'team2' ? 'active' : ''}`}
              onClick={() => setTeamFilter('team2')}
            >
              {team2Short}
            </button>
          )}
          <select
            className="player-stats-sort"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            aria-label="Sort players"
          >
            <option value="runs">Top runs</option>
            <option value="wickets">Top wickets</option>
            <option value="name">Name A–Z</option>
            <option value="role">Role</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="player-stats-panel--empty player-stats-no-results">
          <p>No players match &ldquo;{searchQuery}&rdquo;</p>
          <button type="button" className="player-stats-clear-btn" onClick={() => { setSearchQuery(''); setTeamFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="player-stats-list">
          {filtered.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              expanded={expandedId === player.id}
              onToggle={() => setExpandedId(expandedId === player.id ? null : player.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
