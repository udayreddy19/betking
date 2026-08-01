/**
 * Free, embeddable live stream sources (official YouTube channels).
 * Channel embed shows the active live stream when broadcasting; otherwise use fallbackVideoId.
 */
export const STREAM_CHANNELS = {
  'the-hundred': {
    channelId: 'UCPDAFa3eTpUhugfKPuvxPww',
    label: 'The Hundred (YouTube)',
    channelUrl: 'https://www.youtube.com/@thehundred',
  },
  icc: {
    channelId: 'UCqD1v67e0r5h2tFq7wFbH2Q',
    label: 'ICC Cricket (YouTube)',
    channelUrl: 'https://www.youtube.com/@ICC',
  },
  'sky-sports-cricket': {
    channelId: 'UC7QZgFbBKq1T_6kGbF3_lVQ',
    label: 'Sky Sports Cricket (YouTube)',
    channelUrl: 'https://www.youtube.com/@SkySportsCricket',
  },
};

// Official embeddable highlight videos (ICC / tournament channels)
const CRICKET_FALLBACK_VIDEOS = {
  hundred: '2HMuJbexIow',
  icc: 'l7IikJ4nUoc',
  generic: '2HMuJbexIow',
};

const LEAGUE_STREAM_MAP = [
  { pattern: /hundred/i, source: 'the-hundred', fallback: 'hundred' },
  { pattern: /ipl/i, source: 'icc', fallback: 'icc' },
  { pattern: /t20|odi|test|world cup|international/i, source: 'icc', fallback: 'icc' },
  { pattern: /premier league|epl|la liga|serie a|bundesliga/i, source: null },
  { pattern: /nba|basketball/i, source: null },
];

const SPORT_DEFAULTS = {
  cricket: { source: 'icc', fallback: 'icc' },
  'virtual-cricket': { source: 'the-hundred', fallback: 'hundred' },
  soccer: null,
  esoccer: null,
  basketball: null,
  tennis: null,
};

/**
 * @param {object} match
 * @returns {{ provider: string, channelId?: string, videoId?: string, label: string, channelUrl?: string, externalLinks?: Array<{label:string,url:string}> } | null}
 */
export function resolveMatchStream(match) {
  if (!match) return null;

  if (match.liveStream) {
    return normalizeStreamConfig(match.liveStream);
  }

  const league = match.league || '';
  const sport = match.sport || 'cricket';

  for (const entry of LEAGUE_STREAM_MAP) {
    if (entry.pattern.test(league) && entry.source) {
      return buildChannelStream(entry.source, entry.fallback);
    }
  }

  const sportDefault = SPORT_DEFAULTS[sport];
  if (sportDefault) {
    return buildChannelStream(sportDefault.source, sportDefault.fallback);
  }

  return null;
}

function buildChannelStream(sourceKey, fallbackKey) {
  const channel = STREAM_CHANNELS[sourceKey];
  if (!channel) return null;

  const fallbackVideoId = CRICKET_FALLBACK_VIDEOS[fallbackKey] || CRICKET_FALLBACK_VIDEOS.generic;

  return {
    provider: 'youtube-channel',
    channelId: channel.channelId,
    videoId: fallbackVideoId,
    label: channel.label,
    channelUrl: channel.channelUrl,
    externalLinks: getExternalLinks(sourceKey),
  };
}

function normalizeStreamConfig(config) {
  if (config.provider === 'youtube' && config.videoId) {
    return {
      provider: 'youtube',
      videoId: config.videoId,
      label: config.label || 'Live stream',
      channelUrl: config.channelUrl,
    };
  }
  if (config.provider === 'youtube-channel' && config.channelId) {
    return {
      provider: 'youtube-channel',
      channelId: config.channelId,
      videoId: config.fallbackVideoId || config.videoId,
      label: config.label || 'Live stream',
      channelUrl: config.channelUrl,
    };
  }
  if (config.provider === 'hls' && config.url) {
    return {
      provider: 'hls',
      url: config.url,
      label: config.label || 'Live stream',
    };
  }
  return null;
}

function getExternalLinks(sourceKey) {
  const links = [];

  if (sourceKey === 'the-hundred') {
    links.push(
      { label: 'The Hundred', url: 'https://www.thehundred.com/' },
      { label: 'BBC iPlayer (UK)', url: 'https://www.bbc.co.uk/iplayer' },
    );
  }
  if (sourceKey === 'icc') {
    links.push(
      { label: 'ICC.tv', url: 'https://www.icc-cricket.com/' },
      { label: 'FanCode (India)', url: 'https://www.fancode.com/' },
    );
  }

  return links;
}

export function getYouTubeEmbedUrl({ provider, channelId, videoId }) {
  if (provider === 'youtube-channel' && channelId) {
    return `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=0&mute=0&rel=0&modestbranding=1`;
  }
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`;
  }
  return null;
}
