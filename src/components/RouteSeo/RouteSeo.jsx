import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_OG_IMAGE, SITE_NAME, metaForPath } from '../../config/siteSeo';

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

/**
 * Client-side SEO sync after hydration.
 * Canonical strips query params (utm/ref/etc.) so tracking URLs do not become alternate canonicals.
 * Private/application routes always receive noindex regardless of SEO_INDEXING_ENABLED.
 */
export default function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaForPath(pathname);

    document.title = meta.title;

    upsertMeta('meta', 'name', 'description', meta.description);
    upsertMeta('meta', 'name', 'robots', meta.robots);

    upsertMeta('meta', 'property', 'og:title', meta.title);
    upsertMeta('meta', 'property', 'og:description', meta.description);
    upsertMeta('meta', 'property', 'og:type', 'website');
    upsertMeta('meta', 'property', 'og:url', meta.canonical);
    upsertMeta('meta', 'property', 'og:site_name', SITE_NAME);
    upsertMeta('meta', 'property', 'og:image', DEFAULT_OG_IMAGE);

    upsertMeta('meta', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta', 'name', 'twitter:title', meta.title);
    upsertMeta('meta', 'name', 'twitter:description', meta.description);
    upsertMeta('meta', 'name', 'twitter:image', DEFAULT_OG_IMAGE);

    upsertLink('canonical', meta.canonical);
  }, [pathname]);

  return null;
}
