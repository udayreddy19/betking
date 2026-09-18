/**
 * Social / crawler HTML for invite?ref= (reward OG) and fallback public SEO shells.
 */

import { getReferralProgramConfig } from './referralLoyaltyEngine.mjs';
import { getSeoPublicPage, SEO_NAV } from './seoPublicPages.mjs';

const BOT_UA_RE = /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|linkedinbot|slackbot|discordbot|pinterest|googlebot|bingbot|applebot|embedly|quora link preview|showyoubot|outbrain|vkshare|w3c_validator|redditbot|rogerbot|baiduspider|yandex|duckduckbot|ia_archiver|ahrefsbot|semrushbot|dotbot|petalbot|bytespider|dataforseo|openseo|screaming frog|seokicks|mj12bot/i;

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

function navHtml(activePath) {
  return SEO_NAV.map(
    (item) =>
      `<a href="${escapeHtml(item.href)}"${item.href === activePath ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`,
  ).join(' · ');
}

export function buildPublicSeoHtml({
  path = '/',
  baseUrl = 'https://oddsyra.com',
} = {}) {
  const page = getSeoPublicPage(path);
  if (!page) return null;
  const base = String(baseUrl || 'https://oddsyra.com').replace(/\/$/, '');
  const canonical = path === '/' ? `${base}/` : `${base}${path}`;
  const image = `${base}/oddsyra-logo.png`;
  const paras = (page.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="en_IN" />
  <meta property="og:site_name" content="OddsYra" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(page.title)}" />
  <meta name="twitter:description" content="${escapeHtml(page.description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body>
  <nav aria-label="Primary">${navHtml(path)}</nav>
  <main>
    <h1>${escapeHtml(page.h1)}</h1>
    ${paras}
    <p><a href="/register">Create account</a> · <a href="/sports">Browse sports</a> · <a href="/invite">Invite friends</a> · <a href="https://www.instagram.com/oddsyra/">Instagram @oddsyra</a></p>
  </main>
  <footer>
    <p>OddsYra · 18+ only · <a href="/responsible-gaming">Responsible Gaming</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="https://www.instagram.com/oddsyra/">Instagram</a></p>
  </footer>
</body>
</html>`;
}

export function buildSharePreviewHtml({
  code = null,
  path = '/invite',
  baseUrl = 'https://oddsyra.com',
} = {}) {
  if (!code) {
    const shell = buildPublicSeoHtml({ path, baseUrl });
    if (shell) return shell;
  }

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
</head>
<body>
  <nav aria-label="Primary">${navHtml(path)}</nav>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><a href="${escapeHtml(registerUrl)}">Create account &amp; claim</a> · <a href="/sports">Browse sports</a> · <a href="https://www.instagram.com/oddsyra/">Instagram @oddsyra</a></p>
  </main>
  <footer>
    <p>OddsYra · 18+ only · <a href="/responsible-gaming">Responsible Gaming</a> · <a href="/terms">Terms</a></p>
  </footer>
</body>
</html>`;
}
