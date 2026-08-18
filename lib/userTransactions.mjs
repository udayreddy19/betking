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

const TYPE_LABELS = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  WITHDRAWAL_APPROVED: 'Withdrawal',
  WITHDRAWAL_REFUND: 'Withdrawal Refund',
  BET_STAKE: 'Bet Stake',
  BET_WIN: 'Bet Win',
  BET_PAYOUT: 'Bet Win',
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
  const base = TYPE_LABELS[String(row.type || '').toUpperCase()]
    || uiType.replace(/_/g, ' ');
  const method = row.method ? ` · ${row.method}` : '';
  const utr = row.utr ? ` · ${row.utr}` : '';
  return `${base}${method}${utr}`.trim();
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
    `SELECT transaction_id, user_id, type, amount, method, utr, status, created_at
     FROM transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, safeLimit, safeOffset],
  );

  return result.rows.map(mapTransactionRow);
}
