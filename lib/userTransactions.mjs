const CREDIT_UI_TYPES = new Set([
  'deposit',
  'bet_win',
  'bonus',
  'loyalty_redeem',
  'cashout',
  'withdraw_cancel',
  'refund',
  'vip_cashback',
  'vip_perk',
]);

/** Types where `method` is a real payment rail (UPI / bank / Paytm). */
const PAYMENT_RAIL_TYPES = new Set([
  'DEPOSIT',
  'WITHDRAWAL',
  'WITHDRAWAL_APPROVED',
  'WITHDRAWAL_REFUND',
]);

/** Types that store a meaningful source tag in `method` (not a payment rail). */
const SOURCE_TAG_TYPES = new Set([
  'BONUS_CLAIM',
  'BONUS',
  'PROMO_BONUS',
  'LOYALTY_REDEEM',
  'VIP_CASHBACK',
  'VIP_MONTHLY',
  'VIP_TIER_UP',
]);

const TYPE_LABELS = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  WITHDRAWAL_APPROVED: 'Withdrawal',
  WITHDRAWAL_REFUND: 'Withdrawal Refund',
  WITHDRAWAL_CANCEL: 'Withdrawal Cancelled',
  WITHDRAWAL_REVERSAL: 'Withdrawal Reversal',
  BET_STAKE: 'Bet Stake',
  BET_WIN: 'Bet Win',
  BET_PAYOUT: 'Bet Win',
  BET_REFUND: 'Bet Refund',
  BET_VOID: 'Bet Void',
  BET_CASHOUT: 'Cash Out',
  BONUS_CLAIM: 'Bonus',
  BONUS_FORFEIT: 'Bonus Forfeit',
  LOYALTY_REDEEM: 'Loyalty Redemption',
  REFUND: 'Refund',
  VIP_CASHBACK: 'VIP Cashback',
  VIP_MONTHLY: 'VIP Club Credit',
  VIP_TIER_UP: 'VIP Tier Reward',
};

export function mapDbTypeToUiType(dbType) {
  const t = String(dbType || '').toUpperCase();
  switch (t) {
    case 'DEPOSIT':
      return 'deposit';
    case 'WITHDRAWAL':
    case 'WITHDRAWAL_APPROVED':
      return 'withdraw';
    case 'WITHDRAWAL_REFUND':
    case 'WITHDRAWAL_CANCEL':
    case 'WITHDRAWAL_REVERSAL':
      return 'withdraw_cancel';
    case 'BET_STAKE':
      return 'bet_stake';
    case 'BET_WIN':
    case 'BET_PAYOUT':
      return 'bet_win';
    case 'BET_CASHOUT':
    case 'CASHOUT':
      return 'cashout';
    case 'BET_VOID':
    case 'BET_REFUND':
    case 'REFUND':
      return 'refund';
    case 'BONUS_CLAIM':
    case 'BONUS':
    case 'PROMO_BONUS':
      return 'bonus';
    case 'BONUS_FORFEIT':
      return 'bonus_forfeit';
    case 'LOYALTY_REDEEM':
      return 'loyalty_redeem';
    case 'VIP_CASHBACK':
      return 'vip_cashback';
    case 'VIP_MONTHLY':
    case 'VIP_TIER_UP':
      return 'vip_perk';
    default:
      return t.toLowerCase();
  }
}

function formatLabel(row, uiType) {
  const type = String(row.type || '').toUpperCase();
  const base = TYPE_LABELS[type] || uiType.replace(/_/g, ' ');
  const method = String(row.method || '').trim();
  // DB defaults method to 'UPI' on every insert — only surface it for real payment rails,
  // or intentional source tags (e.g. LOYALTY_REDEEM), never on bet/wallet ledger rows.
  const showMethod = Boolean(method) && (
    PAYMENT_RAIL_TYPES.has(type)
    || (SOURCE_TAG_TYPES.has(type) && method.toUpperCase() !== 'UPI')
  );
  const methodSuffix = showMethod ? ` · ${method}` : '';
  const utr = row.utr ? ` · ${row.utr}` : '';
  return `${base}${methodSuffix}${utr}`.trim();
}

export function mapTransactionRow(row) {
  const uiType = mapDbTypeToUiType(row.type);
  const rawAmount = Math.abs(parseFloat(row.amount) || 0);
  const amount = CREDIT_UI_TYPES.has(uiType) ? rawAmount : -rawAmount;

  return {
    id: row.transaction_id,
    type: uiType,
    amount,
    label: formatLabel(row, uiType),
    method: row.method || '',
    status: row.status || 'COMPLETED',
    utr: row.utr || '',
    providerPaymentId: row.provider_payment_id || null,
    providerOrderId: row.provider_order_id || null,
    ledgerEntryId: row.ledger_entry_id || null,
    relatedBetId: row.related_bet_id || null,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}

export async function fetchUserTransactions(userId, { limit = 100, offset = 0 } = {}) {
  const { query } = await import('../db/pg.js');
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const result = await query(
    `SELECT t.transaction_id, t.user_id, t.type, t.amount, t.method, t.utr, t.status, t.created_at,
            t.provider_payment_id, t.provider_order_id,
            le.entry_id AS ledger_entry_id,
            CASE
              WHEN le.description ~ 'bet_[a-zA-Z0-9_]+'
                THEN (regexp_match(le.description, '(bet_[a-zA-Z0-9_]+)'))[1]
              WHEN t.transaction_id ~ 'bet_[a-zA-Z0-9_]+'
                THEN (regexp_match(t.transaction_id, '(bet_[a-zA-Z0-9_]+)'))[1]
              ELSE NULL
            END AS related_bet_id
     FROM transactions t
     LEFT JOIN LATERAL (
       SELECT entry_id, description
       FROM ledger_entries
       WHERE transaction_id = t.transaction_id
       ORDER BY created_at ASC
       LIMIT 1
     ) le ON TRUE
     WHERE t.user_id = $1
     ORDER BY t.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, safeLimit, safeOffset],
  );

  return result.rows.map(mapTransactionRow);
}
