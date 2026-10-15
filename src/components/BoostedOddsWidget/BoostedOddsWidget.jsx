import { useCallback, useEffect, useState } from 'react';
import { FiZap, FiFlame, FiClock, FiPlusCircle, FiCheck } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import './BoostedOddsWidget.css';

export default function BoostedOddsWidget() {
  const { addBet, isBetSelected } = useBetSlip();
  const [boosts, setBoosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/boosts/daily?limit=5&_=${Date.now()}`, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      setBoosts(Array.isArray(data.boosts) ? data.boosts : []);
      setNote(data.note || '');
    } catch {
      setBoosts([]);
      setNote('Boosts unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const handleAddBoost = (boost) => {
    const parts = String(boost.matchName || '').split(/\s+vs\s+/i);
    const fakeMatch = {
      id: boost.matchId,
      team1: { name: parts[0] || 'Team 1' },
      team2: { name: parts[1] || 'Team 2' },
      league: boost.league,
      sport: boost.sport,
    };
    addBet(
      fakeMatch,
      boost.selectionId || `Boost:${boost.id}`,
      boost.boostedOdds,
      boost.selection || boost.title,
      {
        marketName: `⚡ ${boost.tag || 'Boost'}`,
        marketId: boost.marketId || 'boosted',
        keepExisting: true,
        asMulti: false,
      },
    );
  };

  return (
    <div className="boosted-widget" id="boosted-odds-widget">
      <div className="boosted-header">
        <div className="boosted-title">
          <FiZap className="boosted-icon-zap" />
          <h2>Daily Odds Boosts</h2>
          <span className="boosted-badge">TODAY</span>
        </div>
        <p className="boosted-subtitle">
          {loading ? 'Loading today\'s boosts…' : (note || '3–5 enhanced prices refreshed daily. Tap to add to your slip.')}
        </p>
      </div>

      {!loading && boosts.length === 0 ? (
        <p className="boosted-subtitle" style={{ padding: '0 4px 12px' }}>
          No boostable markets right now — browse <a href="/sports">Sports</a> for live odds.
        </p>
      ) : (
        <div className="boosted-grid">
          {boosts.map((boost) => {
            const selId = boost.selectionId || `Boost:${boost.id}`;
            const isAdded = isBetSelected(boost.matchId, selId);
            return (
              <div key={boost.id} className="boosted-card">
                <div className="boosted-card-top">
                  <span className="boosted-tag">
                    <FiFlame /> {boost.tag || 'BOOST'}
                  </span>
                  <span className="boosted-expiry">
                    <FiClock /> {boost.expiry || 'Today'}
                  </span>
                </div>

                <div className="boosted-card-match">{boost.league}</div>
                <h3 className="boosted-card-fixture">{boost.matchName}</h3>
                <p className="boosted-card-desc">{boost.title}</p>

                <div className="boosted-card-bottom">
                  <div className="boosted-odds-box">
                    <span className="boosted-old-odds">{Number(boost.originalOdds).toFixed(2)}</span>
                    <span className="boosted-new-odds">
                      {Number(boost.boostedOdds).toFixed(2)}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`boosted-add-btn ${isAdded ? 'added' : ''}`}
                    onClick={() => handleAddBoost(boost)}
                  >
                    {isAdded ? (
                      <>
                        <FiCheck /> In Betslip
                      </>
                    ) : (
                      <>
                        <FiPlusCircle /> Add Bet
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
