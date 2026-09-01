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
      '/api/live-scores': { get: { summary: 'Retrieve aggregated live scores' } },
      '/api/bets/place': { post: { summary: 'Place a bet (authenticated)' } },
      '/api/v1/payments/create-order': { post: { summary: 'Create a deposit order (authenticated)' } },
    },
  };
}
