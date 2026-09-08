import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  pruneBackupFiles,
  resolvePgConnection,
  DEFAULT_BACKUP_SCHEDULE,
} from '../../lib/backupEngine.mjs';

describe('backupEngine helpers', () => {
  it('parses DATABASE_URL into pg connection fields', () => {
    const conn = resolvePgConnection({
      DATABASE_URL: 'postgresql://app%5Fuser:p%40ss@db.internal:5433/oddsyra_prod',
    });
    expect(conn).toEqual({
      host: 'db.internal',
      port: '5433',
      user: 'app_user',
      password: 'p@ss',
      database: 'oddsyra_prod',
    });
  });

  it('prunes older dump files beyond retainCount', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oy-bkp-'));
    const names = [];
    for (let i = 0; i < 5; i += 1) {
      const name = `oddsyra_full_2026-01-0${i + 1}.sql`;
      const full = path.join(dir, name);
      fs.writeFileSync(full, `dump-${i}`);
      const past = Date.now() - (5 - i) * 60_000;
      fs.utimesSync(full, new Date(past), new Date(past));
      names.push(name);
    }
    const res = pruneBackupFiles(dir, 2);
    expect(res.deleted).toBe(3);
    const left = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    expect(left).toEqual(['oddsyra_full_2026-01-04.sql', 'oddsyra_full_2026-01-05.sql']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('exposes a disabled default schedule', () => {
    expect(DEFAULT_BACKUP_SCHEDULE.enabled).toBe(false);
    expect(DEFAULT_BACKUP_SCHEDULE.intervalHours).toBe(24);
  });
});
