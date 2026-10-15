import { useEffect, useState } from 'react';
import { loadPlayerPrefs, savePlayerPrefs, saveBetslipPrefs, loadBetslipPrefs } from '../../utils/betslipPrefs';

export default function PlayerBettingPrefsCard() {
  const [prefs, setPrefs] = useState(() => loadPlayerPrefs());
  const [teamDraft, setTeamDraft] = useState('');
  const [leagueDraft, setLeagueDraft] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onChange = () => setPrefs(loadPlayerPrefs());
    window.addEventListener('oddsyra:player-prefs-changed', onChange);
    return () => window.removeEventListener('oddsyra:player-prefs-changed', onChange);
  }, []);

  const persistStake = (value) => {
    const n = Math.max(10, Math.min(100000, Number(value) || 100));
    savePlayerPrefs({ defaultStake: n });
    saveBetslipPrefs({ ...loadBetslipPrefs(), defaultStake: n });
    setPrefs(loadPlayerPrefs());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addTeam = () => {
    const n = teamDraft.trim();
    if (!n) return;
    const next = [...new Set([...(prefs.favoriteTeams || []), n])].slice(0, 20);
    savePlayerPrefs({ favoriteTeams: next });
    setTeamDraft('');
    setPrefs(loadPlayerPrefs());
  };

  const addLeague = () => {
    const n = leagueDraft.trim();
    if (!n) return;
    const next = [...new Set([...(prefs.favoriteLeagues || []), n])].slice(0, 20);
    savePlayerPrefs({ favoriteLeagues: next });
    setLeagueDraft('');
    setPrefs(loadPlayerPrefs());
  };

  return (
    <div className="profile-loyalty-box" style={{ marginBottom: 16 }}>
      <div className="profile-loyalty-head">
        <span>Betting preferences</span>
        {saved ? <strong style={{ color: '#16a34a' }}>Saved</strong> : null}
      </div>
      <p className="profile-loyalty-meta" style={{ marginBottom: 10 }}>
        Default stake and favourites personalise Home and your bet slip.
      </p>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: 4 }}>
        Default stake (₹)
      </label>
      <input
        className="rg-select"
        type="number"
        min="10"
        step="10"
        value={prefs.defaultStake || 100}
        onChange={(e) => persistStake(e.target.value)}
        style={{ width: '100%', marginBottom: 12 }}
      />
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: 4 }}>
        Favourite teams
      </label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          className="rg-select"
          value={teamDraft}
          onChange={(e) => setTeamDraft(e.target.value)}
          placeholder="e.g. India"
          style={{ flex: 1 }}
        />
        <button type="button" className="profile-link-btn" onClick={addTeam}>Add</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {(prefs.favoriteTeams || []).map((t) => (
          <button
            key={t}
            type="button"
            className="profile-link-btn outline"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={() => {
              savePlayerPrefs({ favoriteTeams: prefs.favoriteTeams.filter((x) => x !== t) });
              setPrefs(loadPlayerPrefs());
            }}
          >
            {t} ×
          </button>
        ))}
      </div>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: 4 }}>
        Favourite leagues
      </label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          className="rg-select"
          value={leagueDraft}
          onChange={(e) => setLeagueDraft(e.target.value)}
          placeholder="e.g. IPL"
          style={{ flex: 1 }}
        />
        <button type="button" className="profile-link-btn" onClick={addLeague}>Add</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(prefs.favoriteLeagues || []).map((t) => (
          <button
            key={t}
            type="button"
            className="profile-link-btn outline"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={() => {
              savePlayerPrefs({ favoriteLeagues: prefs.favoriteLeagues.filter((x) => x !== t) });
              setPrefs(loadPlayerPrefs());
            }}
          >
            {t} ×
          </button>
        ))}
      </div>
    </div>
  );
}
