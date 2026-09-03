/**
 * Server-side IST helpers (same contract as src/utils/istTime.js).
 */

export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_LABEL = 'IST';

function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatIst(value, options = {}, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    ...options,
  });
}

export function formatIstDateTime(value, fallback = '—') {
  return formatIst(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }, fallback);
}

export function formatIstShort(value, fallback = '—') {
  return formatIst(value, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }, fallback);
}

export function formatIstClock(value = new Date()) {
  return formatIst(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }, '');
}

export function todayIstYmd(value = new Date()) {
  const d = toDate(value) || new Date();
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

export function formatIstDate(value, fallback = '—') {
  return formatIst(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }, fallback);
}

/** Start of current IST calendar day as timestamptz (Postgres). */
export const SQL_IST_DAY_START = `(date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`;
