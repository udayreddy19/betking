import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatInr } from '../../utils/walletBalance';
import { FANTASY_CONTESTS, loadFantasyEntries, saveFantasyEntry } from '../../data/fantasyContests';
import { DEMO_MODE, FANTASY_JOIN_ENABLED } from '../../utils/featureFlags';
import './Fantasy.css';
import { formatIst, formatIstDateTime } from '../../utils/istTime';

export default function Fantasy() {
  const { user, isLoggedIn, openLoginModal, showToast } = useAuth();
  const [entries, setEntries] = useState(() => loadFantasyEntries(user?.email));
  const [joiningId, setJoiningId] = useState(null);

  useEffect(() => {
    setEntries(loadFantasyEntries(user?.email));
  }, [user?.email]);

  const joinedIds = useMemo(() => new Set(entries.map((e) => e.contestId)), [entries]);

  const handleJoin = (contest) => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (!FANTASY_JOIN_ENABLED) {
      showToast('Fantasy contests are not live yet. Place sports bets from the Sports page.', 'info');
      return;
    }
    if (!DEMO_MODE || contest.entryFee > 0) {
      showToast('Fantasy contests are not live yet. Place sports bets from the Sports page.', 'info');
      return;
    }
    if (joinedIds.has(contest.id)) {
      showToast('You already joined this contest.', 'info');
      return;
    }
    if (contest.filled >= contest.spots) {
      showToast('This contest is full.', 'info');
      return;
    }

    setJoiningId(contest.id);
    const next = saveFantasyEntry(user.email, {
      contestId: contest.id,
      title: contest.title,
      sport: contest.sport,
      entryFee: contest.entryFee,
      prizePool: contest.prizePool,
    });
    setEntries(next);
    setJoiningId(null);
    showToast(
      contest.entryFee > 0
        ? `Joined ${contest.title} for ${formatInr(contest.entryFee)}.`
        : `Joined ${contest.title} (free).`,
      'success',
    );
  };

  return (
    <div className="fantasy-page container" id="fantasy-page">
      <div className="fantasy-hero">
        <span className="fantasy-icon">🏆</span>
        <h1>Fantasy Cricket</h1>
        <p>Fantasy contests are not live yet. Live sports betting stays on the Sports page.</p>
        <div className="fantasy-actions">
          <Link to="/sports" className="fantasy-btn primary">Browse live matches</Link>
          <Link to="/promotions" className="fantasy-btn outline">View promotions</Link>
        </div>
      </div>

      <section className="fantasy-section">
        <h2>Open contests</h2>
        <div className="fantasy-grid">
          {FANTASY_CONTESTS.map((contest) => {
            const joined = joinedIds.has(contest.id);
            const fillPct = Math.min(100, Math.round((contest.filled / contest.spots) * 100));
            const full = contest.filled >= contest.spots;
            return (
              <article key={contest.id} className="fantasy-card">
                <div className="fantasy-card-top">
                  <span className="fantasy-sport">{contest.sport}</span>
                  {contest.entryFee === 0 && <span className="fantasy-free">Free</span>}
                </div>
                <h3>{contest.title}</h3>
                <dl className="fantasy-meta">
                  <div>
                    <dt>Prize pool</dt>
                    <dd>{formatInr(contest.prizePool)}</dd>
                  </div>
                  <div>
                    <dt>Entry</dt>
                    <dd>{contest.entryFee === 0 ? 'Free' : formatInr(contest.entryFee)}</dd>
                  </div>
                  <div>
                    <dt>Spots</dt>
                    <dd>{contest.filled.toLocaleString('en-IN')} / {contest.spots.toLocaleString('en-IN')}</dd>
                  </div>
                </dl>
                <div className="fantasy-fill" aria-hidden>
                  <div style={{ width: `${fillPct}%` }} />
                </div>
                {FANTASY_JOIN_ENABLED ? (
                  <button
                    type="button"
                    className="fantasy-join"
                    disabled={joined || full || joiningId === contest.id}
                    onClick={() => handleJoin(contest)}
                  >
                    {joined ? 'Joined' : full ? 'Contest full' : joiningId === contest.id ? 'Joining…' : DEMO_MODE && contest.entryFee === 0 ? 'Join contest' : 'Coming soon'}
                  </button>
                ) : (
                  <p className="fantasy-join-note">Join opens when licensed contests go live. Bet on Sports in the meantime.</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {isLoggedIn && (
        <section className="fantasy-section">
          <h2>My entries</h2>
          {entries.length === 0 ? (
            <p className="fantasy-empty">You have not joined a contest yet.</p>
          ) : (
            <ul className="fantasy-entries">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.entryFee === 0 ? 'Free' : formatInr(entry.entryFee)}
                    {' · '}
                    {formatIstDateTime(entry.joinedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
