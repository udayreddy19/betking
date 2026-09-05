/**
 * OddsEngineV4 — post-price book assembly.
 */

const LOCK = 1.01;

export function assembleBook(markets = []) {
  let out = markets.filter(Boolean).map((m) => ({
    ...m,
    selections: (m.selections || []).map((s) => ({ ...s })),
  }));

  // Align super-over winner with match_winner prices.
  const winner = out.find((m) => m.marketId === 'match_winner' && m.status === 'OPEN');
  const superOver = out.find((m) => m.marketId === 'match_winner_super_over' && m.status === 'OPEN');
  if (winner?.selections?.length && superOver?.selections?.length) {
    out = out.map((m) => {
      if (m.marketId !== 'match_winner_super_over') return m;
      const sels = m.selections.map((sel) => {
        const src = winner.selections.find((w) => String(w.name) === String(sel.name));
        if (!src) return sel;
        return { ...sel, odds: src.odds, probability: src.probability };
      });
      return { ...m, selections: sels };
    });
  }

  // Suspend lock prices (1.01) on live open markets — too one-sided to offer.
  out = out.map((m) => {
    if (m.status !== 'OPEN') return m;
    const hasLock = (m.selections || []).some((s) => Number(s.odds) <= LOCK + 0.005);
    if (!hasLock) return m;
    // Soften lock instead of suspending MW entirely when possible.
    if (m.marketId === 'match_winner' || m.marketId === 'match_winner_super_over') {
      const sels = m.selections.map((s) => (
        Number(s.odds) <= LOCK + 0.005
          ? { ...s, odds: 1.02 }
          : s
      ));
      return { ...m, selections: sels };
    }
    return { ...m, status: 'SUSPENDED', selections: [] };
  });

  return out;
}

export function createOddsSnapshotV4({
  matchId,
  markets,
  stateVersion,
  quality,
  meta = {},
}) {
  const open = (markets || []).filter((m) => m.status === 'OPEN');
  return Object.freeze({
    engine: 'OddsEngineV4',
    matchId: String(matchId),
    status: open.length ? 'OK' : (quality?.suspendAll ? 'SUSPENDED' : 'NO_OPEN_MARKETS'),
    markets: Object.freeze(markets || []),
    stateVersion: Number(stateVersion) || 1,
    oddsVersion: Number(meta.oddsVersion) || Date.now(),
    generatedAt: Date.now(),
    quality: quality || null,
    meta: Object.freeze({ ...meta }),
  });
}
