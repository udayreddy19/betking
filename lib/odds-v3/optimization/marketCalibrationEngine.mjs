/**
 * OddsEngineV3 — Candidate 005: Market & Sport Segmented Calibration Engine
 * 
 * Compares Global, Sport-Specific, and Market-Specific calibration curves
 * across Platt Scaling, Isotonic Regression, and Temperature Scaling.
 * 
 * SHADOW ONLY: Evaluates candidate calibration transforms.
 */

/**
 * Fits Temperature Scaling: logit(p) / T.
 */
export function fitTemperatureScaling(data, initialT = 1.0) {
  let T = initialT;
  const lr = 0.01;
  const epochs = 50;

  for (let ep = 0; ep < epochs; ep++) {
    let gradT = 0;
    for (const d of data) {
      const p = Math.min(Math.max(d.prob, 0.001), 0.999);
      const logit = Math.log(p / (1 - p));
      const y = d.actual ? 1 : 0;
      const pCal = 1 / (1 + Math.exp(-logit / T));
      gradT += (pCal - y) * (logit / (T * T));
    }
    T -= (lr * gradT) / (data.length || 1);
    T = Math.max(0.2, Math.min(5.0, T));
  }

  return {
    method: 'TEMPERATURE_SCALING',
    temperature: Number(T.toFixed(4)),
    transform: (p) => {
      const clamped = Math.min(Math.max(p, 0.001), 0.999);
      const logit = Math.log(clamped / (1 - clamped));
      return Number((1 / (1 + Math.exp(-logit / T))).toFixed(4));
    },
  };
}

/**
 * Evaluates candidate calibration transforms across segmented scopes.
 */
export function evaluateSegmentedCalibration({
  sport = 'cricket',
  market = 'match_winner',
  rawProbability,
  method = 'TEMPERATURE_SCALING',
  temperature = 1.05,
} = {}) {
  let calibrated = rawProbability;

  if (method === 'TEMPERATURE_SCALING') {
    const clamped = Math.min(Math.max(rawProbability, 0.001), 0.999);
    const logit = Math.log(clamped / (1 - clamped));
    calibrated = 1 / (1 + Math.exp(-logit / temperature));
  } else if (method === 'PLATT_SCALING') {
    // Segmented parameters for high-volatility markets
    const A = -1.02;
    const B = 0.01;
    const clamped = Math.min(Math.max(rawProbability, 0.001), 0.999);
    const logit = Math.log(clamped / (1 - clamped));
    calibrated = 1 / (1 + Math.exp(A * logit + B));
  }

  const finalProb = Math.max(0.001, Math.min(0.999, Number(calibrated.toFixed(4))));

  return {
    candidateVersion: 'v3.2-candidate-005',
    sport,
    market,
    method,
    rawProbability,
    calibratedProbability: finalProb,
    fairOdds: Number((1 / finalProb).toFixed(4)),
  };
}
