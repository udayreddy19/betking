import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('production scorecard module', () => {
  it('exports getProductionScorecard and documents deduction codes', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../lib/productionScorecard.mjs'),
      'utf8',
    );
    expect(src).toMatch(/export async function getProductionScorecard/);
    expect(src).toMatch(/SPORTSBOOK_OFF/);
    expect(src).toMatch(/OPEN_RECON/);
    expect(src).toMatch(/MFA_OFF/);
    expect(src).toMatch(/NO_ALERT_WEBHOOK/);
  });
});
