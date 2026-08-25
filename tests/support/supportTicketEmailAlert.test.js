import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('emailSupportInboxOnTicketCreated', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an alert to SUPPORT_INBOX_EMAIL with ticket details', async () => {
    process.env.SUPPORT_INBOX_EMAIL = 'support@oddsyra.com';
    const sendSupportTicketAlertEmail = vi.fn(async (payload) => ({
      success: true,
      to: payload && 'support@oddsyra.com',
      provider: 'test',
    }));

    vi.doMock('../../server/auth/emailService.js', () => ({
      sendSupportTicketAlertEmail,
    }));
    vi.doMock('../../db/pg.js', () => ({
      query: vi.fn(async () => ({ rows: [{ email: 'player@example.com' }] })),
    }));
    vi.doMock('../../lib/websocketEngine.mjs', () => ({
      broadcastWsMessage: vi.fn(),
    }));
    vi.doMock('../../lib/notificationWorker.mjs', () => ({
      ensureAdminNotificationTable: vi.fn(async () => {}),
    }));

    const { emailSupportInboxOnTicketCreated } = await import('../../lib/supportNotify.mjs');
    const result = await emailSupportInboxOnTicketCreated({
      ticketNumber: 'TK-123456',
      conversationId: 'conv_1',
      userId: 'usr_1',
      subject: 'Withdrawal stuck',
      category: 'Withdrawal',
      priority: 'HIGH',
      message: 'UPI ₹500 pending',
      createdAt: '2026-08-24T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(sendSupportTicketAlertEmail).toHaveBeenCalledOnce();
    const arg = sendSupportTicketAlertEmail.mock.calls[0][0];
    expect(arg.ticketNumber).toBe('TK-123456');
    expect(arg.userEmail).toBe('player@example.com');
    expect(arg.subject).toBe('Withdrawal stuck');
    expect(arg.message).toBe('UPI ₹500 pending');
  });
});
