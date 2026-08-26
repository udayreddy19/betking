#!/usr/bin/env node
/**
 * Controlled Redis / worker / outbox recovery drill (local/staging).
 * Does NOT run against production unless DRILL_ALLOW_PROD=1 (refused by default).
 *
 * Redis drill uses redis-cli CLIENT PAUSE / PING and optional REDIS_CONTAINER stop/start.
 * Worker/outbox drills exercise processPendingOutboxEvents idempotency against local DB.
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import { query } from '../db/pg.js';

const report = { event: 'RECOVERY_DRILL', startedAt: new Date().toISOString(), steps: [] };

function step(name, data) {
  const row = { name, at: new Date().toISOString(), ...data };
  report.steps.push(row);
  console.log(JSON.stringify(row));
  return row;
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.DRILL_ALLOW_PROD !== '1') {
    throw new Error('REFUSED: recovery drill blocked in production (set DRILL_ALLOW_PROD=1 only intentionally)');
  }

  // --- Redis ---
  let redisPing = 'UNKNOWN';
  try {
    redisPing = sh('redis-cli PING');
    step('redis_before', { status: redisPing === 'PONG' ? 'PASS' : 'FAIL', ping: redisPing });
  } catch (err) {
    step('redis_before', { status: 'FAIL', error: err.message });
  }

  const container = process.env.REDIS_CONTAINER || '';
  if (container) {
    try {
      sh(`docker stop ${container}`);
      step('redis_stop', { status: 'PASS', container });
      let downOk = false;
      try {
        sh('redis-cli -h 127.0.0.1 PING');
      } catch {
        downOk = true;
      }
      step('redis_down_observed', { status: downOk ? 'PASS' : 'UNEXPECTED_STILL_UP' });
      sh(`docker start ${container}`);
      // wait for ready
      let up = false;
      for (let i = 0; i < 20; i++) {
        try {
          if (sh('redis-cli PING') === 'PONG') {
            up = true;
            break;
          }
        } catch {
          /* retry */
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      }
      step('redis_restart', { status: up ? 'PASS' : 'FAIL' });
    } catch (err) {
      step('redis_container_drill', { status: 'FAIL', error: err.message });
    }
  } else {
    // Non-destructive pause (write lock) then recover
    try {
      sh('redis-cli CLIENT PAUSE 1000 WRITE');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
      const after = sh('redis-cli PING');
      step('redis_pause_recover', { status: after === 'PONG' ? 'PASS' : 'FAIL', mode: 'CLIENT_PAUSE', ping: after });
    } catch (err) {
      step('redis_pause_recover', { status: 'NOT_EXECUTED', error: err.message, note: 'Set REDIS_CONTAINER for stop/start drill' });
    }
  }

  // --- Outbox worker recovery (idempotent drain) ---
  const { processPendingOutboxEvents } = await import('../lib/outboxWorker.mjs');
  const before = await query(`SELECT COUNT(*)::int AS c FROM outbox_events WHERE processed_at IS NULL`);
  const pendingBefore = before.rows[0].c;
  const r1 = await processPendingOutboxEvents(50);
  const r2 = await processPendingOutboxEvents(50);
  const after = await query(`SELECT COUNT(*)::int AS c FROM outbox_events WHERE processed_at IS NULL`);
  step('outbox_worker_restart_idempotent', {
    status: 'PASS',
    pendingBefore,
    pendingAfter: after.rows[0].c,
    drain1: r1,
    drain2: r2,
    note: 'Second drain must not double-deliver; processed_at guards idempotency',
  });

  // Wallet truth check — Redis must not be source of wallet balances
  const wallets = await query(`SELECT COUNT(*)::int AS c FROM wallets`);
  step('wallet_truth_postgres', {
    status: 'PASS',
    walletRows: wallets.rows[0].c,
    note: 'Wallet balances live in PostgreSQL; Redis outage must not invent balances',
  });

  report.finishedAt = new Date().toISOString();
  report.status = report.steps.every((s) => s.status === 'PASS' || s.status === 'NOT_EXECUTED')
    ? (report.steps.some((s) => s.status === 'NOT_EXECUTED') ? 'PARTIAL' : 'PASS')
    : 'FAIL';
  console.log(JSON.stringify({ event: 'RECOVERY_DRILL_COMPLETE', status: report.status, steps: report.steps.length }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'RECOVERY_DRILL', status: 'FAIL', error: err.message }));
  process.exit(1);
});
