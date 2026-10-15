#!/usr/bin/env node
/**
 * Nightly V4 calibration + shadow metrics report.
 * Writes data/calibration/nightly_report.json — never fabricates observations.
 *
 * Usage: node scripts/v4CalibrationNightly.mjs
 * Cron:  15 3 * * * cd /opt/oddsyra && docker compose -f docker-compose.prod.yml exec -T backend node scripts/v4CalibrationNightly.mjs
 */

import fs from 'fs';
import path from 'path';
import { evaluateLiveCalibration, getCalibrationValidationStatus } from '../lib/odds-v5/calibration/calibrationBridge.mjs';
import { getShadowMetrics } from '../lib/odds-v5/engineDispatch.mjs';
import { defaultShadowMetricsStore } from '../lib/odds-v5/shadow/ShadowMetricsStore.mjs';
import { V4_ENGINE_VERSION } from '../lib/odds-v5/OddsEngineV4.mjs';

const outDir = process.env.CALIBRATION_DATA_DIR
  || path.resolve(process.cwd(), 'data/calibration');

function writeReport(report) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'nightly_report.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf-8');
  return file;
}

const cricket = evaluateLiveCalibration({ sport: 'cricket' });
const allGate = getCalibrationValidationStatus();
const shadowLive = getShadowMetrics();
const shadowDurable = defaultShadowMetricsStore.snapshot();

const report = {
  generatedAt: new Date().toISOString(),
  engineVersion: V4_ENGINE_VERSION,
  cricketCalibration: cricket,
  gate: allGate,
  shadow: {
    inProcess: {
      samples: shadowLive.samples,
      sameFavRate: shadowLive.sameFavRate,
    },
    durable: shadowDurable.cricket,
  },
  goals: {
    sameFavTarget: 0.9,
    medianShortDeltaTarget: 0.25,
    calibrationNTarget: 1000,
  },
};

const file = writeReport(report);
console.log(JSON.stringify({
  ok: true,
  file,
  sampleSize: cricket.sampleSize ?? cricket.gate?.sampleSize ?? 0,
  status: cricket.status,
  sameFavRate: shadowDurable?.cricket?.sameFavRate ?? shadowLive.sameFavRate,
}, null, 2));
