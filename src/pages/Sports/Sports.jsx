import { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import { BiCircle, BiPlay } from 'react-icons/bi';
import { MdOutlineUpcoming } from 'react-icons/md';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import FilterChips from '../../components/FilterChips/FilterChips';
import MatchCard from '../../components/MatchCard/MatchCard';
import BetSlip from '../../components/BetSlip/BetSlip';
import LiveMatchGraphicWidget from '../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import { promotions, sportsCategories, leagues } from '../../data/mockData';
import { useLiveSports } from '../../context/LiveSportsContext';
import './Sports.css';

export default function Sports() {
  const { matches, tickerMessage } = useLiveSports();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGraphicMatch, setSelectedGraphicMatch] = useState(null);

  const activeLiveMatch = selectedGraphicMatch || matches.find(m => m.isLive && m.sport === activeSport) || matches[0];

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
  }, [matches, activeSport, activeTab, searchQuery]);

  return (
    <div className="sports-page container" id="sports-page">
      <div className="sports-main">
        <PromoBanner promos={promotions.slice(0, 3)} />

        {/* Real-time Automated Live Betting Ticker */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          color: '#38bdf8',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          margin: 'var(--space-4) 0',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          <span style={{
            background: '#ef4444',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.65rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            animation: 'pulse 1.5s infinite'
          }}>AUTOMATED LIVE</span>
          <span style={{ color: '#e0e7ff', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tickerMessage}
          </span>
        </div>

        {/* 10CRIC Horizontal Live Matches Quick Selection Chips Bar */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '12px' }}>
          {matches.slice(0, 6).map(m => {
            const isSelected = activeLiveMatch?.id === m.id;
            return (
              <div
                key={m.id}
                onClick={() => setSelectedGraphicMatch(m)}
                style={{
                  background: isSelected ? '#fbbf24' : '#1e293b',
                  color: isSelected ? '#0f172a' : 'white',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  minWidth: '150px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  border: isSelected ? '2px solid #f59e0b' : '1px solid #334155',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{m.team1.shortName || m.team1.name.slice(0, 8)}</span>
                  <span>{m.isLive ? `${m.liveDetails?.runs || 72}/${m.liveDetails?.wickets || 3}` : 'VS'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span>{m.team2.shortName || m.team2.name.slice(0, 8)}</span>
                  <span>{m.isLive ? `${m.liveDetails?.score2 || 148}/${m.liveDetails?.wickets2 || 5}` : m.time}</span>
                </div>
              </div>
            );
          })}
        </div>

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

        {/* 10CRIC Live Match Score Graphic Center Widget */}
        <LiveMatchGraphicWidget match={activeLiveMatch} />

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
