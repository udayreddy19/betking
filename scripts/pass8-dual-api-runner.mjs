#!/usr/bin/env node
/**
 * Pass 8 dual-API harness: spawn API:5001 + API:5002 (shared PG/Redis),
 * wait for readiness, run pass8-certification-matrix, then shut down.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function startApi(port) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      MULTI_INSTANCE: 'true',
      ADMIN_MFA_REQUIRED: '1',
      E2E_HARNESS: process.env.E2E_HARNESS || '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  child.stdout.on('data', (d) => {
    if (process.env.PASS8_VERBOSE) process.stdout.write(`[api${port}] ${d}`);
  });
  child.stderr.on('data', (d) => {
    if (process.env.PASS8_VERBOSE) process.stderr.write(`[api${port}:err] ${d}`);
  });
  return child;
}

async function waitReady(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`${url}/readiness`);
      if (res.status === 200) {
        const j = await res.json().catch(() => ({}));
        if (j.ready) return true;
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function stop(child) {
  if (!child?.pid) return;
  try { process.kill(child.pid, 'SIGTERM'); } catch { /* ignore */ }
}

const api1 = startApi(5001);
const api2 = startApi(5002);

const shutdown = () => {
  stop(api1);
  stop(api2);
};
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });

const ok1 = await waitReady('http://127.0.0.1:5001');
const ok2 = await waitReady('http://127.0.0.1:5002');
console.log(JSON.stringify({ event: 'PASS8_DUAL_API', api1Ready: ok1, api2Ready: ok2, pid1: api1.pid, pid2: api2.pid }));

if (!ok1 || !ok2) {
  shutdown();
  process.exit(2);
}

const matrix = spawn(
  process.execPath,
  ['scripts/pass8-certification-matrix.mjs', '--api1=http://127.0.0.1:5001', '--api2=http://127.0.0.1:5002'],
  { cwd: root, env: process.env, stdio: 'inherit' },
);

matrix.on('exit', (code) => {
  shutdown();
  setTimeout(() => process.exit(code || 0), 500);
});
