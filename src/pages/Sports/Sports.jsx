import { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import { BiCircle, BiPlay } from 'react-icons/bi';
import { HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import FilterChips from '../../components/FilterChips/FilterChips';
import MatchCard from '../../components/MatchCard/MatchCard';
import BetSlip from '../../components/BetSlip/BetSlip';
import LiveMatchGraphicWidget from '../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import { promotions, sportsCategories, leagues } from '../../data/mockData';
import { useLiveSports } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import './Sports.css';

export default function Sports() {
  const { matches, tickerMessage } = useLiveSports();
  const { addBet } = useBetSlip();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [expandedMarket, setExpandedMarket] = useState(true);
  const [expandedDeliveryMarket, setExpandedDeliveryMarket] = useState(true);

  // Always look up from live matches array so scores stay current
  const activeLiveMatch = (selectedMatchId && matches.find(m => m.id === selectedMatchId))
    || matches.find(m => m.isLive && m.sport === activeSport)
    || matches[0];

  const sportLeagues = useMemo(() =>
    leagues.filter(l => l.sport === activeSport),
    [activeSport]
  );

  const filteredMatches = useMemo(() => {
    let result = matches;

    if (activeSport) {
      result = result.filter(m => m.sport === activeSport);
    }

    if (activeTab === 'live') {
      result = result.filter(m => m.isLive);
    } else if (activeTab === 'upcoming') {
      result = result.filter(m => !m.isLive);
    }

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
    <div className="sports-page container" id="sports-page" style={{ display: 'flex', gap: '20px' }}>
      {/* Main Left Content Column */}
      <div className="sports-main" style={{ flex: 1, minWidth: 0 }}>
        <PromoBanner promos={promotions.slice(0, 3)} />

        {/* Real-time Ticker */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          color: '#38bdf8',
          padding: '10px 16px',
          borderRadius: '8px',
          margin: '12px 0',
          fontSize: '0.75rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          border: '1px solid rgba(99, 102, 241, 0.4)'
        }}>
          <span style={{
            background: '#ef4444',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.65rem',
            fontWeight: 800,
            animation: 'pulse 1.5s infinite'
          }}>AUTOMATED LIVE</span>
          <span style={{ color: '#e0e7ff', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tickerMessage}
          </span>
        </div>

        {/* Sports Categories Filter Chips */}
        <div className="sports-filters">
          <FilterChips
            items={sportsCategories}
            activeId={activeSport}
            onSelect={setActiveSport}
            className="filter-chips-row"
          />
        </div>

        {/* 10CRIC Horizontal Live Matches Quick Selection Carousel */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '16px' }}>
          {matches.slice(0, 8).map(m => {
            const isSelected = activeLiveMatch?.id === m.id;
            const isCricket = m.sport === 'cricket' || m.sport === 'virtual-cricket';
            const isSoccer = m.sport === 'soccer' || m.sport === 'esoccer';
            const hasScore = m.isLive && m.liveDetails;
            const state = m.matchState || (m.isLive ? 'in' : 'pre');

            // Score display logic — only show real scores, never fallback numbers
            let team1Score = '';
            let team2Score = '';
            let statusLabel = m.time || 'VS';

            if (hasScore && isCricket) {
              team1Score = `${m.liveDetails.runs}/${m.liveDetails.wickets}`;
              team2Score = `${m.liveDetails.score2}/${m.liveDetails.wickets2}`;
              statusLabel = state === 'in' ? 'Live' : (state === 'post' ? 'Completed' : m.time);
            } else if (hasScore && isSoccer) {
              team1Score = String(m.liveDetails.score1 ?? '');
              team2Score = String(m.liveDetails.score2 ?? '');
              statusLabel = state === 'in' ? 'Live' : (state === 'post' ? 'FT' : m.time);
            } else {
              statusLabel = m.time || 'VS';
            }

            return (
              <div
                key={m.id}
                onClick={() => setSelectedMatchId(m.id)}
                style={{
                  background: isSelected ? '#fbbf24' : '#1e293b',
                  color: isSelected ? '#0f172a' : 'white',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  minWidth: '155px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: isSelected ? '2px solid #f59e0b' : '1px solid #334155',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{m.team1.shortName || m.team1.name.slice(0, 8)}</span>
                  <span style={{ fontSize: '0.8rem' }}>{team1Score || 'VS'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span>{m.team2.shortName || m.team2.name.slice(0, 8)}</span>
                  <span style={{ fontSize: '0.8rem' }}>{team2Score || statusLabel}</span>
                </div>
                {state === 'in' && (
                  <div style={{
                    position: 'absolute', top: '4px', right: '8px',
                    background: '#ef4444', color: 'white', padding: '1px 6px',
                    borderRadius: '8px', fontSize: '0.55rem', fontWeight: 800
                  }}>LIVE</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Center Banner for Selected Match */}
        {activeLiveMatch && (
          <div style={{
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            marginBottom: '20px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>
              15:30 · 01 August 2026
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{activeLiveMatch.team1.name}</span>
              <span style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                border: '2px solid #fbbf24',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '0.8rem'
              }}>VS</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{activeLiveMatch.team2.name}</span>
            </div>
          </div>
        )}

        {/* Expandable Betting Markets Accordion */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
          <div
            onClick={() => setExpandedMarket(!expandedMarket)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 800, fontSize: '0.95rem' }}
          >
            <span>Winner (incl. super over)</span>
            {expandedMarket ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
          </div>

          {expandedMarket && activeLiveMatch && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <button
                onClick={() => addBet({
                  id: `${activeLiveMatch.id}_t1`,
                  matchId: activeLiveMatch.id,
                  matchName: `${activeLiveMatch.team1.name} vs ${activeLiveMatch.team2.name}`,
                  marketName: 'Winner (incl. super over)',
                  selectionName: activeLiveMatch.team1.name,
                  odds: activeLiveMatch.odds.team1 || 2.88
                })}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  justify: 'space-between',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                <span>{activeLiveMatch.team1.name}</span>
                <span style={{ color: '#2563eb', fontWeight: 900 }}>{activeLiveMatch.odds.team1 || 2.88}</span>
              </button>

              <button
                onClick={() => addBet({
                  id: `${activeLiveMatch.id}_t2`,
                  matchId: activeLiveMatch.id,
                  matchName: `${activeLiveMatch.team1.name} vs ${activeLiveMatch.team2.name}`,
                  marketName: 'Winner (incl. super over)',
                  selectionName: activeLiveMatch.team2.name,
                  odds: activeLiveMatch.odds.team2 || 1.34
                })}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  justify: 'space-between',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                <span>{activeLiveMatch.team2.name}</span>
                <span style={{ color: '#2563eb', fontWeight: 900 }}>{activeLiveMatch.odds.team2 || 1.34}</span>
              </button>
            </div>
          )}
        </div>

        {/* 1st innings over 19 delivery market */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
          <div
            onClick={() => setExpandedDeliveryMarket(!expandedDeliveryMarket)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 800, fontSize: '0.95rem' }}
          >
            <span>1st innings over 19 - 3rd delivery {activeLiveMatch?.team1.name} total</span>
            {expandedDeliveryMarket ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
          </div>

          {expandedDeliveryMarket && activeLiveMatch && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <button
                onClick={() => addBet({
                  id: `${activeLiveMatch.id}_over19_del3_over`,
                  matchId: activeLiveMatch.id,
                  matchName: `${activeLiveMatch.team1.name} vs ${activeLiveMatch.team2.name}`,
                  marketName: '1st innings over 19 - 3rd delivery total',
                  selectionName: 'Over 0.5',
                  odds: 1.45
                })}
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 700 }}
              >
                <span>Over 0.5</span>
                <span style={{ color: '#2563eb', fontWeight: 900 }}>1.45</span>
              </button>

              <button
                onClick={() => addBet({
                  id: `${activeLiveMatch.id}_over19_del3_under`,
                  matchId: activeLiveMatch.id,
                  matchName: `${activeLiveMatch.team1.name} vs ${activeLiveMatch.team2.name}`,
                  marketName: '1st innings over 19 - 3rd delivery total',
                  selectionName: 'Under 0.5',
                  odds: 2.30
                })}
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 700 }}
              >
                <span>Under 0.5</span>
                <span style={{ color: '#2563eb', fontWeight: 900 }}>2.30</span>
              </button>
            </div>
          )}
        </div>

        {/* All Matches Grid */}
        <div className="sports-tabs">
          <button className={`sports-tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
            <span className="tab-dot" /> Live
          </button>
          <button className={`sports-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
            <BiPlay className="tab-icon" /> All Matches
          </button>
        </div>

        <div className="sports-match-grid">
          {filteredMatches.map(match => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      </div>

      {/* Right Column: 10CRIC Style Live Score Graphic Panel & Betslip */}
      <div style={{ width: '380px', flexShrink: 0 }}>
        {/* 10CRIC Graphic Match Score Panel */}
        <LiveMatchGraphicWidget match={activeLiveMatch} />

        {/* Search for events input */}
        <div className="sports-search" style={{ marginTop: '16px' }}>
          <div className="sports-search-wrapper">
            <FiSearch className="sports-search-icon" />
            <input
              className="sports-search-input"
              placeholder="Search for events"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              id="sports-search-right"
            />
          </div>
        </div>

        {/* Betslip */}
        <BetSlip />
      </div>
    </div>
  );
}
