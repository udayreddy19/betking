import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, metaForPath } from '../../config/siteSeo';

function upsertMeta(selector, attr, name, content) {
  if (!content || typeof document === 'undefined') return;
  let el = document.head.querySelector(`${selector}[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href) {
  if (!href || typeof document === 'undefined') return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export default function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaForPath(pathname);
    const url = `${SITE_URL}${meta.path === '/' ? '' : meta.path}`;

    document.title = meta.title;

    upsertMeta('meta', 'name', 'description', meta.description);
    upsertMeta('meta', 'name', 'robots', 'index,follow');

    upsertMeta('meta', 'property', 'og:title', meta.title);
    upsertMeta('meta', 'property', 'og:description', meta.description);
    upsertMeta('meta', 'property', 'og:type', 'website');
    upsertMeta('meta', 'property', 'og:url', url);
    upsertMeta('meta', 'property', 'og:site_name', SITE_NAME);
    upsertMeta('meta', 'property', 'og:image', DEFAULT_OG_IMAGE);

    upsertMeta('meta', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta', 'name', 'twitter:title', meta.title);
    upsertMeta('meta', 'name', 'twitter:description', meta.description);
    upsertMeta('meta', 'name', 'twitter:image', DEFAULT_OG_IMAGE);

    upsertLink('canonical', url);
  }, [pathname]);

  return null;
}
