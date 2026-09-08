/**
 * Full PostgreSQL dump backups — manual (admin) + scheduled (worker).
 * Writes files under BACKUP_DIR and records rows in backups_log.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { query } from '../db/pg.js';
import { redis } from '../db/redis.js';
import { getConfig, setConfig } from './configEngine.mjs';

export const BACKUP_SCHEDULE_KEY = 'ops.backup_schedule';
const LOCK_KEY = 'ops:backup:run_lock';
const LOCK_TTL_SEC = 30 * 60;

export const DEFAULT_BACKUP_SCHEDULE = Object.freeze({
  enabled: false,
  intervalHours: 24,
  retainCount: 7,
  nextRunAt: null,
  lastRunAt: null,
  lastStatus: null,
  lastBackupId: null,
  updatedBy: null,
  updatedAt: null,
});

export function resolveBackupDir() {
  const fromEnv = String(process.env.BACKUP_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), 'data', 'backups');
}

export function resolvePgConnection(env = process.env) {
  if (env.DATABASE_URL) {
    const u = new URL(env.DATABASE_URL);
    return {
      host: u.hostname || '127.0.0.1',
      port: u.port || '5432',
      user: decodeURIComponent(u.username || 'oddsyra_app'),
      password: decodeURIComponent(u.password || ''),
      database: decodeURIComponent((u.pathname || '/oddsyra').replace(/^\//, '').split('?')[0] || 'oddsyra'),
    };
  }
  return {
    host: env.POSTGRES_HOST || '127.0.0.1',
    port: env.POSTGRES_PORT || '5432',
    user: env.POSTGRES_USER || 'oddsyra_app',
    password: env.POSTGRES_PASSWORD || '',
    database: env.POSTGRES_DB || 'oddsyra',
  };
}

function normalizeSchedule(raw) {
  const base = { ...DEFAULT_BACKUP_SCHEDULE, ...(raw && typeof raw === 'object' ? raw : {}) };
  const intervalHours = Math.min(168, Math.max(1, Number(base.intervalHours) || 24));
  const retainCount = Math.min(90, Math.max(1, Number(base.retainCount) || 7));
  return {
    ...base,
    enabled: Boolean(base.enabled),
    intervalHours,
    retainCount,
  };
}

export async function getBackupSchedule() {
  try {
    const res = await getConfig(BACKUP_SCHEDULE_KEY);
    if (res.success && res.value) return normalizeSchedule(res.value);
  } catch {
    // table missing / cold boot
  }
  return { ...DEFAULT_BACKUP_SCHEDULE };
}

export async function updateBackupSchedule(patch = {}, { actor = 'admin' } = {}) {
  const current = await getBackupSchedule();
  const next = normalizeSchedule({
    ...current,
    ...patch,
    updatedBy: actor,
    updatedAt: new Date().toISOString(),
  });

  const enabling = next.enabled && !current.enabled;
  const intervalChanged = Number(next.intervalHours) !== Number(current.intervalHours);
  if (enabling || (next.enabled && intervalChanged && !patch.nextRunAt)) {
    next.nextRunAt = new Date().toISOString();
  }
  if (!next.enabled) {
    next.nextRunAt = null;
  } else if (patch.nextRunAt) {
    next.nextRunAt = new Date(patch.nextRunAt).toISOString();
  }

  await setConfig({
    configKey: BACKUP_SCHEDULE_KEY,
    configValue: next,
    category: 'GENERAL',
    description: 'Automated full SQL dump schedule for Ops Backups / DR',
    changedBy: actor,
    reason: 'Admin backup schedule update',
  });

  return next;
}

async function acquireBackupLock() {
  try {
    const ok = await redis.set(LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_SEC, 'NX');
    return ok === 'OK' || ok === true;
  } catch {
    return true; // fail-open on redis outage so manual dump still works
  }
}

async function releaseBackupLock() {
  try {
    await redis.del(LOCK_KEY);
  } catch {
    // ignore
  }
}

function runPgDumpToFile(conn, filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-h', conn.host,
      '-p', String(conn.port),
      '-U', conn.user,
      '-d', conn.database,
      '--no-owner',
      '--no-acl',
      '-F', 'p',
      '-f', filePath,
    ];
    const child = spawn('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: conn.password || '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `pg_dump exited with code ${code}`));
    });
  });
}

async function insertBackupLog(row) {
  const id = row.id || `bkp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await query(
      `INSERT INTO backups_log
         (id, backup_type, status, size_bytes, duration_ms, trigger_source, actor, file_name, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        row.backupType || 'FULL_DUMP',
        row.status || 'SUCCESS',
        row.sizeBytes || 0,
        row.durationMs || 0,
        row.triggerSource || null,
        row.actor || null,
        row.fileName || null,
        row.errorMessage || null,
      ],
    );
  } catch (err) {
    // Pre-migration fallback
    if (/trigger_source|column/i.test(String(err.message))) {
      await query(
        `INSERT INTO backups_log (id, backup_type, status, size_bytes, duration_ms)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, row.backupType || 'FULL_DUMP', row.status || 'SUCCESS', row.sizeBytes || 0, row.durationMs || 0],
      );
    } else {
      throw err;
    }
  }
  return id;
}

export function pruneBackupFiles(dir, retainCount = 7) {
  if (!fs.existsSync(dir)) return { deleted: 0 };
  const files = fs.readdirSync(dir)
    .filter((f) => /^oddsyra_.*\.(sql|dump)$/i.test(f))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { name: f, full, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  let deleted = 0;
  for (const file of files.slice(Math.max(1, retainCount))) {
    try {
      fs.unlinkSync(file.full);
      deleted += 1;
    } catch {
      // ignore
    }
  }
  return { deleted, kept: Math.min(files.length, retainCount) };
}

/**
 * Run a full SQL dump of the primary database.
 * @param {{ trigger?: 'MANUAL'|'SCHEDULED'|'CLI', actor?: string }} [opts]
 */
