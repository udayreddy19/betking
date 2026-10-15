import { adminApiClient } from '../api/adminApiClient';
import { publishLocalProductConfig } from '../../../context/ProductContext';

/**
 * Re-read the authoritative product configuration from the Admin API and publish it to every
 * mounted ProductProvider (same path used by ProductConfigurationPanel after a save).
 * Uses the real walletEnabled / bettingEnabled values — never hard-coded ones.
 * If the Admin read fails we just ask providers to re-fetch the public endpoint.
 */
export async function syncProductConfigFromAdmin(known = null) {
  try {
    const config = known || await adminApiClient.get('/products');
    if (config && typeof config.walletEnabled === 'boolean' && typeof config.bettingEnabled === 'boolean') {
      // Real walletEnabled / bettingEnabled / pgReviewMode / softwarePlatformEnabled from the server.
      publishLocalProductConfig(config);
      return config;
    }
  } catch {
    /* fall through to a plain refresh */
  }
  publishLocalProductConfig();
  return null;
}
