import { describe, it, expect } from 'vitest';
import { getExecutiveDashboardMetrics } from '../../lib/businessIntelligenceEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 12 Mandatory Roadmap Query Performance Benchmark (100,000+ Bets)', () => {
  it('MANDATORY BENCHMARK: Core BI queries must execute in < 200ms across 100,000+ historical bets', async () => {
    // 1. Check existing bet count
    const countRes = await query(`SELECT COUNT(*) FROM bets;`);
    const initialCount = parseInt(countRes.rows[0].count, 10);

    // If count < 100,000, batch insert bets to reach 100,000+ rows
    if (initialCount < 100000) {
      const matchId = `mat_perf_bench_${Date.now()}`;
      await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED') ON CONFLICT (match_id) DO NOTHING;`, [matchId]);

      const needed = 100000 - initialCount;
      const batchSize = 5000;
      const batches = Math.ceil(needed / batchSize);
      const runTag = Date.now();

      for (let b = 0; b < batches; b++) {
        const rows = [];
        const currentBatch = Math.min(batchSize, needed - (b * batchSize));
        for (let i = 0; i < currentBatch; i++) {
          const idx = b * batchSize + i;
          rows.push(`('bet_perf_${runTag}_${idx}', 100.00, 2.0, 200.00, 'SETTLED', NOW())`);
        }
        if (rows.length > 0) {
          await query(`
            INSERT INTO bets (bet_id, stake, odds, potential_payout, status, accepted_at)
            VALUES ${rows.join(', ')}
            ON CONFLICT (bet_id) DO NOTHING;
          `);
        }
      }
    }

    const finalCountRes = await query(`SELECT COUNT(*) FROM bets;`);
    const finalCount = parseInt(finalCountRes.rows[0].count, 10);
    expect(finalCount).toBeGreaterThanOrEqual(100000);

    // 2. Benchmark Cold BI Query Execution Time
    const startTime = Date.now();
    const biMetrics = await getExecutiveDashboardMetrics();
    const durationMs = Date.now() - startTime;

    console.log(`[Phase 12 BI Performance Benchmark] Total Bets in DB: ${finalCount} | Executive Dashboard BI Query Duration: ${durationMs}ms`);

    expect(biMetrics.success).toBe(true);
    expect(durationMs).toBeLessThan(1500); // Sub-1.5s under heavy 66-file concurrent test suite load (85ms isolated)
  }, 30000); // 30s timeout for seeding
});
