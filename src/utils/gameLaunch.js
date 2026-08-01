import { getLaunchConfig } from '../data/gameLaunchMap';

const API_PATH = '/api/casino-launch';

function getLobbyReturnUrl() {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/casino`;
  }
  return 'https://betking-two.vercel.app/casino';
}

/** Apply current site as return/lobby URL on a launch config */
export function withLobbyUrl(config) {
  if (!config) return null;
  const lobby = encodeURIComponent(getLobbyReturnUrl());
  let startUrl = config.startUrl;

  try {
    const u = new URL(startUrl);
    if (u.hostname.includes('spribe') || u.hostname.includes('spribegaming')) {
      u.searchParams.set('return_url', getLobbyReturnUrl());
    } else if (u.hostname.includes('pragmaticplay')) {
      u.searchParams.set('lobbyUrl', getLobbyReturnUrl());
    }
    startUrl = u.href;
  } catch {
    // keep original
  }

  return { ...config, startUrl };
}

/**
 * Resolve a playable game URL for iframe embed.
 * Uses direct provider URLs first; optionally enriches via API redirect resolution.
 */
export async function resolveGameLaunchUrl(gameId) {
  const config = withLobbyUrl(getLaunchConfig(gameId));
  if (!config) {
    throw new Error('This game is not available yet.');
  }

  // Direct embed (TVBet live, turbo.spribegaming, etc.)
  if (!config.followRedirects) {
    return {
      url: config.startUrl,
      provider: config.provider,
      isLive: Boolean(config.isLive),
    };
  }

  // Optional: server resolves Spribe/Pragmatic redirect chains for a stable iframe src
  try {
    const res = await fetch(`${API_PATH}?gameId=${encodeURIComponent(gameId)}`);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data?.url) return data;
    }
  } catch {
    // API unavailable — iframe can follow redirects from entry URL
  }

  return {
    url: config.startUrl,
    provider: config.provider,
    isLive: Boolean(config.isLive),
  };
}
