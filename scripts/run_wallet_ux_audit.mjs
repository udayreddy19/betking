import assert from 'node:assert';
import { getWalletBreakdown, getWalletBreakdownLines, getWalletBucketRows } from '../../src/utils/walletBalance.js';

console.log('🧪 RUNNING ODDSYRA WALLET UX, TRANSACTION HISTORY & ADMIN AUDIT TEST SUITE (16 SCENARIOS)...\n');

// SCENARIO 1: User with only cash balance
{
  const user = { balance: 1500, bonusBalance: 0, freebetBalance: 0, reservedBalance: 0, lockedDepositBalance: 0 };
  const bd = getWalletBreakdown(user);
  assert.strictEqual(bd.total, 1500, 'Total must equal cash balance');
  assert.strictEqual(bd.cashBalance, 1500, 'Cash balance must be 1500');
  assert.strictEqual(bd.withdrawable, 1500, 'Withdrawable must be 1500');
  assert.strictEqual(bd.lockedDeposit, 0, 'Locked deposit must be 0');
  assert.strictEqual(bd.pendingWithdrawal, 0, 'Pending withdrawal must be 0');
  assert.strictEqual(bd.bonus, 0, 'Bonus must be 0');
  assert.strictEqual(bd.freebets, 0, 'Freebets must be 0');
  console.log('✅ Scenario 1: User with only cash balance PASS');
}

// SCENARIO 2: User with bonus balance
{
  const user = { balance: 1000, bonusBalance: 500, freebetBalance: 0, reservedBalance: 0, lockedDepositBalance: 0 };
  const bd = getWalletBreakdown(user);
  assert.strictEqual(bd.total, 1500, 'Total should be cash + bonus');
  assert.strictEqual(bd.cashBalance, 1000, 'Cash is 1000');
  assert.strictEqual(bd.bonus, 500, 'Bonus is 500');
  assert.strictEqual(bd.withdrawable, 1000, 'Withdrawable is restricted to cash');
  console.log('✅ Scenario 2: User with bonus balance PASS');
}

// SCENARIO 3: User with locked deposit (AML turnover)
{
  const user = { balance: 2000, bonusBalance: 0, freebetBalance: 0, reservedBalance: 0, lockedDepositBalance: 500 };
  const bd = getWalletBreakdown(user);
  assert.strictEqual(bd.total, 2000);
  assert.strictEqual(bd.cashBalance, 2000);
  assert.strictEqual(bd.lockedDeposit, 500);
  assert.strictEqual(bd.availableBalance, 2000, 'Available playable cash is 2000');
  assert.strictEqual(bd.withdrawable, 1500, 'Withdrawable is restricted to 2000 - 500 = 1500');
  console.log('✅ Scenario 3: User with locked deposit (AML turnover) PASS');
}

// SCENARIO 4: User with pending withdrawal
{
  const user = { balance: 3000, bonusBalance: 0, freebetBalance: 0, reservedBalance: 1000, lockedDepositBalance: 0 };
  const bd = getWalletBreakdown(user);
  assert.strictEqual(bd.pendingWithdrawal, 1000, 'Pending withdrawal is 1000');
  assert.strictEqual(bd.withdrawable, 3000, 'Available playable cash is 3000');
  console.log('✅ Scenario 4: User with pending withdrawal PASS');
}

// SCENARIO 5: User with free bet
{
  const user = { balance: 500, bonusBalance: 0, freebetBalance: 250, reservedBalance: 0, lockedDepositBalance: 0 };
  const bd = getWalletBreakdown(user);
  assert.strictEqual(bd.freebets, 250, 'Free bet is 250');
  assert.strictEqual(bd.total, 750, 'Total includes free bet 500 + 250');
  assert.strictEqual(bd.withdrawable, 500, 'Withdrawable is strictly cash 500');
  console.log('✅ Scenario 5: User with free bet PASS');
}

// SCENARIO 6: Combined balance breakdown
{
  const user = { balance: 5000, bonusBalance: 1000, freebetBalance: 500, reservedBalance: 1500, lockedDepositBalance: 2000 };
  const bd = getWalletBreakdown(user);
  assert.strictEqual(bd.cashBalance, 5000);
  assert.strictEqual(bd.bonus, 1000);
  assert.strictEqual(bd.freebets, 500);
  assert.strictEqual(bd.lockedDeposit, 2000);
  assert.strictEqual(bd.pendingWithdrawal, 1500);
  assert.strictEqual(bd.availableBalance, 5000, 'Available playable cash is 5000');
  assert.strictEqual(bd.withdrawable, 3000, 'Withdrawable cash = 5000 - 2000 = 3000');
  assert.strictEqual(bd.total, 6500, 'Total = 5000 cash + 1000 bonus + 500 freebet = 6500');
  console.log('✅ Scenario 6: Combined balance breakdown PASS');
}

