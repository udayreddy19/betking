import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { IoClose } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { getCashoutOffer } from '../../utils/wageringRules';
import { formatInr } from '../../utils/walletBalance';
import { teamNameMatches } from '../../utils/cricketScores';
import { DEMO_MODE } from '../../utils/featureFlags';
import { apiFetch } from '../../utils/apiClient';
import { matchIdsEqual } from '../../../lib/matchIdPublic.mjs';
import { findLiveMatch } from '../../utils/findLiveMatch';
import { springSheet } from '../../utils/motionPresets';
import './MyBetsPanel.css';

function parseOversCompleted(oversStr) {
  const m = String(oversStr ?? '').trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  return Number(m[1]);
}

function isOverMarketExpired(placed, liveMatches) {
  const leg = placed?.legs?.[0];
  if (!leg) return false;
  const market = String(leg.marketId || leg.marketName || '');
  const nextOver = market.match(/(?:i\d+_)?next_over_(\d+)/i) || String(leg.marketName || '').match(/Next Over\s*\((\d+)\)/i);
  if (!nextOver) return false;
  const overNum = Number(nextOver[1]);
  const match = (liveMatches || []).find((m) =>
    String(m.id) === String(leg.matchId)
    || matchIdsEqual(m.id || m.matchId, leg.matchId)
  );
  if (!match) return false;
  const ld = match.liveDetails || {};
  // Prefer batting overs for current innings — never leaked chase overs in 1st dig
  const oversStr = (Number(ld.inningsId) >= 2 || Number(ld.chaseRuns) > 0)
    ? (ld.chaseOvers ?? ld.overs ?? ld.overs2 ?? ld.firstOvers)
    : (ld.firstOvers ?? ld.overs ?? ld.chaseOvers);
  const completed = parseOversCompleted(oversStr);
  return completed != null && completed >= overNum;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Open' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
  { id: 'void', label: 'Void' },
  { id: 'cashout', label: 'Cash out' },
];

function cashoutOfferForBet(placed, liveMatches, tier, quoteByBetId = {}) {
  if (isOverMarketExpired(placed, liveMatches)) return 0;
  const quoted = quoteByBetId[placed.id];
  if (quoted != null) return Number(quoted) || 0;
  // Demo / offline fallback only — never invent VIP% of potential payout.
  if (!DEMO_MODE) return 0;
  const legOdds = Number(placed?.legs?.[0]?.odds || placed?.odds);
  return getCashoutOffer(placed, tier, legOdds);
}

