export default async function handler(req, res) {
  return res.status(200).json({
    success: true,
    marketplaceProducts: [
      { id: 'prod_odds_feed', name: 'Live Sports Odds Feed API', tier: 'ENTERPRISE', priceMonthly: 499 },
      { id: 'prod_prob_engine', name: 'Bivariate Poisson Probability API', tier: 'PRO', priceMonthly: 299 },
      { id: 'prod_match_stats', name: 'Comprehensive Match Statistics API', tier: 'BASIC', priceMonthly: 99 },
    ],
  });
}
