import { ERROR_CODES } from './errorCodes.mjs';

export function withTimeout(promise, ms, message = 'Provider did not respond') {
  const timeoutMs = Math.max(1, Number(ms) || 10000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(message);
      err.code = ERROR_CODES.TIMEOUT;
      reject(err);
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function timed(fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, responseTimeMs: Date.now() - started, error: null };
  } catch (error) {
    return { value: null, responseTimeMs: Date.now() - started, error };
  }
}
