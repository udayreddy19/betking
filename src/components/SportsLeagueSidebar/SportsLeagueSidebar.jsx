import { useMemo, useState } from 'react';
import { HiChevronDown, HiChevronRight } from '../../icons';
import SportIcon from '../SportIcon/SportIcon';
import { featuredLeagues, leagueGroups } from '../../data/mockData';
import { resolveLeagueId, isSameLeague, seriesCoveredByFeatured } from '../../utils/leagueNavigation';
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
      .filter((series) => {
        if (knownNames.has(series.name) || knownNames.has(series.rawName)) return false;
        // Hide "CPL" / "TNPL" when featured "Caribbean Premier League" / TNPL already covers them
        return !seriesCoveredByFeatured(series, sportLeagues);
      })
      .map((series) => ({
        id: series.id,
        name: series.name,
        icon: series.matchType === 'International' ? 'world' : 'cricket',
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
              <SportIcon sport={activeSport} className="sports-league-item-icon" />
              <span className="sports-league-item-label">All Leagues</span>
            </button>
          </li>
          {sportLeagues.map((league) => (
            <li key={league.id}>
              <button
                type="button"
                className={`sports-league-item ${isSameLeague(activeLeague, league.id, cricketSeries) ? 'active' : ''}`}
                onClick={() => onSelectLeague(league.id)}
              >
                <SportIcon sport={league.sport} icon={league.icon || 'trophy'} className="sports-league-item-icon" />
                <span className="sports-league-item-label">{league.name}</span>
              </button>
            </li>
          ))}
          {dynamicCricketLeagues.map((league) => (
            <li key={league.id}>
              <button
                type="button"
                className={`sports-league-item ${isSameLeague(activeLeague, league.id, cricketSeries) ? 'active' : ''}`}
                onClick={() => onSelectLeague(resolveLeagueId(league.id, cricketSeries))}
              >
                <SportIcon sport={activeSport} icon={league.icon} className="sports-league-item-icon" />
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
                      className={`sports-league-subitem ${isSameLeague(activeLeague, name, cricketSeries) ? 'active' : ''}`}
                      onClick={() => onSelectLeague(resolveLeagueId(name, cricketSeries) || name)}
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
