export function normalizeCricbuzzOvers(value) {
  const str = String(value ?? '0');
  if (!str || str === '0') return '0.0';

  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;

  if (ball >= 6) {
    const extraOvers = Math.floor(ball / 6);
    return `${whole + extraOvers}.${ball % 6}`;
  }

  return `${whole}.${ball}`;
}

export function oversToBalls(oversStr, _totalOvers = 20) {
  const normalized = normalizeCricbuzzOvers(oversStr);
  const parts = normalized.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole * 6 + ball;
}

export function ballsRemaining(oversStr, totalOvers = 20) {
  const bowled = oversToBalls(oversStr);
  return Math.max(0, totalOvers * 6 - bowled);
}

export function parseOversFloat(oversStr) {
  const normalized = normalizeCricbuzzOvers(oversStr);
  const parts = normalized.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole + ball / 6;
}