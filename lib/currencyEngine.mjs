/**
 * Enterprise Multi-Currency Engine — BetKing Enterprise Platform (lib/currencyEngine.mjs)
 * Manages exchange rates, multi-currency wallet conversions, and multi-currency odds formatting.
 */

const EXCHANGE_RATES = new Map([
  ['INR', 1.0],
  ['USD', 0.012],
  ['EUR', 0.011],
  ['GBP', 0.0094],
  ['AED', 0.044],
]);

export function convertCurrency(amount, fromCurrency = 'INR', toCurrency = 'USD') {
  const fromRate = EXCHANGE_RATES.get(fromCurrency) || 1.0;
  const toRate = EXCHANGE_RATES.get(toCurrency) || 1.0;
  const inrValue = amount / fromRate;
  return Number((inrValue * toRate).toFixed(2));
}
