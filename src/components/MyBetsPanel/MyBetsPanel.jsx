import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { getCashoutOffer } from '../../utils/wageringRules';
import { formatInr } from '../../utils/walletBalance';
import { teamNameMatches } from '../../utils/cricketScores';
import './MyBetsPanel.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Open' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
  { id: 'cashed_out', label: 'Cash out' },
];
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1' || import.meta.env.DEV;

export default function MyBetsPanel() {
  const { placedBets, myBetsCount, isMyBetsOpen, closeMyBets, cashOutBet, adminSettleBet } = useBetSlip();
  const { creditCashout, showToast, user } = useAuth();
  const liveMatches = useLiveMatches() || [];
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [filter, setFilter] = useState('pending');

  const handleLegClick = (leg) => {
    if (!leg) return;
    const matchId = leg.matchId || leg.id;
    const sport = leg.sport || 'cricket';
    closeMyBets();
    navigate(`/sports?sport=${encodeURIComponent(sport)}&match=${encodeURIComponent(matchId)}`);
  };

  useEffect(() => {
    if (!isMyBetsOpen) return undefined;

    // Default to 'Open' (pending) tab every time My Bets panel is opened
    setFilter('pending');

    const handleEscape = (event) => {
      if (event.key === 'Escape') closeMyBets();
    };

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        const trigger = event.target.closest?.('[data-my-bets-trigger]');
        if (!trigger) closeMyBets();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMyBetsOpen, closeMyBets]);

  // Auto-settle pending bets when matches complete
  useEffect(() => {
    if (!DEMO_MODE) return;
    if (!placedBets?.length || !liveMatches?.length) return;

    placedBets.forEach((placed) => {
      if (placed.status !== 'pending') return;

      let allFinished = true;
      let allWon = true;

      for (const leg of placed.legs) {
        const match = liveMatches.find((m) =>
          String(m.id) === String(leg.matchId) ||
          m.matchName?.toLowerCase().includes(leg.matchName?.toLowerCase())
        );

        if (!match) {
          allFinished = false;
          break;
        }

        const isPost = match.matchState === 'post' || String(match.status).toUpperCase() === 'FINISHED';
        if (!isPost) {
          allFinished = false;
          break;
        }

        const ld = match.liveDetails || {};
        const s1 = ld.runs ?? ld.firstRuns ?? ld.score1 ?? 0;
        const s2 = ld.score2 ?? ld.chaseRuns ?? ld.score2 ?? 0;

        let legWon = false;
        if (leg.selection === '1' && s1 > s2) legWon = true;
        else if (leg.selection === '2' && s2 > s1) legWon = true;
        else if (leg.selection === 'X' && s1 === s2) legWon = true;
        else if (leg.selectionName && (teamNameMatches(leg.selectionName, match.team1?.name) && s1 > s2)) legWon = true;
        else if (leg.selectionName && (teamNameMatches(leg.selectionName, match.team2?.name) && s2 > s1)) legWon = true;

        if (!legWon) {
          allWon = false;
        }
      }

      if (allFinished) {
        const outcome = allWon ? 'won' : 'lost';
        adminSettleBet(placed.id, outcome);
      }
    });
  }, [liveMatches, placedBets, adminSettleBet]);

  const filtered = useMemo(() => {
    if (filter === 'all') return placedBets;
    return placedBets.filter((b) => (b.status || 'pending') === filter);
  }, [placedBets, filter]);

  const handleCashout = async (bet) => {
    const offer = getCashoutOffer(bet, user?.loyaltyTier);
    if (offer <= 0) {
      showToast('Cash out not available for this bet.', 'info');
      return;
    }
    const cashed = await cashOutBet(bet.id);
    if (!cashed) {
      showToast('Could not cash out.', 'error');
      return;
    }
    if (DEMO_MODE) {
      creditCashout(cashed.cashoutAmount || offer, cashed.id);
    }
    showToast(`Cashed out for ${formatInr(cashed.cashoutAmount || offer)}`, 'success');
  };

  const getLegScoreText = (leg) => {
    const match = liveMatches.find((m) =>
      String(m.id) === String(leg.matchId) ||
      m.matchName?.toLowerCase().includes(leg.matchName?.toLowerCase())
    );

    const ld = match?.liveDetails || leg.liveDetails || {};

    if (match?.sport === 'cricket' || match?.sport === 'virtual-cricket' || leg.sport === 'cricket') {
      const s1 = ld.runs ?? ld.firstRuns;
      const w1 = ld.wickets ?? ld.firstWickets;
      const o1 = ld.overs ?? ld.firstOvers;
      const s2 = ld.score2 ?? ld.chaseRuns;
      const w2 = ld.wickets2 ?? ld.chaseWickets;
      const o2 = ld.overs2 ?? ld.chaseOvers;

      if (s1 != null || s2 != null) {
        const p1 = w1 === 10 ? `${s1} All Out` : `${s1 || 0}/${w1 || 0}`;
        const p2 = w2 === 10 ? `${s2} All Out` : `${s2 || 0}/${w2 || 0}`;

        if (s2 != null && (s2 > 0 || w2 > 0 || o2)) {
          return `${p1} : ${p2}`;
        }
        if (s1 != null && (s1 > 0 || w1 > 0)) {
          return `${p1} (${o1 || '0.0'} ov)`;
        }
      }
    }

    if (ld.score1 != null || ld.home != null || ld.runs != null) {
      const h = ld.score1 ?? ld.home ?? ld.runs ?? 0;
      const a = ld.score2 ?? ld.away ?? 0;
      return `${h} - ${a}`;
    }

    if (match?.matchState === 'post' || match?.status === 'FINISHED') {
      return 'Match Finished';
    }

    return null;
  };

  if (!isMyBetsOpen) return null;

  return (
    <>
      <div className="my-bets-backdrop" onClick={closeMyBets} aria-hidden="true" />
      <div className="my-bets-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="My bets">
        <div className="my-bets-header">
          <h3>My bets <span className="my-bets-count">{myBetsCount}</span></h3>
          <button type="button" className="my-bets-close" onClick={closeMyBets} aria-label="Close my bets">
            <IoClose />
          </button>
        </div>

        <div className="my-bets-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`my-bets-filter ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="my-bets-body">
          {filtered.length === 0 ? (
            <div className="my-bets-empty">
              <div className="my-bets-empty-icon">📋</div>
              <h4>No bets here</h4>
              <p>{filter === 'all' ? 'Your placed bets will appear here' : `No ${filter.replace('_', ' ')} bets`}</p>
            </div>
          ) : (
            filtered.map((placed) => {
              const cashoutOffer = getCashoutOffer(placed, user?.loyaltyTier);
              return (
                <div className={`my-bets-card my-bets-card--${placed.status || 'pending'}`} key={placed.id}>
                  <div className="my-bets-card-top">
                    <div className="my-bets-card-badges">
                      <span className="my-bets-type-badge">{placed.type === 'multi' ? 'MULTI' : 'SINGLE'}</span>
                      <span className={`my-bets-fund-badge my-bets-fund-badge--${placed.fundSource || 'cash'}`}>
                        {(placed.fundSource || 'cash').toUpperCase()}
                      </span>
                      <span className={`my-bets-status-badge my-bets-status-badge--${placed.status || 'pending'}`}>
                        {(placed.status || 'pending').replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <span className="my-bets-time">
                      {new Date(placed.placedAt).toLocaleString('en-IN')}
                    </span>
                  </div>

                  {placed.legs.map((leg) => {
                    const scoreText = getLegScoreText(leg);
                    return (
                      <div
                        key={leg.id}
                        className="my-bets-leg my-bets-leg--clickable"
                        onClick={() => handleLegClick(leg)}
                        title="Click to view match details"
                      >
                        <div className="my-bets-market">{leg.marketName}</div>
                        <div className="my-bets-selection-row">
                          <span className="my-bets-selection">{leg.selectionName}</span>
                          <span className="my-bets-odds">{Number(leg.odds).toFixed(2)}</span>
                        </div>
                        <div className="my-bets-match-row">
                          <span className="my-bets-match-name">{leg.matchName}</span>
                          {scoreText && <span className="my-bets-score-badge">{scoreText}</span>}
                          <span className="my-bets-match-link-icon">↗</span>
                        </div>
                      </div>
                    );
                  })}

                  <div className="my-bets-summary">
                    <span className="label">Stake</span>
                    <span className="value">₹{placed.stake.toFixed(2)}</span>
                  </div>
                  {placed.type === 'multi' && (
                    <div className="my-bets-summary">
                      <span className="label">Total odds</span>
                      <span className="value">{Number(placed.totalOdds).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="my-bets-summary">
                    <span className="label">Potential return</span>
                    <span className="value">₹{placed.potentialReturn.toFixed(2)}</span>
                  </div>
                  {placed.status === 'won' && placed.payout > 0 && (
                    <div className="my-bets-summary my-bets-summary--won">
                      <span className="label">Payout</span>
                      <span className="value">₹{placed.payout.toFixed(2)}</span>
                    </div>
                  )}
                  {placed.status === 'cashed_out' && (
                    <div className="my-bets-summary my-bets-summary--won">
                      <span className="label">Cashed out</span>
                      <span className="value">₹{(placed.cashoutAmount || placed.payout || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {placed.status === 'pending' && cashoutOffer > 0 && (
                    <button
                      type="button"
                      className="my-bets-cashout-btn"
                      onClick={() => handleCashout(placed)}
                    >
                      Cash out {formatInr(cashoutOffer)}
                    </button>
                  )}
                  {placed.settledAt && (
                    <div className="my-bets-settled-at">
                      Settled {new Date(placed.settledAt).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
