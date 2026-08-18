import { useEffect } from 'react';
import { IoClose, FiPlay } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import GamePlayer from '../GamePlayer/GamePlayer';
import { useCasino } from '../../context/CasinoContext';
import './GamePlayModal.css';
import '../GamePlayer/GamePlayer.css';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1' || import.meta.env.DEV;

export default function GamePlayModal() {
  const { isLoggedIn, openLoginModal, showToast } = useAuth();
  const { activeGame, isPlaying, closeGame, startPlaying, stopPlaying } = useCasino();

  useEffect(() => {
    if (!activeGame) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (isPlaying) stopPlaying();
        else closeGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [activeGame, isPlaying, closeGame, stopPlaying]);

  if (!activeGame) return null;

  if (isPlaying) {
    return (
      <GamePlayer
        game={activeGame}
        onExit={stopPlaying}
        onClose={closeGame}
      />
    );
  }

  const handlePlay = () => {
    if (!isLoggedIn) {
      closeGame();
      openLoginModal();
      return;
    }
    if (!DEMO_MODE) {
      showToast('Casino tables are not live yet. Sports betting is available on the Sports page.', 'info');
      return;
    }
    startPlaying();
  };

  return (
    <div className="game-play-overlay" onClick={closeGame} role="presentation">
      <div
        className="game-play-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-play-title"
      >
        <button type="button" className="game-play-close" onClick={closeGame} aria-label="Close">
          <IoClose />
        </button>

        <div className="game-play-preview" style={{ background: activeGame.gradient }}>
          {activeGame.icon && <span className="game-play-icon">{activeGame.icon}</span>}
          <div className="game-play-badges">
            {activeGame.isLive && <span className="game-play-badge game-play-badge--live">LIVE</span>}
            {activeGame.isHot && <span className="game-play-badge">HOT</span>}
            {activeGame.isNew && <span className="game-play-badge game-play-badge--new">NEW</span>}
          </div>
        </div>

        <div className="game-play-body">
          <h2 id="game-play-title">{activeGame.name}</h2>
          <p className="game-play-provider">{activeGame.provider}</p>

          <div className="game-play-meta">
            {activeGame.rtp && <span>RTP {activeGame.rtp}</span>}
            {activeGame.minBet && <span>Min bet {activeGame.minBet}</span>}
            {activeGame.isLive && activeGame.players != null && (
              <span>{activeGame.players.toLocaleString()} playing now</span>
            )}
          </div>

          <button type="button" className="game-play-btn" onClick={handlePlay}>
            <FiPlay />
            {isLoggedIn ? (activeGame.isLive ? 'Join live table' : 'Play now') : 'Log in to play'}
          </button>

          {isLoggedIn && (
            <p className="game-play-balance">
              Balance: ₹{user.balance.toLocaleString('en-IN')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
