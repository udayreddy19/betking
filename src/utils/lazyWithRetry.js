import { lazy } from 'react';

/**
 * Wraps dynamic React component imports with automatic retry and stale-chunk recovery.
 *
 * When a new deployment occurs, older chunk hashes are removed from the server.
 * If an active client attempts to load a route, browsers throw chunk errors:
 * - Safari: "TypeError: Importing a module script failed."
 * - Chromium/Firefox: "TypeError: Failed to fetch dynamically imported module"
 *
 * This utility detects such failures, logs them cleanly, and triggers a single
 * graceful page reload so the client fetches the latest manifest and assets.
 */
export function lazyWithRetry(importFn) {
  return lazy(async () => {
    const pagePath = typeof window !== 'undefined' ? window.location.pathname : '';
    const retryKey = `oddsyra_chunk_retry_${pagePath}`;
    const hasRetried = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(retryKey) === 'true';

    try {
      return await importFn();
    } catch (error) {
      const errorMsg = String(error?.message || error || '');
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        /importing a module script failed/i.test(errorMsg) ||
        /failed to fetch dynamically imported module/i.test(errorMsg) ||
        /error loading dynamically imported module/i.test(errorMsg) ||
        /loading chunk [\d\w]+ failed/i.test(errorMsg);

      if (isChunkError && typeof window !== 'undefined' && !hasRetried) {
        try {
          sessionStorage.setItem(retryKey, 'true');
          // Clear after 30 seconds to allow future retries on subsequent deployments
          setTimeout(() => {
            try {
              sessionStorage.removeItem(retryKey);
            } catch {
              // Ignore session storage errors
            }
          }, 30000);
        } catch {
          // Ignore session storage errors
        }

        console.warn('[lazyWithRetry] Stale chunk detected after deployment, reloading page for fresh assets:', errorMsg);
        window.location.reload();

        // Return a promise that does not resolve so React doesn't render an ErrorBoundary while reloading
        return new Promise(() => {});
      }

      // If already retried once or it's another error, bubble up to ErrorBoundary
      throw error;
    }
  });
}
