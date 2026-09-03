/**
 * OddsYra display timezone — India Standard Time (UTC+05:30).
 * Storage/API remain ISO/UTC; all human-facing timestamps use IST.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_LABEL = 'IST';

function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string|number|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @param {string} [fallback='—']
 */
export function formatIst(value, options = {}, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    ...options,
  });
}

/** Default admin/table datetime: 03 Sep 2026, 06:40 pm */
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

/** Compact: 03 Sep, 06:40 pm */
export function formatIstShort(value, fallback = '—') {
  return formatIst(value, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }, fallback);
}

/** Live clock strip: 03 Sep 2026, 18:40:12 */
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

/** YYYY-MM-DD in IST (for date inputs / "today") */
export function todayIstYmd(value = new Date()) {
  const d = toDate(value) || new Date();
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

/** Date only: 03 Sep 2026 */
export function formatIstDate(value, fallback = '—') {
  return formatIst(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }, fallback);
}

/** SQL fragment: start of current IST calendar day as timestamptz */
export const SQL_IST_DAY_START = `(date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`;
