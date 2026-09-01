import { useMemo, useState } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import { apiFetch } from '../../utils/apiClient';
import './SgpBuilder.css';

export default function SgpBuilder({ match, markets = [] }) {
  const { addSgpLegs } = useBetSlip();
  const matchId = match?.id || match?.matchId;
  const [picked, setPicked] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        marketName: market.title || market.name,
        selectionId: option.selectionId || option.selection,
        selectionName: option.name,
        odds: option.odds,
        name: option.name,
      }];
    });
    setQuote(null);
    setError('');
  };

  const quoteCombo = async () => {
    if (picked.length < 2) {
      setError('Pick at least two same-match legs.');
      return null;
    }
    const http = await apiFetch('/api/bets/quote-selections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selections: picked }),
    });
    const res = await http.json();
    if (res?.sgp && res.sgp.valid === false) {
      setError(res.sgp.telemetry?.reason || 'These picks cannot be combined (for example two different winners).');
      setQuote(res.sgp);
      return null;
    }
    setQuote(res.sgp || null);
    return res.sgp || { valid: true };
  };

  const price = async () => {
    setError('');
    setBusy(true);
    try {
      await quoteCombo();
    } catch (err) {
      setError(err.message || 'Quote failed');
    } finally {
      setBusy(false);
    }
  };

  const addToSlip = async () => {
    setError('');
    if (picked.length < 2) {
      setError('Pick at least two same-match legs.');
      return;
    }
    setBusy(true);
    try {
      const sgp = await quoteCombo();
      if (!sgp) return;
      addSgpLegs(match, picked);
    } catch (err) {
      setError(err.message || 'Could not add parlay to slip');
    } finally {
      setBusy(false);
    }
  };

  if (openMarkets.length < 2) return null;

  return (
    <div className="sgp-builder sports-market-panel">
      <div className="sports-market-panel-header sgp-builder-head">
        <span>Same-game parlay</span>
      </div>
      <p className="sgp-builder-hint">
        Picks here stay off your slip until you add the parlay. Then place it as a Multi. The green book above is for singles.
      </p>
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
        <button type="button" className="sports-empty-action" onClick={price} disabled={picked.length < 2 || busy}>
          Price combo
        </button>
        <button type="button" className="sports-empty-action" onClick={addToSlip} disabled={picked.length < 2 || busy}>
          {picked.length < 2 ? 'Add parlay to slip' : `Add ${picked.length}-leg parlay to slip`}
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
