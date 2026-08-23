#!/usr/bin/env node
/**
 * Record current git SHA for release/deploy traceability.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
}

const sha = git('git rev-parse HEAD');
const branch = git('git rev-parse --abbrev-ref HEAD');
const stamp = new Date().toISOString();

const payload = `${sha}\n${stamp}\n${branch}\n`;
fs.writeFileSync(path.join(root, '.release-sha'), payload);

const pending = {
  sha,
  branch,
  recordedAt: stamp,
  message: 'Rebuild Docker images from this SHA before production deploy.',
};
fs.writeFileSync(
  path.join(root, '.release-deployed-at.pending'),
  JSON.stringify(pending, null, 2),
);

console.log(JSON.stringify({ event: 'RELEASE_SHA_RECORDED', sha, branch, recordedAt: stamp }));
