/**
 * Client-side Odds Formatter Utility (src/utils/oddsFormatter.js)
 * Supports: 'decimal' | 'american' | 'fractional' | 'hongKong' | 'malay' | 'indonesian'
 */

export function formatOddsValue(decimalOdds, format = 'decimal') {
  const dec = Number(decimalOdds);
  if (!dec || isNaN(dec) || dec <= 1.0) return '1.00';

  const fmt = (format || 'decimal').toLowerCase();

  if (fmt === 'decimal') {
    return dec.toFixed(2);
  }

  if (fmt === 'american') {
    if (dec >= 2.0) {
      return `+${Math.round((dec - 1) * 100)}`;
    }
    return `${Math.round(-100 / (dec - 1))}`;
  }

  if (fmt === 'fractional') {
    const hk = dec - 1;
    const commonFractions = [
      { dec: 1.5, frac: '1/2' },
      { dec: 1.67, frac: '4/6' },
      { dec: 1.75, frac: '3/4' },
      { dec: 1.8, frac: '4/5' },
      { dec: 1.91, frac: '10/11' },
      { dec: 2.0, frac: '1/1' },
      { dec: 2.2, frac: '6/5' },
      { dec: 2.25, frac: '5/4' },
      { dec: 2.5, frac: '6/4' },
      { dec: 2.75, frac: '7/4' },
      { dec: 3.0, frac: '2/1' },
      { dec: 3.5, frac: '5/2' },
      { dec: 4.0, frac: '3/1' },
      { dec: 5.0, frac: '4/1' },
    ];
    const matched = commonFractions.find(f => Math.abs(f.dec - dec) < 0.05);
    if (matched) return matched.frac;

    return `${Math.round(hk * 100)}/100`;
  }

  if (fmt === 'hongkong' || fmt === 'hong_kong') {
    return (dec - 1).toFixed(2);
  }

  if (fmt === 'malay') {
    const hk = dec - 1;
    if (hk <= 1.0) return hk.toFixed(2);
    return (-1 / hk).toFixed(2);
  }

  if (fmt === 'indonesian' || fmt === 'indo') {
    const hk = dec - 1;
    if (hk >= 1.0) return hk.toFixed(2);
    return (-1 / hk).toFixed(2);
  }

  return dec.toFixed(2);
}

export const ODDS_FORMAT_OPTIONS = [
  { id: 'decimal', label: 'Decimal (2.50)' },
  { id: 'american', label: 'American (+150)' },
  { id: 'fractional', label: 'Fractional (6/4)' },
  { id: 'hongKong', label: 'Hong Kong (1.50)' },
  { id: 'malay', label: 'Malay (-0.67)' },
  { id: 'indonesian', label: 'Indonesian (1.50)' },
];
