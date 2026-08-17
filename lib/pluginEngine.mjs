/**
 * Enterprise Plugin Platform — OddsYra Enterprise Platform (lib/pluginEngine.mjs)
 * Dynamic plugin registration, lifecycle management, and configuration hooks for third-party extensions.
 */

const REGISTERED_PLUGINS = new Map();

export function registerPlugin(pluginId, pluginDefinition = {}) {
  const plugin = {
    pluginId,
    name: pluginDefinition.name || pluginId,
    version: pluginDefinition.version || '1.0.0',
    enabled: pluginDefinition.enabled !== false,
    registeredAt: new Date().toISOString(),
  };
  REGISTERED_PLUGINS.set(pluginId, plugin);
  return plugin;
}
