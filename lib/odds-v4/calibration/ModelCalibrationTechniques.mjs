/**
 * ModelCalibrationTechniques.mjs
 *
 * Parametric and non-parametric calibration methods for probability forecasts:
 *   1. Platt Scaling (Logistic calibration on log-odds)
 *   2. Isotonic Regression (PAVA - Pool Adjacent Violators Algorithm)
 *   3. Beta Calibration (Kull et al., 2017)
 *
 * Selection Principle (Phase 4G):
 *   - Fit models strictly on Training / Calibration set.
 *   - Select best method on Validation set.
 *   - If no method improves Brier Score and Log Loss over the raw model,
 *     the system retains the RAW model to avoid overfitting.
 */

import { calculateBrierScore, calculateLogLoss } from './V4CalibrationEngine.mjs';

function clipProb(p, eps = 1e-6) {
  return Math.min(Math.max(Number(p), eps), 1 - eps);
}

function logit(p) {
  const cp = clipProb(p);
  return Math.log(cp / (1 - cp));
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Fits Platt Scaling parameters (A, B) via regularized logistic regression on logits.
 */
export function fitPlattScaling(trainingObservations = []) {
  if (trainingObservations.length < 20) {
    return { type: 'PLATT', a: 1.0, b: 0.0, ready: false };
  }

  // Target values with Laplace smoothing
  const n = trainingObservations.length;
  const nPos = trainingObservations.filter((o) => o.outcome === 'WON').length;
  const nNeg = n - nPos;
  const tPos = (nPos + 1) / (nPos + 2);
  const tNeg = 1 / (nNeg + 2);

  // Gradient descent for logistic regression: P = 1 / (1 + exp(-(A*logit + B)))
  let a = 1.0;
  let b = 0.0;
  const lr = 0.05;
  const epochs = 100;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0;
    let gradB = 0;

    for (const obs of trainingObservations) {
      const p = obs.fairProbability ?? obs.rawProbability;
      const x = logit(p);
      const target = obs.outcome === 'WON' ? tPos : tNeg;
      const pred = sigmoid(a * x + b);
      const diff = pred - target;

      gradA += diff * x;
      gradB += diff;
    }

    a -= (lr * gradA) / n;
    b -= (lr * gradB) / n;
  }

  return {
    type: 'PLATT',
    a: Number(a.toFixed(4)),
    b: Number(b.toFixed(4)),
    ready: true,
    calibrate: (p) => Number(sigmoid(a * logit(p) + b).toFixed(4)),
  };
}

/**
 * Fits Isotonic Regression via PAVA (Pool Adjacent Violators Algorithm).
 */
export function fitIsotonicRegression(trainingObservations = []) {
  if (trainingObservations.length < 20) {
    return { type: 'ISOTONIC', ready: false };
  }

  // Sort by raw prediction
  const pairs = trainingObservations
    .map((o) => ({
      p: Number(o.fairProbability ?? o.rawProbability),
      y: o.outcome === 'WON' ? 1 : 0,
      weight: 1,
    }))
    .sort((a, b) => a.p - b.p);

  // PAVA algorithm
  const blocks = pairs.map((pair) => ({
    weight: pair.weight,
    sum: pair.y * pair.weight,
    pMin: pair.p,
    pMax: pair.p,
    val: pair.y,
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].val > blocks[i + 1].val) {
      // Merge blocks
      const prev = blocks[i];
      const next = blocks[i + 1];
      const combinedWeight = prev.weight + next.weight;
      const combinedSum = prev.sum + next.sum;
      const merged = {
        weight: combinedWeight,
        sum: combinedSum,
        pMin: prev.pMin,
        pMax: next.pMax,
        val: combinedSum / combinedWeight,
      };
      blocks.splice(i, 2, merged);
      if (i > 0) i--; // Check previous block
    } else {
      i++;
    }
  }

  const knots = blocks.map((b) => ({
    x: (b.pMin + b.pMax) / 2,
    y: Number(b.val.toFixed(4)),
  }));

  function calibrate(p) {
    if (p <= knots[0].x) return knots[0].y;
    if (p >= knots[knots.length - 1].x) return knots[knots.length - 1].y;

    for (let k = 0; k < knots.length - 1; k++) {
      if (p >= knots[k].x && p <= knots[k + 1].x) {
        const t = (p - knots[k].x) / (knots[k + 1].x - knots[k].x || 1e-6);
        return Number((knots[k].y + t * (knots[k + 1].y - knots[k].y)).toFixed(4));
      }
    }
    return p;
  }

  return {
    type: 'ISOTONIC',
    ready: true,
    knotsCount: knots.length,
    calibrate,
  };
}

/**
 * Fits Beta Calibration parameters (a, b, c).
 * Log-odds form: ln(P/(1-P)) = a * ln(p) - b * ln(1-p) + c
 */
