import './LiveScoresFeedBanner.css';

export default function LiveScoresFeedBanner({ message, onRetry, retrying }) {
  if (!message) return null;
  return (
    <div className="live-scores-feed-banner" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          className="live-scores-feed-banner__retry"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
