/**
 * Enterprise SDK Generator — OddsYra Enterprise Platform (lib/sdkGenerator.mjs)
 * Generates OpenAPI specifications, code snippets, and client examples for JavaScript, Python, PHP, Java, and C#.
 */

export function generateOpenApiSpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'OddsYra Enterprise Sportsbook API',
      version: '2.0.0-ENTERPRISE',
      description: 'Production-ready REST and WebSocket APIs for sports betting, odds generation, and market risk management.',
    },
    paths: {
      '/api/odds': { get: { summary: 'Retrieve dynamic odds for a match' } },
      '/api/markets': { get: { summary: 'Retrieve active markets for a match' } },
      '/api/exposure': { get: { summary: 'Retrieve system risk exposure metrics' } },
    },
  };
}
