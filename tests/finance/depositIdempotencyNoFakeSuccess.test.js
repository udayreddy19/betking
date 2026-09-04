/**
 * Deposit credit idempotency must never ACK success without a paid deposit / stored result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkOrLock = vi.fn();
const complete = vi.fn();
const fail = vi.fn();
const release = vi.fn();
const queryMock = vi.fn();
const withTransaction = vi.fn();

vi.mock('../../db/pg.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (...args) => withTransaction(...args),
}));

vi.mock('../../lib/idempotencyEngine.mjs', () => ({
  idempotencyEngine: { checkOrLock, complete, fail, release },
}));

vi.mock('../../lib/schemaGuard.mjs', () => ({
  memoizeEnsure: (fn) => fn,
  createTableIfMissing: vi.fn(),
  addColumnIfMissing: vi.fn(),
}));

vi.mock('../../lib/accountEligibilityEngine.mjs', () => ({
  accountEligibilityEngine: { verifyEligibility: vi.fn() },
}));

vi.mock('../../lib/responsibleGaming.mjs', () => ({
  responsibleGamingEngine: {},
}));

vi.mock('../../lib/paymentProviders/paymentProviderService.mjs', () => ({
  paymentProviderService: {},
}));

vi.mock('../../lib/logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('depositEngine processVerifiedPayment idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('does not fake alreadyPaid when lock is PROCESSING and deposit unpaid', async () => {
    checkOrLock.mockResolvedValue({
      isDuplicate: true,
      status: 'PROCESSING',
      result: null,
      record: { status: 'PROCESSING', createdAt: new Date().toISOString() },
    });
    queryMock.mockResolvedValue({
      rows: [{ id: 'd1', deposit_id: 'dep1', user_id: 'u1', amount: 100, status: 'CREATED', payment_id: null }],
    });

    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    await expect(
      depositEngine.processVerifiedPayment({
        provider: 'RAZORPAY',
        providerOrderId: 'order_1',
        providerPaymentId: 'pay_1',
        amountInINR: 100,
        userId: 'u1',
      }),
    ).rejects.toMatchObject({ code: 'DEPOSIT_IN_PROGRESS' });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('returns paid deposit row when idempotency has no result but deposit is PAID', async () => {
    checkOrLock.mockResolvedValue({
      isDuplicate: true,
      status: 'COMPLETED',
      result: null,
      record: { status: 'COMPLETED' },
    });
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'd1',
          deposit_id: 'dep1',
          user_id: 'u1',
          amount: 250,
          amount_paise: 25000,
          status: 'PAID',
          payment_id: 'pay_1',
          order_id: 'order_1',
          provider: 'RAZORPAY',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ balance: 1250 }] });

    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const res = await depositEngine.processVerifiedPayment({
      provider: 'RAZORPAY',
      providerOrderId: 'order_1',
      providerPaymentId: 'pay_1',
      amountInINR: 250,
      userId: 'u1',
    });
    expect(res).toMatchObject({
      status: 'SUCCESS',
      alreadyPaid: true,
      amount: 250,
      userId: 'u1',
      newBalance: 1250,
    });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('releases FAILED lock and re-credits when deposit still unpaid', async () => {
    checkOrLock
      .mockResolvedValueOnce({
        isDuplicate: true,
        status: 'FAILED',
        result: null,
        record: { status: 'FAILED' },
      })
      .mockResolvedValueOnce({ isDuplicate: false, record: { status: 'PROCESSING' } });
    release.mockResolvedValue(true);
    queryMock.mockResolvedValue({
      rows: [{ id: 'd1', deposit_id: 'dep1', user_id: 'u1', amount: 100, status: 'CREATED', payment_id: null }],
    });
    withTransaction.mockResolvedValue({
      status: 'SUCCESS',
      paymentStatus: 'PAID',
      alreadyPaid: false,
      provider: 'RAZORPAY',
      depositId: 'dep1',
      paymentId: 'pay_1',
      amount: 100,
      userId: 'u1',
      newBalance: 100,
    });
    complete.mockResolvedValue({});

    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const res = await depositEngine.processVerifiedPayment({
      provider: 'RAZORPAY',
      providerOrderId: 'order_1',
      providerPaymentId: 'pay_1',
      amountInINR: 100,
      userId: 'u1',
    });
    expect(release).toHaveBeenCalled();
    expect(withTransaction).toHaveBeenCalled();
    expect(complete).toHaveBeenCalled();
    expect(res.alreadyPaid).toBe(false);
  });
});
