/**
 * Build XML sitemap including static pages + live/upcoming match deep links.
 */

const STATIC_URLS = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/sports', changefreq: 'hourly', priority: '0.9' },
  { loc: '/live-betting', changefreq: 'hourly', priority: '0.9' },
  { loc: '/live-cricket-betting', changefreq: 'weekly', priority: '0.85' },
  { loc: '/how-to-bet-live-cricket', changefreq: 'monthly', priority: '0.8' },
  { loc: '/upi-deposits', changefreq: 'monthly', priority: '0.8' },
  { loc: '/what-is-oddsyra-srl', changefreq: 'monthly', priority: '0.75' },
  { loc: '/cricket-betting-guide', changefreq: 'monthly', priority: '0.8' },
  { loc: '/srl', changefreq: 'daily', priority: '0.8' },
  { loc: '/invite', changefreq: 'weekly', priority: '0.8' },
  { loc: '/register', changefreq: 'monthly', priority: '0.8' },
  { loc: '/promotions', changefreq: 'weekly', priority: '0.7' },
  { loc: '/vip', changefreq: 'monthly', priority: '0.5' },
  { loc: '/help', changefreq: 'monthly', priority: '0.5' },
  { loc: '/responsible-gaming', changefreq: 'yearly', priority: '0.4' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.3' },
  { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
];

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function buildOddsYraSitemapXml({ baseUrl = 'https://oddsyra.com' } = {}) {
  const base = String(baseUrl || 'https://oddsyra.com').replace(/\/$/, '');
  const urls = STATIC_URLS.map((u) => ({
    loc: `${base}${u.loc}`,
    changefreq: u.changefreq,
    priority: u.priority,
  }));

  try {
    const { getIplSrlMatches } = await import('./iplSrlSimulator.mjs');
    const srl = getIplSrlMatches(Date.now()) || [];
    const seen = new Set();
    for (const m of srl.slice(0, 80)) {
      const id = m.id || m.matchId;
      if (!id || seen.has(id)) continue;
      if (m.matchState === 'post') continue;
      seen.add(id);
      urls.push({
        loc: `${base}/sports?match=${encodeURIComponent(id)}`,
        changefreq: 'hourly',
        priority: '0.65',
      });
    }
  } catch {
    // Soft-fail — static sitemap alone is fine
  }

  const body = urls.map((u) => {
    let row = `  <url><loc>${xmlEscape(u.loc)}</loc>`;
    if (u.changefreq) row += `<changefreq>${u.changefreq}</changefreq>`;
    if (u.priority) row += `<priority>${u.priority}</priority>`;
    row += '</url>';
    return row;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
