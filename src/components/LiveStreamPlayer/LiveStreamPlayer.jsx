import { useState } from 'react';
import { HiOutlineExternalLink } from '../../icons';
import { resolveMatchStream, getYouTubeEmbedUrl } from '../../utils/matchStreams';
import './LiveStreamPlayer.css';

export default function LiveStreamPlayer({ match }) {
  const stream = resolveMatchStream(match);
  const [mode, setMode] = useState('live');

  if (!stream) {
    return (
      <div className="live-stream-player live-stream-player--empty">
        <div className="live-stream-empty-icon">📺</div>
        <p>No free live stream configured for this match.</p>
        <a
          href="https://www.youtube.com/results?search_query=live+cricket"
          target="_blank"
          rel="noopener noreferrer"
          className="live-stream-external-link"
        >
          Search live cricket on YouTube <HiOutlineExternalLink />
        </a>
      </div>
    );
  }

  const liveEmbedUrl = getYouTubeEmbedUrl({
    provider: stream.provider === 'youtube-channel' ? 'youtube-channel' : 'youtube',
    channelId: stream.channelId,
    videoId: null,
  });

  const fallbackEmbedUrl = stream.videoId
    ? getYouTubeEmbedUrl({ provider: 'youtube', videoId: stream.videoId })
    : null;

  const activeUrl = mode === 'live' ? liveEmbedUrl : fallbackEmbedUrl;
  const showToggle = stream.provider === 'youtube-channel' && fallbackEmbedUrl;

  return (
    <div className="live-stream-player">
      <div className="live-stream-header">
        <span className="live-stream-badge">
          {match?.matchState === 'in' ? '● LIVE' : 'STREAM'}
        </span>
        <span className="live-stream-source">{stream.label}</span>
      </div>

      {showToggle && (
        <div className="live-stream-mode-toggle">
          <button
            type="button"
            className={mode === 'live' ? 'active' : ''}
            onClick={() => setMode('live')}
          >
            Live channel
          </button>
          <button
            type="button"
            className={mode === 'highlights' ? 'active' : ''}
            onClick={() => setMode('highlights')}
          >
            Highlights
          </button>
        </div>
      )}

      <div className="live-stream-frame-wrap">
        {stream.provider === 'hls' && stream.url ? (
          <video
            className="live-stream-video"
            src={stream.url}
            controls
            playsInline
            title={stream.label}
          >
            <track kind="captions" />
          </video>
        ) : activeUrl ? (
          <iframe
            className="live-stream-iframe"
            src={activeUrl}
            title={`${stream.label} - ${match?.team1?.name} vs ${match?.team2?.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="live-stream-player--empty">
            <p>Stream unavailable</p>
          </div>
        )}
      </div>

      <p className="live-stream-disclaimer">
        Free streams from official YouTube channels. Availability varies by region and broadcast rights.
        {mode === 'live' && showToggle && ' If the channel is offline, switch to Highlights.'}
      </p>

      <div className="live-stream-links">
        {stream.channelUrl && (
          <a href={stream.channelUrl} target="_blank" rel="noopener noreferrer" className="live-stream-external-link">
            Open on YouTube <HiOutlineExternalLink />
          </a>
        )}
        {stream.externalLinks?.map(link => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="live-stream-external-link"
          >
            {link.label} <HiOutlineExternalLink />
          </a>
        ))}
      </div>
    </div>
  );
}