export function fitBetaCalibration(trainingObservations = []) {
  if (trainingObservations.length < 30) {
    return { type: 'BETA', a: 1.0, b: 1.0, c: 0.0, ready: false };
  }

  let a = 1.0;
  let b = 1.0;
  let c = 0.0;
  const lr = 0.02;
  const n = trainingObservations.length;

  for (let epoch = 0; epoch < 80; epoch++) {
    let gradA = 0;
    let gradB = 0;
    let gradC = 0;

    for (const obs of trainingObservations) {
      const p = clipProb(obs.fairProbability ?? obs.rawProbability);
      const logP = Math.log(p);
      const log1mP = Math.log(1 - p);
      const y = obs.outcome === 'WON' ? 1 : 0;

      const z = a * logP - b * log1mP + c;
      const pred = sigmoid(z);
      const diff = pred - y;

      gradA += diff * logP;
      gradB += -diff * log1mP;
      gradC += diff;
    }

    a -= (lr * gradA) / n;
    b -= (lr * gradB) / n;
    c -= (lr * gradC) / n;

    // Constrain parameters to positive
    a = Math.max(0.1, a);
    b = Math.max(0.1, b);
  }

  function calibrate(p) {
    const cp = clipProb(p);
    const z = a * Math.log(cp) - b * Math.log(1 - cp) + c;
    return Number(sigmoid(z).toFixed(4));
  }

  return {
    type: 'BETA',
    a: Number(a.toFixed(4)),
    b: Number(b.toFixed(4)),
    c: Number(c.toFixed(4)),
    ready: true,
    calibrate,
  };
}

/**
 * Evaluates candidate calibrators on holdout validation data and selects the best.
 * If none beat the raw model on validation loss, retains RAW model.
 */
export function selectBestCalibrationMethod(trainingSet = [], validationSet = []) {
  if (trainingSet.length < 20 || validationSet.length < 10) {
    return {
      selectedMethod: 'RAW',
      reason: 'INSUFFICIENT_DATA_FOR_CALIBRATOR_SELECTION',
      calibrator: (p) => p,
      benchmark: null,
    };
  }

  // 1. Raw Baseline
  const rawBrier = calculateBrierScore(validationSet);
  const rawLogLoss = calculateLogLoss(validationSet);

  // 2. Platt
  const platt = fitPlattScaling(trainingSet);
  const plattValObs = validationSet.map((o) => ({
    outcome: o.outcome,
    calibratedProbability: platt.calibrate(o.fairProbability ?? o.rawProbability),
  }));
  const plattBrier = calculateBrierScore(plattValObs);
  const plattLogLoss = calculateLogLoss(plattValObs);

  // 3. Isotonic
  const isotonic = fitIsotonicRegression(trainingSet);
  const isoValObs = validationSet.map((o) => ({
    outcome: o.outcome,
    calibratedProbability: isotonic.calibrate(o.fairProbability ?? o.rawProbability),
  }));
  const isoBrier = calculateBrierScore(isoValObs);
  const isoLogLoss = calculateLogLoss(isoValObs);

  // 4. Beta
  const beta = fitBetaCalibration(trainingSet);
  const betaValObs = validationSet.map((o) => ({
    outcome: o.outcome,
    calibratedProbability: beta.calibrate(o.fairProbability ?? o.rawProbability),
  }));
  const betaBrier = calculateBrierScore(betaValObs);
  const betaLogLoss = calculateLogLoss(betaValObs);

  const candidates = [
    { method: 'RAW', brier: rawBrier, logLoss: rawLogLoss, calibrator: (p) => p },
    { method: 'PLATT', brier: plattBrier, logLoss: plattLogLoss, calibrator: platt.calibrate, model: platt },
    { method: 'ISOTONIC', brier: isoBrier, logLoss: isoLogLoss, calibrator: isotonic.calibrate, model: isotonic },
    { method: 'BETA', brier: betaBrier, logLoss: betaLogLoss, calibrator: beta.calibrate, model: beta },
  ];

  // Sort by combined score: LogLoss + Brier
  candidates.sort((a, b) => (a.logLoss + a.brier) - (b.logLoss + b.brier));
  const best = candidates[0];

  const improved = (best.brier < rawBrier && best.logLoss <= rawLogLoss) ||
                   (best.logLoss < rawLogLoss && best.brier <= rawBrier);

  if (!improved || best.method === 'RAW') {
    return {
      selectedMethod: 'RAW',
      reason: 'No calibrator produced statistically significant out-of-sample improvement over RAW model. Retaining RAW model to prevent overfitting.',
      calibrator: (p) => p,
      candidates,
      validationBenchmark: { rawBrier, rawLogLoss },
    };
  }

  return {
    selectedMethod: best.method,
    reason: `Selected ${best.method} based on superior out-of-sample validation loss (Brier: ${best.brier} vs Raw: ${rawBrier}, LogLoss: ${best.logLoss} vs Raw: ${rawLogLoss}).`,
    calibrator: best.calibrator,
    calibrationModel: best.model,
    candidates,
    validationBenchmark: { rawBrier, rawLogLoss },
  };
}
