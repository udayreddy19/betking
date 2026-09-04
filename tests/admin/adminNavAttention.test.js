import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../lib/adminNavAttention.mjs'), 'utf8');

describe('adminNavAttention honesty mapping', () => {
  it('counts Pending Desk bets for betting:settlement-engine, not settlement_jobs', () => {
    expect(src).toMatch(/put\('betting',\s*'settlement-engine',\s*pendingDeclareBets/);
    expect(src).toMatch(/UPPER\(status\) IN \('PENDING', 'OPEN', 'ACCEPTED'\)/);
    // Must not put settlement_jobs count on the bet-declare panel
    expect(src).not.toMatch(/put\('betting',\s*'settlement-engine',\s*settlement/);
  });

  it('puts settlement job queue attention on Ops, not Bets', () => {
    expect(src).toMatch(/put\('operations',\s*'ops-queues',\s*settlementQueueJobs/);
    expect(src).toMatch(/FAILED.*DEAD_LETTER|DEAD_LETTER.*FAILED/s);
  });
});
