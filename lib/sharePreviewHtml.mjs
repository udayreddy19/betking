/**
 * Server-rendered HTML for social crawlers (WhatsApp, Telegram, Facebook, etc.)
 * so referral link previews show the reward — SPA index.html alone cannot.
 */

import { getReferralProgramConfig } from './referralLoyaltyEngine.mjs';

const BOT_UA_RE = /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|linkedinbot|slackbot|discordbot|pinterest|googlebot|bingbot|applebot|embedly|quora link preview|showyoubot|outbrain|vkshare|w3c_validator|redditbot|rogerbot|linkedinbot|embedly|baiduspider|yandex|duckduckbot|ia_archiver/i;

export function isSocialCrawler(userAgent = '') {
  return BOT_UA_RE.test(String(userAgent || ''));
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSharePreviewHtml({
  code = null,
  path = '/invite',
  baseUrl = 'https://oddsyra.com',
} = {}) {
  const conf = getReferralProgramConfig();
  const mult = Number(conf.campaignMultiplier) || 1;
  const reward = Math.round((Number(conf.referredReward) || 500) * mult);
  const label = conf.rewardKind === 'bonus' ? 'Bonus' : 'Free Bet';
  const campaign = conf.campaignLabel && mult > 1 ? ` · ${conf.campaignLabel}` : '';
  const base = String(baseUrl || 'https://oddsyra.com').replace(/\/$/, '');
  const refQ = code ? `?ref=${encodeURIComponent(String(code).toUpperCase())}` : '';
  const canonical = `${base}${path}${refQ}`;
  const registerUrl = `${base}/register${refQ}`;

  const title = code
    ? `You're invited to OddsYra — ₹${reward} ${label}${campaign}`
    : `Invite friends to OddsYra — ₹${reward} ${label}`;
  const description = code
    ? `Your friend sent you ₹${reward} ${label} on OddsYra. Live cricket betting, UPI deposits. Claim in under a minute. 18+ only.`
    : `Join OddsYra — live cricket betting with UPI. Friends get ₹${reward} ${label}; you earn when they play. 18+ only.`;
  const image = `${base}/oddsyra-logo.png`;

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="en_IN" />
  <meta property="og:site_name" content="OddsYra" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:alt" content="OddsYra" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(registerUrl)}" />
</head>
<body>
  <p><a href="${escapeHtml(registerUrl)}">${escapeHtml(title)}</a></p>
  <p>${escapeHtml(description)}</p>
</body>
</html>`;
}
