/**
 * Guards the settlement_jobs markJob UPDATE against PG parameter type deduction bugs.
 * Reproduces the prod failure: reusing $1 as both status and CASE predicate.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const queuePath = path.resolve(__dirname, '../../lib/settlement/settlementQueue.mjs');

describe('settlementQueue markJob SQL typing', () => {
  it('does not reuse $1 for both status assignment and CASE IN-list', () => {
    const src = fs.readFileSync(queuePath, 'utf8');
    const markIdx = src.indexOf('async function markJob');
    expect(markIdx).toBeGreaterThan(-1);
    const slice = src.slice(markIdx, markIdx + 2500);

    // Forbidden pattern that caused: inconsistent types deduced for parameter $1
    expect(slice).not.toMatch(/status\s*=\s*\$1[\s\S]{0,200}WHEN\s+\$1\b/);
    expect(slice).not.toMatch(/WHEN\s+\$1\s+IN\s*\(/);
    expect(slice).not.toMatch(/WHEN\s+\$1::text\s+IN\s*\(/);

    // Required safe pattern: separate boolean bind for terminal completed_at
    expect(slice).toMatch(/isTerminal/);
    expect(slice).toMatch(/\$5::boolean/);
  });
});