export async function runFullDatabaseBackup(opts = {}) {
  const trigger = String(opts.trigger || 'MANUAL').toUpperCase();
  const actor = opts.actor || 'system';
  const t0 = Date.now();
  const dir = resolveBackupDir();
  fs.mkdirSync(dir, { recursive: true });

  const locked = await acquireBackupLock();
  if (!locked) {
    const err = new Error('A backup is already running. Try again shortly.');
    err.status = 409;
    err.code = 'BACKUP_IN_PROGRESS';
    throw err;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `oddsyra_full_${stamp}.sql`;
  const filePath = path.join(dir, fileName);
  let backupId = null;

  try {
    const conn = resolvePgConnection();
    await runPgDumpToFile(conn, filePath);
    const sizeBytes = fs.statSync(filePath).size;
    if (!sizeBytes) throw new Error('Backup file is empty');

    const durationMs = Date.now() - t0;
    backupId = await insertBackupLog({
      backupType: 'FULL_DUMP',
      status: 'SUCCESS',
      sizeBytes,
      durationMs,
      triggerSource: trigger,
      actor,
      fileName,
    });

    const schedule = await getBackupSchedule();
    const pruned = pruneBackupFiles(dir, schedule.retainCount);
    const nextRunAt = schedule.enabled
      ? new Date(Date.now() + schedule.intervalHours * 3600_000).toISOString()
      : null;

    try {
      await updateBackupSchedule({
        lastRunAt: new Date().toISOString(),
        lastStatus: 'SUCCESS',
        lastBackupId: backupId,
        nextRunAt,
      }, { actor: trigger === 'SCHEDULED' ? 'scheduler' : actor });
    } catch (schedErr) {
      console.error('[Backup] schedule state update failed:', schedErr.message);
    }

    return {
      success: true,
      backupId,
      fileName,
      sizeBytes,
      durationMs,
      trigger,
      pruned,
    };
  } catch (err) {
    const durationMs = Date.now() - t0;
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
    try {
      backupId = await insertBackupLog({
        backupType: 'FULL_DUMP',
        status: 'FAILED',
        sizeBytes: 0,
        durationMs,
        triggerSource: trigger,
        actor,
        fileName,
        errorMessage: String(err.message || err).slice(0, 2000),
      });
      const schedule = await getBackupSchedule();
      await updateBackupSchedule({
        lastRunAt: new Date().toISOString(),
        lastStatus: 'FAILED',
        lastBackupId: backupId,
        nextRunAt: schedule.enabled
          ? new Date(Date.now() + Math.min(schedule.intervalHours, 6) * 3600_000).toISOString()
          : null,
      }, { actor: trigger === 'SCHEDULED' ? 'scheduler' : actor });
    } catch {
      // logging failure should not mask original
    }
    const wrapped = new Error(err.message || 'Backup failed');
    wrapped.status = 500;
    wrapped.code = 'BACKUP_FAILED';
    wrapped.backupId = backupId;
    throw wrapped;
  } finally {
    await releaseBackupLock();
  }
}

/**
 * Worker tick — run dump when schedule is enabled and due.
 */
export async function tickScheduledBackup() {
  const schedule = await getBackupSchedule();
  if (!schedule.enabled) return { ran: false, reason: 'disabled' };
  if (!schedule.nextRunAt) {
    await updateBackupSchedule({
      ...schedule,
      nextRunAt: new Date().toISOString(),
    }, { actor: 'scheduler' });
    return { ran: false, reason: 'next_run_seeded' };
  }
  if (Date.now() < new Date(schedule.nextRunAt).getTime()) {
    return { ran: false, reason: 'not_due', nextRunAt: schedule.nextRunAt };
  }
  const result = await runFullDatabaseBackup({ trigger: 'SCHEDULED', actor: 'scheduler' });
  return { ran: true, ...result };
}

export async function listBackupLog({ limit = 50 } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  try {
    const res = await query(
      `SELECT id, backup_type, status, size_bytes, duration_ms, created_at,
              trigger_source, actor, file_name, error_message
       FROM backups_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [lim],
    );
    return res.rows;
  } catch (err) {
    if (/trigger_source|column/i.test(String(err.message))) {
      const res = await query(
        `SELECT id, backup_type, status, size_bytes, duration_ms, created_at
         FROM backups_log
         ORDER BY created_at DESC
         LIMIT $1`,
        [lim],
      );
      return res.rows;
    }
    throw err;
  }
}