export default function MyBetsPanel() {
  const {
    placedBets,
    myBetsCount,
    isMyBetsOpen,
    closeMyBets,
    cashOutBet,
    adminSettleBet,
    refreshMyBets,
    myBetsLoading,
  } = useBetSlip();
  const { creditCashout, showToast, user } = useAuth();
  const liveMatches = useLiveMatches() || [];
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [filter, setFilter] = useState('pending');
  const [cashoutQuotes, setCashoutQuotes] = useState({});

  useEffect(() => {
    if (!isMyBetsOpen) return undefined;

    // Default to 'Open' (pending) tab every time My Bets panel is opened
    setFilter('pending');
    void refreshMyBets();

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
  }, [isMyBetsOpen, closeMyBets, refreshMyBets]);

  // Live cashout quotes from server (accepted/current odds) — not VIP% of potential.
  useEffect(() => {
    if (!isMyBetsOpen || DEMO_MODE) return undefined;

    const pendingCash = placedBets.filter((bet) => {
      const status = String(bet.status || '').toLowerCase();
      if (status !== 'pending' && status !== 'accepted' && status !== 'open') return false;
      if (bet.fundSource === 'bonus' || bet.fundSource === 'freebet') return false;
      return Boolean(bet.id);
    });

    if (pendingCash.length === 0) {
      setCashoutQuotes({});
      return undefined;
    }

    let cancelled = false;

    const refreshQuotes = async () => {
      const entries = await Promise.all(pendingCash.map(async (bet) => {
        try {
          const res = await apiFetch(`/api/bet/cashout/quote?betId=${encodeURIComponent(bet.id)}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.available === false) return [bet.id, 0];
          return [bet.id, Number(data.cashoutValue) || 0];
        } catch {
          return [bet.id, 0];
        }
      }));
      if (!cancelled) setCashoutQuotes(Object.fromEntries(entries));
    };

    void refreshQuotes();
    const timer = setInterval(refreshQuotes, 8_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isMyBetsOpen, placedBets]);

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
    if (filter === 'cashout') {
      return placedBets.filter((b) => cashoutOfferForBet(b, liveMatches, user?.loyaltyTier, cashoutQuotes) > 0);
    }
    return placedBets.filter((b) => (b.status || 'pending') === filter);
  }, [placedBets, filter, liveMatches, user?.loyaltyTier, cashoutQuotes]);

  const handleCashout = async (bet) => {
    const offer = cashoutOfferForBet(bet, liveMatches, user?.loyaltyTier, cashoutQuotes);
    if (offer <= 0) {
      showToast('Cash out not available for this bet.', 'info');
      return;
    }
    const cashed = await cashOutBet(bet.id, offer);
    if (!cashed) {
      showToast('Could not cash out.', 'error');
      return;
    }
    if (DEMO_MODE) {
      creditCashout(cashed.cashoutAmount || offer, cashed.id);
    }
    showToast(`Cashed out for ${formatInr(cashed.cashoutAmount || offer)}`, 'success');
  };

  const resolveLegMatch = (leg) => findLiveMatch(liveMatches, {
    matchId: leg?.matchId,
    matchName: leg?.matchName,
  });

  const getLegDisplayName = (leg) => {
    const match = resolveLegMatch(leg);
    if (match) {
      const t1 = match.team1?.name || match.team1?.shortName;
      const t2 = match.team2?.name || match.team2?.shortName;
      if (t1 && t2) return `${t1} vs ${t2}`;
      if (match.matchName) return match.matchName;
    }
    if (leg.team1Name && leg.team2Name) return `${leg.team1Name} vs ${leg.team2Name}`;
    const raw = String(leg.matchName || '').trim();
    if (raw && !/^live match$/i.test(raw) && !/^(oy_|10cric_|cb_|crex_|fancode_|fc_|espn_|api_|srl_)/i.test(raw)) {
      return raw;
    }
    return 'Open bet fixture';
  };

  const handleLegClick = (leg) => {
    if (!leg) return;
    const live = resolveLegMatch(leg)
      || findLiveMatch(liveMatches, {
        matchId: leg.matchId,
        matchName: leg.team1Name && leg.team2Name
          ? `${leg.team1Name} vs ${leg.team2Name}`
          : leg.matchName,
      });
    // Also try matching when matchName is a single team (match-winner selection)
    const byTeam = !live && leg.selectionName
      ? (liveMatches || []).find((m) => {
        const t1 = String(m.team1?.name || '').toLowerCase();
        const t2 = String(m.team2?.name || '').toLowerCase();
        const tip = String(leg.selectionName || '').toLowerCase();
        return tip.length > 2 && (t1.includes(tip) || t2.includes(tip) || tip.includes(t1) || tip.includes(t2));
      })
      : null;
    const resolved = live || byTeam;
    const matchId = resolved?.id || leg.matchId;
    if (!matchId || String(matchId).includes('-leg-')) {
      showToast?.('This match is no longer on the board.', 'info');
      return;
    }
    const rawSport = String(resolved?.sport || leg.sport || 'cricket').toLowerCase();
    const sport = rawSport === 'football' ? 'soccer' : rawSport;
    const displayName = resolved
      ? `${resolved.team1?.name || resolved.team1} vs ${resolved.team2?.name || resolved.team2}`
      : getLegDisplayName(leg);
    closeMyBets();
    const params = new URLSearchParams({
      sport,
      league: 'all',
      match: String(matchId),
    });
    if (
      displayName
      && !/^live match$/i.test(displayName)
      && displayName !== 'Open bet fixture'
      && displayName !== 'Match'
      && /\svs\.?\s/i.test(displayName)
    ) {
      params.set('teams', displayName);
    } else if (leg.team1Name && leg.team2Name) {
      params.set('teams', `${leg.team1Name} vs ${leg.team2Name}`);
    }
    navigate(`/sports?${params.toString()}`);
  };

  const getLegSelectionLabel = (leg) => {
    const match = resolveLegMatch(leg);
    const id = String(leg.selection || '');
    if (match) {
      if (id === '1' && match.team1?.name) return match.team1.name;
      if (id === '2' && match.team2?.name) return match.team2.name;
      if (id === 'X') return 'Draw';
      const markets = match.markets || match.odds?.markets || [];
      for (const market of markets) {
        const sels = market.selections || market.outcomes || [];
        const hit = sels.find((s) => String(s.id || s.selectionId) === id);
        if (hit?.name || hit?.label) return hit.name || hit.label;
      }
    }
    const name = String(leg.selectionName || '');
    if (name && !/^sel[_-]/i.test(name)) return name;
    return name || id || 'Selection';
  };

  const getLegScoreText = (leg) => {
    const match = resolveLegMatch(leg) || liveMatches.find((m) =>
      m.matchName?.toLowerCase().includes(String(leg.matchName || '').toLowerCase())
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

  return (
    <AnimatePresence>
      {isMyBetsOpen ? (
        <>
          <motion.div
            key="my-bets-backdrop"
            className="my-bets-backdrop apple-scrim"
            onClick={closeMyBets}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            key="my-bets-panel"
            className="my-bets-panel apple-material--heavy"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="My bets"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={springSheet}
          >
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
          {myBetsLoading && filtered.length === 0 ? (
            <div className="my-bets-loading" aria-live="polite">
              <div className="my-bets-loading-spinner" aria-hidden="true" />
              <p>Loading your bets…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="my-bets-empty">
              <div className="my-bets-empty-icon">📋</div>
              <h4>No bets here</h4>
              <p>{
                filter === 'all'
                  ? 'Your placed bets will appear here'
                  : filter === 'cashout'
                    ? 'No bets available to cash out'
                    : `No ${filter.replace('_', ' ')} bets`
              }</p>
            </div>
          ) : (
            filtered.map((placed) => {
              const cashoutOffer = cashoutOfferForBet(placed, liveMatches, user?.loyaltyTier, cashoutQuotes);
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
                          <span className="my-bets-selection">{getLegSelectionLabel(leg)}</span>
                          <span className="my-bets-odds">{Number(leg.odds).toFixed(2)}</span>
                        </div>
                        <div className="my-bets-match-row">
                          <span className="my-bets-match-name">{getLegDisplayName(leg)}</span>
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
                    <>
                      <div className="my-bets-summary my-bets-summary--won">
                        <span className="label">Payout</span>
                        <span className="value">₹{placed.payout.toFixed(2)}</span>
                      </div>
                      {placed.profit > 0 && (
                        <div className="my-bets-summary">
                          <span className="label">Profit</span>
                          <span className="value">₹{placed.profit.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {placed.status === 'void' && (
                    <div className="my-bets-summary my-bets-summary--won">
                      <span className="label">Refunded</span>
                      <span className="value">₹{(placed.payout || placed.stake || 0).toFixed(2)}</span>
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
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
