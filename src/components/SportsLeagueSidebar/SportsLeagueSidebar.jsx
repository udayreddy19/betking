import { useMemo, useState } from 'react';
import { HiChevronDown, HiChevronRight } from '../../icons';
import { featuredLeagues, leagueGroups } from '../../data/mockData';
import { resolveLeagueId, isSameLeague } from '../../utils/leagueNavigation';
import './SportsLeagueSidebar.css';

export default function SportsLeagueSidebar({ activeSport, activeLeague, cricketSeries = [], onSelectLeague }) {
  const [expandedGroups, setExpandedGroups] = useState({ England: true, International: true });

  const sportLeagues = featuredLeagues.filter((league) => league.sport === activeSport);

  const dynamicCricketLeagues = useMemo(() => {
    if (activeSport !== 'cricket') return [];
    const knownNames = new Set(
      sportLeagues.flatMap((league) => [league.name, ...(league.matchLeagues || [])])
    );
    return cricketSeries
      .filter((series) => !knownNames.has(series.name) && !knownNames.has(series.rawName))
      .map((series) => ({
        id: series.id,
        name: series.name,
        icon: series.matchType === 'International' ? '🌍' : '🏏',
      }));
  }, [activeSport, cricketSeries, sportLeagues]);

  const toggleGroup = (country) => {
    setExpandedGroups((prev) => ({ ...prev, [country]: !prev[country] }));
  };

  return (
    <aside className="sports-league-sidebar">
      <div className="sports-league-section">
        <h3 className="sports-league-heading">Top Leagues</h3>
        <ul className="sports-league-list">
          <li>
            <button
              type="button"
              className={`sports-league-item ${activeLeague === 'all' ? 'active' : ''}`}
              onClick={() => onSelectLeague('all')}
            >
              <span className="sports-league-item-icon">🏏</span>
              <span className="sports-league-item-label">All Leagues</span>
            </button>
          </li>
          {sportLeagues.map((league) => (
            <li key={league.id}>
              <button
                type="button"
                className={`sports-league-item ${isSameLeague(activeLeague, league.id) ? 'active' : ''}`}
                onClick={() => onSelectLeague(league.id)}
              >
                <span className="sports-league-item-icon">{league.icon || '🏆'}</span>
                <span className="sports-league-item-label">{league.name}</span>
              </button>
            </li>
          ))}
          {dynamicCricketLeagues.map((league) => (
            <li key={league.id}>
              <button
                type="button"
                className={`sports-league-item ${activeLeague === league.id ? 'active' : ''}`}
                onClick={() => onSelectLeague(league.id)}
              >
                <span className="sports-league-item-icon">{league.icon}</span>
                <span className="sports-league-item-label">{league.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sports-league-section">
        <h3 className="sports-league-heading">All Leagues</h3>
        {leagueGroups.map((group) => (
          <div key={group.country} className="sports-league-group">
            <button
              type="button"
              className="sports-league-group-header"
              onClick={() => toggleGroup(group.country)}
            >
              <span className="sports-league-flag">{group.flag}</span>
              <span>{group.country}</span>
              {expandedGroups[group.country] ? <HiChevronDown /> : <HiChevronRight />}
            </button>
            {expandedGroups[group.country] && (
              <ul className="sports-league-sublist">
                {group.leagues.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className={`sports-league-subitem ${isSameLeague(activeLeague, name) ? 'active' : ''}`}
                      onClick={() => onSelectLeague(resolveLeagueId(name) || name)}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
