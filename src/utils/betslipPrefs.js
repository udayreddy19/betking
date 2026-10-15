const PREFS_KEY = 'oddsyra_betslip_prefs';
const PLAYER_PREFS_KEY = 'oddsyra_player_prefs_v1';

const DEFAULT_PREFS = {
  acceptAnyOddsChange: false,
  acceptHigherOdds: false,
  defaultStake: 100,
};

const DEFAULT_PLAYER_PREFS = {
  favoriteTeams: [],
  favoriteLeagues: [],
  defaultStake: 100,
};

export function loadBetslipPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    const player = loadPlayerPrefs();
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      defaultStake: Number(parsed.defaultStake ?? player.defaultStake ?? 100) || 100,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveBetslipPrefs(prefs) {
  try {
    const next = { ...DEFAULT_PREFS, ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    if (next.defaultStake != null) {
      savePlayerPrefs({ defaultStake: Number(next.defaultStake) || 100 });
    }
  } catch {
    // private mode
  }
}

export function loadPlayerPrefs() {
  try {
    const raw = localStorage.getItem(PLAYER_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PLAYER_PREFS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PLAYER_PREFS,
      ...parsed,
      favoriteTeams: Array.isArray(parsed.favoriteTeams) ? parsed.favoriteTeams.slice(0, 20) : [],
      favoriteLeagues: Array.isArray(parsed.favoriteLeagues) ? parsed.favoriteLeagues.slice(0, 20) : [],
      defaultStake: Number(parsed.defaultStake) || 100,
    };
  } catch {
    return { ...DEFAULT_PLAYER_PREFS };
  }
}

export function savePlayerPrefs(partial) {
  try {
    const next = { ...loadPlayerPrefs(), ...partial };
    localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('oddsyra:player-prefs-changed', { detail: next }));
    }
  } catch {
    // private mode
  }
}

export function toggleFavoriteTeam(name) {
  const n = String(name || '').trim();
  if (!n) return loadPlayerPrefs();
  const prefs = loadPlayerPrefs();
  const set = new Set(prefs.favoriteTeams.map((t) => t.toLowerCase()));
  const key = n.toLowerCase();
  let next;
  if (set.has(key)) {
    next = prefs.favoriteTeams.filter((t) => t.toLowerCase() !== key);
  } else {
    next = [...prefs.favoriteTeams, n].slice(0, 20);
  }
  savePlayerPrefs({ favoriteTeams: next });
  return loadPlayerPrefs();
}

export function toggleFavoriteLeague(name) {
  const n = String(name || '').trim();
  if (!n) return loadPlayerPrefs();
  const prefs = loadPlayerPrefs();
  const set = new Set(prefs.favoriteLeagues.map((t) => t.toLowerCase()));
  const key = n.toLowerCase();
  let next;
  if (set.has(key)) {
    next = prefs.favoriteLeagues.filter((t) => t.toLowerCase() !== key);
  } else {
    next = [...prefs.favoriteLeagues, n].slice(0, 20);
  }
  savePlayerPrefs({ favoriteLeagues: next });
  return loadPlayerPrefs();
}

export function shouldAutoAcceptOddsUpdate(updates, prefs) {
  if (!updates?.length) return true;
  if (prefs.acceptAnyOddsChange) return true;
  if (prefs.acceptHigherOdds) {
    return updates.every((u) => Number(u.odds) >= Number(u.previousOdds));
  }
  return false;
}