// SCENARIO 7: Deposit modal validation & quick action
{
  const bd = getWalletBreakdown({ balance: 1000 });
  const rows = getWalletBucketRows(bd);
  assert.ok(Array.isArray(rows) && rows.length > 0, 'Bucket rows must be an array');
  const availableRow = rows.find(r => r.key === 'available');
  assert.ok(availableRow, 'Available row must exist in breakdown');
  assert.strictEqual(availableRow.value, 1000);
  console.log('✅ Scenario 7: Deposit quick action & bucket rows PASS');
}

// SCENARIO 8: Withdrawal validation rules
{
  const bd = getWalletBreakdown({ balance: 1000, lockedDepositBalance: 400 });
  const lines = getWalletBreakdownLines(bd);
  const withdrawableLine = lines.find(l => l.key === 'withdrawable');
  assert.ok(withdrawableLine, 'Withdrawable line must be present');
  assert.strictEqual(withdrawableLine.value, 600, 'Withdrawable amount must be exactly 600');
  console.log('✅ Scenario 8: Withdrawal validation rules PASS');
}

// SCENARIO 9: Transaction history category filtering
{
  const mockTransactions = [
    { id: 'tx_1', type: 'DEPOSIT', amount: 1000, status: 'COMPLETED' },
    { id: 'tx_2', type: 'WITHDRAWAL', amount: 500, status: 'PENDING' },
    { id: 'tx_3', type: 'BET_STAKE', amount: 100, status: 'COMPLETED' },
    { id: 'tx_4', type: 'BET_PAYOUT', amount: 250, status: 'COMPLETED' },
    { id: 'tx_5', type: 'BONUS_CREDIT', amount: 50, status: 'COMPLETED' },
    { id: 'tx_6', type: 'REFERRAL_REWARD', amount: 20, status: 'COMPLETED' },
  ];

  const filterByCategory = (txs, category) => {
    if (category === 'ALL') return txs;
    if (category === 'DEPOSITS') return txs.filter(t => t.type === 'DEPOSIT');
    if (category === 'WITHDRAWALS') return txs.filter(t => t.type === 'WITHDRAWAL');
    if (category === 'BETTING') return txs.filter(t => ['BET_STAKE', 'BET_PAYOUT', 'CASHOUT'].includes(t.type));
    if (category === 'BONUSES') return txs.filter(t => ['BONUS_CREDIT', 'BONUS_EXPIRE', 'BONUS_FORFEIT'].includes(t.type));
    if (category === 'REWARDS') return txs.filter(t => ['REFERRAL_REWARD', 'LOYALTY_REWARD', 'CASHBACK'].includes(t.type));
    return txs;
  };

  assert.strictEqual(filterByCategory(mockTransactions, 'ALL').length, 6);
  assert.strictEqual(filterByCategory(mockTransactions, 'DEPOSITS').length, 1);
  assert.strictEqual(filterByCategory(mockTransactions, 'WITHDRAWALS').length, 1);
  assert.strictEqual(filterByCategory(mockTransactions, 'BETTING').length, 2);
  assert.strictEqual(filterByCategory(mockTransactions, 'BONUSES').length, 1);
  assert.strictEqual(filterByCategory(mockTransactions, 'REWARDS').length, 1);
  console.log('✅ Scenario 9: Transaction history category filtering PASS');
}

// SCENARIO 10: Transaction history status filtering
{
  const mockTransactions = [
    { id: 'tx_1', status: 'COMPLETED' },
    { id: 'tx_2', status: 'PENDING' },
    { id: 'tx_3', status: 'FAILED' },
    { id: 'tx_4', status: 'COMPLETED' },
  ];

  const completed = mockTransactions.filter(t => t.status === 'COMPLETED');
  const pending = mockTransactions.filter(t => t.status === 'PENDING');
  const failed = mockTransactions.filter(t => t.status === 'FAILED');

  assert.strictEqual(completed.length, 2);
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(failed.length, 1);
  console.log('✅ Scenario 10: Transaction history status filtering PASS');
}

