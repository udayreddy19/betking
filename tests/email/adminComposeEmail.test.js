import { describe, it, expect, beforeEach } from 'vitest';
import {
  listAdminComposeMailboxes,
  listAdminComposeTemplates,
  sendAdminComposeEmail,
  resetEmailDeliveryMetricsForTests,
} from '../../server/auth/emailService.js';

describe('Admin compose email', () => {
  beforeEach(() => {
    resetEmailDeliveryMetricsForTests();
  });

  it('lists all @oddsyra.com mailboxes', () => {
    const boxes = listAdminComposeMailboxes();
    expect(boxes.map((b) => b.email)).toEqual([
      'no-reply@oddsyra.com',
      'promos@oddsyra.com',
      'support@oddsyra.com',
      'alerts@oddsyra.com',
    ]);
  });

  it('lists instant templates with a mailbox each', () => {
    const templates = listAdminComposeTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(12);
    for (const tpl of templates) {
      expect(tpl.mailboxId).toBeTruthy();
      expect(boxesHas(tpl.mailboxId)).toBe(true);
    }
  });

  it('sends branded mail from the selected mailbox', async () => {
    const res = await sendAdminComposeEmail({
      mailboxId: 'support',
      to: 'player@example.com',
      subject: 'Ticket update',
      body: 'We looked into your request.\n\nPlease reply if you still need help.',
      heading: 'Update on your support request',
      greetingName: 'Ravi',
      ctaLabel: 'Open support',
      ctaHref: 'https://oddsyra.com/profile?tab=support',
    });
    expect(res.success).toBe(true);
    expect(res.sent).toBe(1);
    expect(res.mailbox.email).toBe('support@oddsyra.com');
    expect(res.html).toContain('ODDS');
    expect(res.html).toContain('YRA');
    expect(res.html).toContain('Hi <strong>Ravi</strong>');
    expect(res.html).toContain('We looked into your request.');
    expect(res.html).toContain('https://oddsyra.com/profile?tab=support');
    expect(res.results[0].success).toBe(true);
  });

  it('rejects unknown mailbox and invalid recipients', async () => {
    await expect(sendAdminComposeEmail({
      mailboxId: 'gmail',
      to: 'player@example.com',
      subject: 'Hi',
      body: 'Hello',
    })).rejects.toMatchObject({ code: 'INVALID_MAILBOX' });

    await expect(sendAdminComposeEmail({
      mailboxId: 'support',
      to: 'not-an-email',
      subject: 'Hi',
      body: 'Hello',
    })).rejects.toMatchObject({ code: 'INVALID_RECIPIENT' });
  });

  it('drops javascript CTA urls', async () => {
    const res = await sendAdminComposeEmail({
      mailboxId: 'promos',
      to: 'player@example.com',
      subject: 'Offer',
      body: 'Limited offer.',
      ctaLabel: 'Click',
      ctaHref: 'javascript:alert(1)',
    });
    expect(res.success).toBe(true);
    expect(res.html).not.toContain('javascript:');
    expect(res.html).toContain('Limited offer.');
  });
});

function boxesHas(id) {
  return listAdminComposeMailboxes().some((b) => b.id === id);
}
