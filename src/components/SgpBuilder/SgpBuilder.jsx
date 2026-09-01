import { useMemo, useState } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import { apiFetch } from '../../utils/apiClient';
import './SgpBuilder.css';

export default function SgpBuilder({ match, markets = [] }) {
  const { addBet } = useBetSlip();
  const matchId = match?.id || match?.matchId;
  const [picked, setPicked] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');

  const openMarkets = useMemo(
    () => (markets || []).filter((m) => (!m.status || m.status === 'OPEN') && (m.options || m.selections || []).some((s) => s.bettable !== false && Number(s.odds) >= 1.01)),
    [markets],
  );

  const toggle = (market, option) => {
    const key = `${market.marketId}:${option.selectionId || option.selection}`;
    setPicked((prev) => {
      const exists = prev.find((p) => p.key === key);
      if (exists) return prev.filter((p) => p.key !== key);
      const sameMarket = prev.filter((p) => p.marketId !== market.marketId);
      return [...sameMarket, {
        key,
        matchId,
        marketId: market.marketId,
        selectionId: option.selectionId || option.selection,
        selectionName: option.name,
        odds: option.odds,
        name: option.name,
      }];
    });
    setQuote(null);
  };

  const price = async () => {
    setError('');
    if (picked.length < 2) {
      setError('Pick at least two same-match legs.');
      return;
    }
    try {
      const http = await apiFetch('/api/bets/quote-selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: picked }),
      });
      const res = await http.json();
      if (!res?.sgp?.valid) {
        setError(res?.sgp?.telemetry?.reason || 'This combination cannot be priced as an SGP.');
        setQuote(res?.sgp || null);
        return;
      }
      setQuote(res.sgp);
    } catch (err) {
      setError(err.message || 'Quote failed');
    }
  };

  const addToSlip = () => {
    picked.forEach((leg) => {
      addBet(match, leg.selectionId, leg.odds, leg.selectionName, {
        marketId: leg.marketId,
        matchId: leg.matchId,
      });
    });
  };

  if (openMarkets.length < 2) return null;

  return (
    <div className="sgp-builder sports-market-panel">
      <div className="sports-market-panel-header sgp-builder-head">
        <span>Same-game parlay</span>
      </div>
      <p className="sgp-builder-hint">Pick two or more legs from this match, then price. This is not a copy of the book above — selected legs are correlated on the server.</p>
      {openMarkets.slice(0, 6).map((market) => {
        const options = (market.options || market.selections || []).filter((s) => Number(s.odds) >= 1.01).slice(0, 4);
        const gridClass = options.length >= 3 ? 'three-col' : 'two-col';
        return (
          <div key={market.marketId || market.key} className="sgp-builder-market">
            <p className="sgp-builder-market-title">{market.title || market.name}</p>
            <div className={`sports-market-odds-grid ${gridClass}`}>
              {options.map((opt) => {
                const key = `${market.marketId}:${opt.selectionId || opt.selection}`;
                const on = picked.some((p) => p.key === key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`sports-market-odds-btn${on ? ' selected' : ''}`}
                    onClick={() => toggle(market, opt)}
                  >
                    <span>{opt.name}</span>
                    <span className="odds-val">{Number(opt.odds).toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="sgp-builder-actions">
        <button type="button" className="sports-empty-action" onClick={price} disabled={picked.length < 2}>
          Price SGP
        </button>
        <button type="button" className="sports-empty-action" onClick={addToSlip} disabled={picked.length < 2}>
          Add legs to slip
        </button>
      </div>
      {quote?.valid && (
        <p className="sgp-builder-quote">
          Combined odds {quote.sgpOdds}
          {quote.correlationApplied ? ' · correlation applied' : ' · treated as independent'}
        </p>
      )}
      {error && <p className="sgp-builder-error">{error}</p>}
    </div>
  );
}
