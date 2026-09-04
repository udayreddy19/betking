/** Canonical statuses that mean a gateway deposit was credited. */
export const SUCCESSFUL_DEPOSIT_STATUSES = Object.freeze([
  'PAID',
  'CAPTURED',
  'SUCCESS',
  'COMPLETED',
]);

/** SQL IN-list fragment for successful deposit rows (uppercase compare). */
export const SUCCESSFUL_DEPOSIT_STATUS_SQL = `'PAID','CAPTURED','SUCCESS','COMPLETED'`;

export function isSuccessfulDepositStatus(status) {
  return SUCCESSFUL_DEPOSIT_STATUSES.includes(String(status || '').toUpperCase());
}
