import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('support + payment email helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails player when ticket is created', async () => {
    const sendSupportTicketCreatedUserEmail = vi.fn(async () => ({ success: true }));
    vi.doMock('../../server/auth/emailService.js', () => ({
      sendSupportTicketCreatedUserEmail,
      sendSupportTicketAlertEmail: vi.fn(),
    }));
    vi.doMock('../../db/pg.js', () => ({
      query: vi.fn(async () => ({
        rows: [{ email: 'player@example.com', first_name: 'A', last_name: 'B' }],
      })),
    }));
    vi.doMock('../../lib/websocketEngine.mjs', () => ({ broadcastWsMessage: vi.fn() }));
    vi.doMock('../../lib/notificationWorker.mjs', () => ({
      ensureAdminNotificationTable: vi.fn(async () => {}),
    }));

    const { emailUserOnTicketCreated } = await import('../../lib/supportNotify.mjs');
    const result = await emailUserOnTicketCreated({
      userId: 'usr_1',
      ticketNumber: 'TK-1',
      subject: 'Help',
      category: 'Withdrawal',
    });
    expect(result.success).toBe(true);
    expect(sendSupportTicketCreatedUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'player@example.com',
        ticketNumber: 'TK-1',
        category: 'Withdrawal',
      }),
    );
  });

  it('emails deposit completion', async () => {
    const sendDepositCompletedEmail = vi.fn(async () => ({ success: true }));
    vi.doMock('../../server/auth/emailService.js', () => ({
      sendDepositCompletedEmail,
    }));
    vi.doMock('../../db/pg.js', () => ({
      query: vi.fn(async () => ({
        rows: [{ email: 'player@example.com', first_name: 'A', last_name: null }],
      })),
    }));
    vi.doMock('../../lib/websocketEngine.mjs', () => ({ broadcastWsMessage: vi.fn() }));
    vi.doMock('../../lib/notificationWorker.mjs', () => ({
      ensureAdminNotificationTable: vi.fn(async () => {}),
    }));

    const { emailUserPaymentEvent } = await import('../../lib/supportNotify.mjs');
    const result = await emailUserPaymentEvent('deposit', {
      userId: 'usr_1',
      amount: 500,
      paymentId: 'pay_1',
      newBalance: 1500,
    });
    expect(result.success).toBe(true);
    expect(sendDepositCompletedEmail).toHaveBeenCalledOnce();
  });
});
