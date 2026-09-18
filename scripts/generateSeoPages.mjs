#!/usr/bin/env node
/**
 * After Vite build: write per-route HTML shells so OpenSEO/Google see H1, copy, nav, self-canonicals.
 * Humans still get the SPA — React replaces #root on hydrate.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SEO_NAV, SEO_PUBLIC_PAGES, normalizeSeoPath } from '../lib/seoPublicPages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const indexPath = path.join(distDir, 'index.html');
const siteUrl = (process.env.VITE_SITE_URL || process.env.APP_URL || 'https://oddsyra.com').replace(/\/$/, '');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBodyHtml(page, pathKey) {
  const nav = SEO_NAV.map(
    (item) =>
      `<a href="${escapeHtml(item.href)}"${item.href === pathKey ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`,
  ).join(' · ');
  const paras = (page.paragraphs || [])
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');
  return `
<nav class="seo-nav" aria-label="Primary">${nav}</nav>
<main class="seo-main">
  <h1>${escapeHtml(page.h1)}</h1>
  ${paras}
  <p><a href="/register">Create account</a> · <a href="/sports">Browse sports</a> · <a href="/invite">Invite friends</a> · <a href="https://www.instagram.com/oddsyra/" rel="noopener noreferrer">Instagram @oddsyra</a></p>
</main>
<footer class="seo-footer">
  <p>OddsYra · 18+ only · <a href="/responsible-gaming">Responsible Gaming</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="https://www.instagram.com/oddsyra/" rel="noopener noreferrer">Instagram</a></p>
</footer>`.trim();
}

function upsertHead(html, { title, description, canonical, ogImage }) {
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`,
  );
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  );
  if (ogImage) {
    out = out.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    );
  }
  return out;
}

function injectRoot(html, inner) {
  if (!/<div id="root"><\/div>/i.test(html)) {
    throw new Error('dist/index.html missing empty <div id="root"></div>');
  }
  return html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root">${inner}</div>`,
  );
}

function writePage(pathKey, page, template) {
  const canonical = pathKey === '/' ? `${siteUrl}/` : `${siteUrl}${pathKey}`;
  const ogImage = `${siteUrl}/oddsyra-logo.png`;
  let html = upsertHead(template, {
    title: page.title,
    description: page.description,
    canonical,
    ogImage,
  });
  html = injectRoot(html, buildBodyHtml(page, pathKey));

  if (pathKey === '/') {
    fs.writeFileSync(indexPath, html, 'utf8');
    return indexPath;
  }

  const dir = path.join(distDir, pathKey.replace(/^\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, 'index.html');
  fs.writeFileSync(outFile, html, 'utf8');
  return outFile;
}

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error('generateSeoPages: dist/index.html missing — run vite build first');
    process.exit(1);
  }
  const template = fs.readFileSync(indexPath, 'utf8');
  const written = [];
  for (const [pathKey, page] of Object.entries(SEO_PUBLIC_PAGES)) {
    const key = normalizeSeoPath(pathKey);
    written.push(writePage(key, page, template));
  }
  console.log(`generateSeoPages: wrote ${written.length} shells → ${siteUrl}`);
  for (const f of written) console.log(`  ${path.relative(root, f)}`);
}

main();