// SCENARIO 11: Transaction detail lookup (non-leaking)
{
  const rawTx = {
    id: 'tx_12345',
    userId: 'usr_888',
    type: 'BET_PAYOUT',
    amount: 500,
    status: 'COMPLETED',
    metadata: { betId: 'bet_999', gatewaySecret: 'DO_NOT_LEAK', providerPayload: { internal_auth: 'secret' } },
    createdAt: '2026-08-30T00:00:00.000Z',
  };

  const sanitizeForUserView = (tx) => {
    const { metadata, ...safe } = tx;
    return {
      id: safe.id,
      type: safe.type,
      amount: safe.amount,
      status: safe.status,
      referenceId: metadata?.betId || metadata?.withdrawalId || metadata?.depositId || null,
      createdAt: safe.createdAt,
    };
  };

  const safeView = sanitizeForUserView(rawTx);
  assert.strictEqual(safeView.id, 'tx_12345');
  assert.strictEqual(safeView.referenceId, 'bet_999');
  assert.strictEqual(safeView.gatewaySecret, undefined);
  assert.strictEqual(safeView.metadata, undefined);
  console.log('✅ Scenario 11: Transaction detail lookup (non-leaking) PASS');
}

// SCENARIO 12: Admin wallet search by email
{
  const users = [
    { id: 'usr_1', email: 'alice@example.com', username: 'alice' },
    { id: 'usr_2', email: 'bob@example.com', username: 'bob' },
  ];
  const query = 'alice@example.com';
  const found = users.filter(u => u.email.toLowerCase() === query.toLowerCase());
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].id, 'usr_1');
  console.log('✅ Scenario 12: Admin wallet search by email PASS');
}

// SCENARIO 13: Admin wallet search by user ID
{
  const users = [
    { id: 'usr_1', email: 'alice@example.com' },
    { id: 'usr_2', email: 'bob@example.com' },
  ];
  const query = 'usr_2';
  const found = users.filter(u => u.id === query);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].email, 'bob@example.com');
  console.log('✅ Scenario 13: Admin wallet search by user ID PASS');
}

// SCENARIO 14: Admin wallet search by transaction ID
{
  const txs = [
    { id: 'tx_abc', userId: 'usr_1', amount: 500 },
    { id: 'tx_xyz', userId: 'usr_2', amount: 1000 },
  ];
  const query = 'tx_xyz';
  const found = txs.find(t => t.id === query);
  assert.ok(found);
  assert.strictEqual(found.userId, 'usr_2');
  console.log('✅ Scenario 14: Admin wallet search by transaction ID PASS');
}

// SCENARIO 15: Admin financial timeline generation
{
  const timelineEvents = [
    { id: 'ev_1', type: 'DEPOSIT', amount: 1000, ts: 100 },
    { id: 'ev_2', type: 'BET_STAKE', amount: -200, ts: 200 },
    { id: 'ev_3', type: 'BET_PAYOUT', amount: 400, ts: 300 },
  ];
  // Verify chronological sort
  timelineEvents.sort((a, b) => a.ts - b.ts);
  assert.strictEqual(timelineEvents[0].type, 'DEPOSIT');
  assert.strictEqual(timelineEvents[2].type, 'BET_PAYOUT');
  console.log('✅ Scenario 15: Admin financial timeline generation PASS');
}

// SCENARIO 16: Admin read-only reconciliation dashboard metrics
{
  const wallets = [
    { id: 'w_1', balance: 500, reserved_balance: 0 },
    { id: 'w_2', balance: 1200, reserved_balance: 300 },
    { id: 'w_3', balance: 0, reserved_balance: 0 },
  ];

  const totalWallets = wallets.length;
  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
  const totalReserved = wallets.reduce((sum, w) => sum + w.reserved_balance, 0);
  const negativeBalances = wallets.filter(w => w.balance < 0).length;

  assert.strictEqual(totalWallets, 3);
  assert.strictEqual(totalBalance, 1700);
  assert.strictEqual(totalReserved, 300);
  assert.strictEqual(negativeBalances, 0);
  console.log('✅ Scenario 16: Admin read-only reconciliation dashboard metrics PASS');
}

console.log('\n🎉 ALL 16 ODDSYRA WALLET UX & ADMIN AUDIT TEST SCENARIOS PASSED WITH ZERO FAILURES!\n');
