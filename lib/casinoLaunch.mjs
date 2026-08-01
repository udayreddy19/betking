import { getLaunchConfig } from '../src/data/gameLaunchMap.js';

const MAX_REDIRECTS = 6;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractUrlFromHtml(html, baseUrl) {
  const patterns = [
    /window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i,
    /location\.replace\(['"]([^'"]+)['"]\)/i,
    /content="0;\s*url=([^"]+)"/i,
    /"gameUrl"\s*:\s*"([^"]+)"/i,
    /"launchUrl"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return new URL(match[1].replace(/\\u0026/g, '&'), baseUrl).href;
      } catch {
        // skip invalid URL from HTML
      }
    }
  }

  return null;
}

/**
 * Follow redirects manually to capture session URLs (Spribe tokens, Pragmatic mgckey).
 * @param {string} startUrl
 * @returns {Promise<string>}
 */
export async function resolveLaunchUrl(startUrl) {
  let url = startUrl;

  for (let i = 0; i < MAX_REDIRECTS; i += 1) {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      try {
        url = new URL(location, url).href;
      } catch {
        break;
      }
      continue;
    }

    if (response.status === 200) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const html = await response.text();
        const next = extractUrlFromHtml(html, url);
        if (next && next !== url) {
          url = next;
          continue;
        }
      }
    }

    break;
  }

  return url;
}

/**
 * @param {string} gameId
 * @param {{ lobbyUrl?: string }} [opts]
 */
export async function launchCasinoGame(gameId, opts = {}) {
  const config = getLaunchConfig(gameId);
  if (!config) {
    throw new Error(`No launch config for game: ${gameId}`);
  }

  let startUrl = config.startUrl;
  if (opts.lobbyUrl) {
    const u = new URL(startUrl);
    if (u.hostname.includes('spribe')) {
      u.searchParams.set('return_url', opts.lobbyUrl);
    } else {
      u.searchParams.set('lobbyUrl', opts.lobbyUrl);
    }
    startUrl = u.href;
  }

  const url = config.followRedirects
    ? await resolveLaunchUrl(startUrl)
    : startUrl;

  return {
    gameId,
    provider: config.provider,
    url,
    isLive: Boolean(config.isLive) || config.provider === 'tvbet',
  };
}
