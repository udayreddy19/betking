/**
 * Human-readable user IDs: firstname_DD_MM_YYYY_000001 (IST signup date).
 */

const IST = 'Asia/Kolkata';

export function slugifyFirstName(firstName) {
  const slug = String(firstName || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return slug || 'user';
}

export function formatSignupDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
  };
}

export function formatSignupDate(date = new Date()) {
  const { day, month, year } = formatSignupDateParts(date);
  return `${day}_${month}_${year}`;
}

export function formatReadableUserId(firstName, sequence, date = new Date()) {
  const seq = String(Math.max(1, Number(sequence) || 1)).padStart(6, '0');
  return `${slugifyFirstName(firstName)}_${formatSignupDate(date)}_${seq}`;
}

export async function allocateReadableUserId(queryFn, firstName, date = new Date()) {
  let seq = 1;
  try {
    const res = await queryFn(`SELECT nextval('user_id_seq') AS n`);
    const n = Number(res?.rows?.[0]?.n);
    if (Number.isFinite(n) && n > 0) seq = n;
  } catch {
    try {
      const res = await queryFn(`SELECT COUNT(*)::int AS n FROM users`);
      seq = (Number(res?.rows?.[0]?.n) || 0) + 1;
    } catch {
      seq = 1;
    }
  }
  return formatReadableUserId(firstName, seq, date);
}
