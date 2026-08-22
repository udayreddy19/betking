const PREFS_KEY = 'oddsyra_betslip_prefs';

const DEFAULT_PREFS = {
  acceptAnyOddsChange: false,
  acceptHigherOdds: false,
};

export function loadBetslipPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveBetslipPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, ...prefs }));
  } catch {
    // private mode
  }
}

export function shouldAutoAcceptOddsUpdate(updates, prefs) {
  if (!updates?.length) return true;
  if (prefs.acceptAnyOddsChange) return true;
  if (prefs.acceptHigherOdds) {
    return updates.every((u) => Number(u.odds) >= Number(u.previousOdds));
  }
  return false;
}
