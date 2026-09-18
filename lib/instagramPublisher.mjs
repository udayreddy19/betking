/**
 * Instagram Content Publishing via Meta Graph API.
 * Requires a Professional (Business/Creator) IG account linked to a Facebook Page,
 * plus INSTAGRAM_BUSINESS_ACCOUNT_ID + INSTAGRAM_ACCESS_TOKEN.
 *
 * Flow: create media container → wait until FINISHED → media_publish.
 */

const DEFAULT_GRAPH_VERSION = 'v21.0';
const CONTAINER_POLL_MS = 2000;
const CONTAINER_MAX_WAIT_MS = 90_000;

export function getInstagramConfig() {
  const accountId = String(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();
  const accessToken = String(process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
  const graphVersion = String(process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION).trim() || DEFAULT_GRAPH_VERSION;
  const configured = Boolean(accountId && accessToken);
  return {
    configured,
    accountId: configured ? accountId : null,
    accessToken: configured ? accessToken : null,
    graphVersion,
    graphBase: `https://graph.facebook.com/${graphVersion}`,
  };
}

export function instagramSetupHints() {
  return {
    steps: [
      'Convert @oddsyra to a Professional (Business or Creator) account in the Instagram app.',
      'Create a Meta app at developers.facebook.com and add Instagram Graph API.',
      'Connect the Instagram account to a Facebook Page, then generate a long-lived Page access token with instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement.',
      'Set INSTAGRAM_BUSINESS_ACCOUNT_ID (IG user id) and INSTAGRAM_ACCESS_TOKEN on the server, then restart.',
      'Ensure SOCIAL_MEDIA_PUBLIC_BASE_URL / APP_URL is a public HTTPS origin Meta can fetch (e.g. https://oddsyra.com).',
    ],
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
  };
}

async function graphRequest(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data?.error?.message
      || data?.error?.error_user_msg
      || `Instagram API HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.code = data?.error?.code || 'INSTAGRAM_API_ERROR';
    err.details = data?.error || data;
    throw err;
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContainerReady(config, containerId) {
  const started = Date.now();
  let lastStatus = 'IN_PROGRESS';
  while (Date.now() - started < CONTAINER_MAX_WAIT_MS) {
    const statusUrl = new URL(`${config.graphBase}/${encodeURIComponent(containerId)}`);
    statusUrl.searchParams.set('fields', 'status_code,status');
    statusUrl.searchParams.set('access_token', config.accessToken);
    const data = await graphRequest(statusUrl.toString());
    lastStatus = String(data.status_code || data.status || '').toUpperCase();
    if (lastStatus === 'FINISHED' || lastStatus === 'PUBLISHED') return data;
    if (lastStatus === 'ERROR' || lastStatus === 'EXPIRED') {
      const err = new Error(`Instagram media container ${lastStatus.toLowerCase()}`);
      err.status = 502;
      err.code = 'INSTAGRAM_CONTAINER_FAILED';
      err.details = data;
      throw err;
    }
    await sleep(CONTAINER_POLL_MS);
  }
  const err = new Error(`Instagram media container timed out (last status: ${lastStatus})`);
  err.status = 504;
  err.code = 'INSTAGRAM_CONTAINER_TIMEOUT';
  throw err;
}

/**
 * Publish an image to Instagram feed or story.
 * @param {{ imageUrl: string, caption?: string, mediaType?: 'FEED'|'STORY' }} opts
 */
export async function publishInstagramImage({
  imageUrl,
  caption = '',
  mediaType = 'FEED',
} = {}) {
  const config = getInstagramConfig();
  if (!config.configured) {
    const err = new Error('Instagram is not configured. Set INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN.');
    err.status = 503;
    err.code = 'INSTAGRAM_NOT_CONFIGURED';
    throw err;
  }
  if (!imageUrl || !/^https:\/\//i.test(imageUrl)) {
    const err = new Error('Instagram requires a public HTTPS image URL');
    err.status = 400;
    err.code = 'INVALID_IMAGE_URL';
    throw err;
  }

  const createUrl = new URL(`${config.graphBase}/${encodeURIComponent(config.accountId)}/media`);
  createUrl.searchParams.set('access_token', config.accessToken);
  createUrl.searchParams.set('image_url', imageUrl);

  const kind = String(mediaType || 'FEED').toUpperCase();
  if (kind === 'STORY') {
    createUrl.searchParams.set('media_type', 'STORIES');
  } else if (caption) {
    createUrl.searchParams.set('caption', caption);
  }

  const container = await graphRequest(createUrl.toString(), { method: 'POST' });
  const containerId = container.id;
  if (!containerId) {
    const err = new Error('Instagram did not return a media container id');
    err.status = 502;
    err.code = 'INSTAGRAM_NO_CONTAINER';
    throw err;
  }

  await waitForContainerReady(config, containerId);

  const publishUrl = new URL(`${config.graphBase}/${encodeURIComponent(config.accountId)}/media_publish`);
  publishUrl.searchParams.set('access_token', config.accessToken);
  publishUrl.searchParams.set('creation_id', containerId);

  const published = await graphRequest(publishUrl.toString(), { method: 'POST' });
  return {
    containerId,
    postId: published.id || null,
    permalinkHint: published.id
      ? `https://www.instagram.com/p/${published.id}/`
      : null,
  };
}
