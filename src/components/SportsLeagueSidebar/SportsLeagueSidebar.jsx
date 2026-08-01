import { useState } from 'react';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi';
import { featuredLeagues, leagueGroups } from '../../data/mockData';
import './SportsLeagueSidebar.css';

export default function SportsLeagueSidebar({ activeSport, activeLeague, onSelectLeague }) {
  const [expandedGroups, setExpandedGroups] = useState({ England: true });

  const sportLeagues = featuredLeagues.filter(l => l.sport === activeSport);

  const toggleGroup = (country) => {
    setExpandedGroups(prev => ({ ...prev, [country]: !prev[country] }));
  };

  return (
    <aside className="sports-league-sidebar">
      <div className="sports-league-section">
        <h3 className="sports-league-heading">Featured</h3>
        <ul className="sports-league-list">
          {sportLeagues.map(league => (
            <li key={league.id}>
              <button
                type="button"
                className={`sports-league-item ${activeLeague === league.id ? 'active' : ''}`}
                onClick={() => onSelectLeague(league.id)}
              >
                {league.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sports-league-section">
        <h3 className="sports-league-heading">All Leagues</h3>
        {leagueGroups.map(group => (
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
                {group.leagues.map(name => (
                  <li key={name}>
                    <button
                      type="button"
                      className={`sports-league-subitem ${activeLeague === name ? 'active' : ''}`}
                      onClick={() => onSelectLeague(name)}
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
