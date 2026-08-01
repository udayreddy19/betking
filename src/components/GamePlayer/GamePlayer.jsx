import { useState, useEffect, useCallback } from 'react';
import { FiArrowLeft, FiX, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { resolveGameLaunchUrl } from '../../utils/gameLaunch';
import './GamePlayer.css';

export default function GamePlayer({ game, onExit, onClose }) {
  const [launchUrl, setLaunchUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLaunchUrl(null);
    try {
      const result = await resolveGameLaunchUrl(game.id);
      setLaunchUrl(result.url);
    } catch (err) {
      setError(err?.message || 'Failed to launch game. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  const openExternal = () => {
    if (launchUrl) window.open(launchUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="game-player">
      <header className="game-player-header">
        <button type="button" className="game-player-back" onClick={onExit} aria-label="Back">
          <FiArrowLeft />
        </button>
        <div className="game-player-title">
          <span>{game.icon}</span>
          <span>{game.name}</span>
          {game.isLive && <span className="game-player-live-tag">LIVE</span>}
        </div>
        <div className="game-player-actions">
          {launchUrl && (
            <button type="button" className="game-player-icon-btn" onClick={openExternal} aria-label="Open in new tab">
              <FiExternalLink />
            </button>
          )}
          <button type="button" className="game-player-icon-btn" onClick={loadGame} aria-label="Reload game">
            <FiRefreshCw />
          </button>
          <button type="button" className="game-player-close" onClick={onClose} aria-label="Close game">
            <FiX />
          </button>
        </div>
      </header>

      <div className="game-player-frame-wrap">
        {loading && (
          <div className="game-player-status">
            <div className="game-player-spinner" />
            <p>Loading {game.name}…</p>
          </div>
        )}

        {error && !loading && (
          <div className="game-player-status game-player-status--error">
            <p>{error}</p>
            <button type="button" className="game-player-action-btn" onClick={loadGame}>
              Try again
            </button>
          </div>
        )}

        {launchUrl && !error && (
          <iframe
            className="game-player-frame"
            src={launchUrl}
            title={game.name}
            allow="autoplay; fullscreen; encrypted-media; clipboard-write"
            allowFullScreen
            onLoad={() => setLoading(false)}
          />
        )}
      </div>

      <footer className="game-player-footer">
        <span>{game.provider}</span>
        {game.isLive && <span className="game-player-footer-live">● Live dealer stream</span>}
        {game.rtp && <span>RTP {game.rtp}</span>}
      </footer>
    </div>
  );
}
