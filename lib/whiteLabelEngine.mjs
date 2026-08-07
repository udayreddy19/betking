/**
 * Enterprise White Label Engine — BetKing Enterprise Platform (lib/whiteLabelEngine.mjs)
 * Manages multiple partner brands, custom domain routing, brand assets, logos, and localized configs.
 */

const WHITE_LABEL_BRANDS = new Map([
  ['betking', { brandId: 'betking', name: 'BetKing', domain: 'betking.com', theme: 'dark' }],
  ['10cric', { brandId: '10cric', name: '10CRIC', domain: '10cric.com', theme: 'light' }],
]);

export function getWhiteLabelConfig(brandId = 'betking') {
  return WHITE_LABEL_BRANDS.get(brandId) || WHITE_LABEL_BRANDS.get('betking');
}
