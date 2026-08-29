/**
 * Public registry entry point for API Explorer.
 * Prefer importing from here when extending integrations.
 */
export {
  API_REGISTRY,
  API_CATEGORIES,
  getApiById,
  listRegistry,
  listSafeRefreshIds,
} from './api-explorer/registry.mjs';
