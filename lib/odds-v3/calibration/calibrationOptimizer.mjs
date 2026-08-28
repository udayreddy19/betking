/**
 * OddsEngineV3 — Calibration Optimizer
 * 
 * Evaluates candidate calibration methods (Platt Scaling, Beta Calibration, Isotonic Regression)
 * against out-of-sample test splits. Strictly enforces improvement gates before candidate recommendation.
 */

import { calculateBrierScore, calculateLogLoss, calculateCalibrationMetrics } from '../validation/modelScorecard.mjs';

const MIN_SAMPLE_SIZE = 500;
const SIGNIFICANT_SAMPLE_SIZE = 1000;
const EPSILON = 1e-6;

/**
 * Fits Platt Scaling parameters (logistic regression on log-odds).
 * p_cal = 1 / (1 + exp(A * logit(p) + B))
 */
export function fitPlattScaling(trainData) {
  let A = -1.0;
  let B = 0.0;
  const lr = 0.01;
  const epochs = 100;

  for (let ep = 0; ep < epochs; ep++) {
    let gradA = 0;
    let gradB = 0;
    for (const d of trainData) {
      const p = Math.min(Math.max(d.predictionProbability, EPSILON), 1 - EPSILON);
      const logit = Math.log(p / (1 - p));
      const y = d.actualOutcome ? 1 : 0;
      const pCal = 1 / (1 + Math.exp(A * logit + B));
      const err = pCal - y;
      gradA += err * logit;
      gradB += err;
    }
    A -= (lr * gradA) / trainData.length;
    B -= (lr * gradB) / trainData.length;
  }

  return {
    method: 'PLATT_SCALING',
    params: { A: Number(A.toFixed(4)), B: Number(B.toFixed(4)) },
    transform: (p) => {
      const clamped = Math.min(Math.max(p, EPSILON), 1 - EPSILON);
      const logit = Math.log(clamped / (1 - clamped));
      return Number((1 / (1 + Math.exp(A * logit + B))).toFixed(4));
    },
  };
}

/**
 * Fits Isotonic Regression (Pool Adjacent Violators Algorithm).
 */
export function fitIsotonicRegression(trainData) {
  const sorted = [...trainData].sort((a, b) => a.predictionProbability - b.predictionProbability);
  const blocks = sorted.map((d) => ({
    weight: 1,
    value: d.actualOutcome ? 1 : 0,
    prob: d.predictionProbability,
  }));

  // Pool adjacent violators
  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].value > blocks[i + 1].value) {
      const combinedWeight = blocks[i].weight + blocks[i + 1].weight;
      const combinedValue = (blocks[i].value * blocks[i].weight + blocks[i + 1].value * blocks[i + 1].weight) / combinedWeight;
      blocks[i] = {
        weight: combinedWeight,
        value: combinedValue,
        prob: (blocks[i].prob + blocks[i + 1].prob) / 2,
      };
      blocks.splice(i + 1, 1);
      if (i > 0) i--;
    } else {
      i++;
    }
  }

  return {
    method: 'ISOTONIC_REGRESSION',
    thresholds: blocks.map((b) => ({ prob: Number(b.prob.toFixed(4)), value: Number(b.value.toFixed(4)) })),
    transform: (p) => {
      if (!blocks.length) return p;
      if (p <= blocks[0].prob) return blocks[0].value;
      if (p >= blocks[blocks.length - 1].prob) return blocks[blocks.length - 1].value;
      for (let j = 0; j < blocks.length - 1; j++) {
        if (p >= blocks[j].prob && p <= blocks[j + 1].prob) {
          const ratio = (p - blocks[j].prob) / (blocks[j + 1].prob - blocks[j].prob || 1);
          return Number((blocks[j].value + ratio * (blocks[j + 1].value - blocks[j].value)).toFixed(4));
        }
      }
      return p;
    },
  };
}

/**
 * Runs full calibration optimization comparing Raw vs Platt vs Isotonic out-of-sample.
 */
