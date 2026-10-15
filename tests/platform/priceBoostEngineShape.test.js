import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('price boost engine module', () => {
  it('exports getDailyPriceBoosts', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../lib/priceBoostEngine.mjs'),
      'utf8',
    );
    expect(src).toMatch(/export async function getDailyPriceBoosts/);
  });
});
