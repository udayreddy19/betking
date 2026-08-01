import { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import { BiCircle, BiPlay } from 'react-icons/bi';
import { MdOutlineUpcoming } from 'react-icons/md';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import FilterChips from '../../components/FilterChips/FilterChips';
import MatchCard from '../../components/MatchCard/MatchCard';
import BetSlip from '../../components/BetSlip/BetSlip';
import { matches, promotions, sportsCategories, leagues } from '../../data/mockData';
import './Sports.css';

export default function Sports() {
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const sportLeagues = useMemo(() =>
    leagues.filter(l => l.sport === activeSport),
    [activeSport]
  );

  const filteredMatches = useMemo(() => {
    let result = matches;

    // Filter by sport
    if (activeSport) {
      result = result.filter(m => m.sport === activeSport);
    }

    // Filter by tab
    if (activeTab === 'live') {
      result = result.filter(m => m.isLive);
    } else if (activeTab === 'upcoming') {
      result = result.filter(m => !m.isLive);
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.team1.name.toLowerCase().includes(q) ||
        m.team2.name.toLowerCase().includes(q) ||
        m.league.toLowerCase().includes(q)
      );
    }

    return result;
  }, [activeSport, activeTab, searchQuery]);

  return (
    <div className="sports-page container" id="sports-page">
      <div className="sports-main">
        <PromoBanner promos={promotions.slice(0, 3)} />

        <div className="sports-filters">
          <FilterChips
            items={sportsCategories}
            activeId={activeSport}
            onSelect={setActiveSport}
            className="filter-chips-row"
          />

          {sportLeagues.length > 0 && (
            <FilterChips
              items={[{ id: null, name: 'All', icon: '⚙️' }, ...sportLeagues]}
              activeId={activeLeague}
              onSelect={setActiveLeague}
              className="filter-chips-row"
            />
          )}
        </div>

        <div className="sports-search">
          <div className="sports-search-wrapper">
            <FiSearch className="sports-search-icon" />
            <input
              className="sports-search-input"
              placeholder="Search for events"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              id="sports-search"
            />
          </div>
        </div>

        <div className="sports-tabs">
          <button
            className={`sports-tab ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => setActiveTab('live')}
          >
            <span className="tab-dot" />
            Live
          </button>
          <button
            className={`sports-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <BiPlay className="tab-icon" />
            Pre-live
          </button>
          <button
            className={`sports-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('upcoming')}
          >
            <BiCircle className="tab-icon" />
            Upcoming
          </button>
        </div>

        {filteredMatches.length > 0 ? (
          <div className="sports-match-grid">
            {filteredMatches.map(match => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <div className="sports-empty">
            <h3>No matches found</h3>
            <p>Try a different sport or check back later</p>
          </div>
        )}
      </div>

      <BetSlip />
    </div>
  );
}