export function optimizeCalibration(dataset) {
  const settled = (dataset || []).filter((d) => d.actualOutcome !== null && d.actualOutcome !== undefined);
  if (settled.length < MIN_SAMPLE_SIZE) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleSize: settled.length,
      minRequired: MIN_SAMPLE_SIZE,
      recommendedCalibrator: 'CURRENT_RAW',
      decision: 'KEEP_CURRENT_MODEL',
      reason: `Insufficient sample size (${settled.length} < ${MIN_SAMPLE_SIZE}) for out-of-sample calibration fitting.`,
      candidates: {},
    };
  }

  // Split into 60% Train, 20% Val, 20% Test chronologically
  const sorted = [...settled].sort((a, b) => a.timestamp - b.timestamp);
  const n = sorted.length;
  const trainEnd = Math.floor(n * 0.6);
  const valEnd = Math.floor(n * 0.8);

  const trainSet = sorted.slice(0, trainEnd);
  const valSet = sorted.slice(trainEnd, valEnd);
  const testSet = sorted.slice(valEnd);

  // 1. Raw Baseline Performance on Test Set
  const rawBrier = calculateBrierScore(testSet);
  const rawLogLoss = calculateLogLoss(testSet);
  const rawCal = calculateCalibrationMetrics(testSet);

  // 2. Platt Scaling on Test Set
  const platt = fitPlattScaling(trainSet);
  const plattTestSet = testSet.map((d) => ({ ...d, predictionProbability: platt.transform(d.predictionProbability) }));
  const plattBrier = calculateBrierScore(plattTestSet);
  const plattLogLoss = calculateLogLoss(plattTestSet);
  const plattCal = calculateCalibrationMetrics(plattTestSet);

  // 3. Isotonic Regression on Test Set
  const isotonic = fitIsotonicRegression(trainSet);
  const isoTestSet = testSet.map((d) => ({ ...d, predictionProbability: isotonic.transform(d.predictionProbability) }));
  const isoBrier = calculateBrierScore(isoTestSet);
  const isoLogLoss = calculateLogLoss(isoTestSet);
  const isoCal = calculateCalibrationMetrics(isoTestSet);

  const candidates = {
    CURRENT_RAW: {
      brierScore: rawBrier,
      logLoss: rawLogLoss,
      ece: rawCal.ece,
      mce: rawCal.mce,
    },
    PLATT_SCALING: {
      brierScore: plattBrier,
      logLoss: plattLogLoss,
      ece: plattCal.ece,
      mce: plattCal.mce,
      params: platt.params,
    },
    ISOTONIC_REGRESSION: {
      brierScore: isoBrier,
      logLoss: isoLogLoss,
      ece: isoCal.ece,
      mce: isoCal.mce,
      thresholdCount: isotonic.thresholds.length,
    },
  };

  // Evaluation Gates:
  // Must improve Brier AND keep LogLoss <= rawLogLoss * 1.02 AND improve ECE
  let recommendedCalibrator = 'CURRENT_RAW';
  let decision = 'KEEP_CURRENT_MODEL';
  let reason = 'Current model remains optimal or improvements fail statistical safety gates.';

  if (
    plattBrier < rawBrier &&
    plattLogLoss <= rawLogLoss * 1.01 &&
    plattCal.ece < rawCal.ece &&
    settled.length >= SIGNIFICANT_SAMPLE_SIZE
  ) {
    recommendedCalibrator = 'PLATT_SCALING';
    decision = 'PROPOSE_SHADOW_EXPERIMENT';
    reason = `Platt Scaling demonstrates out-of-sample Brier improvement (${rawBrier} -> ${plattBrier}) and ECE reduction (${rawCal.ece} -> ${plattCal.ece}).`;
  } else if (
    isoBrier < rawBrier &&
    isoLogLoss <= rawLogLoss * 1.01 &&
    isoCal.ece < rawCal.ece &&
    settled.length >= SIGNIFICANT_SAMPLE_SIZE
  ) {
    recommendedCalibrator = 'ISOTONIC_REGRESSION';
    decision = 'PROPOSE_SHADOW_EXPERIMENT';
    reason = `Isotonic regression demonstrates out-of-sample Brier improvement (${rawBrier} -> ${isoBrier}) and ECE reduction (${rawCal.ece} -> ${isoCal.ece}).`;
  }

  return {
    status: 'OPTIMIZED',
    totalSamples: n,
    testSampleCount: testSet.length,
    recommendedCalibrator,
    decision,
    reason,
    candidates,
    generatedAt: new Date().toISOString(),
  };
}
