/**
 * Critical End-to-End Acceptance Test
 * ODDSYRA — SUPPORT TICKET CREATION & USER-AGENT INTERACTION
 * Validates complete flow with a normal synthetic USER account
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { query } from '../../db/pg.js';
import { generateAccessToken } from '../../server/auth/tokenService.js';
import supportRouter from '../../server/routes/support.js';
import { supportEngine } from '../../lib/supportEngine.mjs';

describe('CRITICAL PRODUCTION HARDENING: End-to-End User Ticket Creation', () => {
  const syntheticUserId = `usr_e2e_tester_${Date.now()}`;
  const syntheticUserEmail = `tester_${Date.now()}@oddsyra.local`;
  let userAccessToken = '';
  let server = null;
  let baseUrl = '';

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(supportRouter);

    await new Promise((resolve) => {
      server = createServer(app).listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    userAccessToken = generateAccessToken(syntheticUserId, 'USER', 'oddsyra_in');

    // Seed normal user into users table if not already present
    try {
      await query(
        `INSERT INTO users (user_id, email, role, status)
         VALUES ($1, $2, 'USER', 'ACTIVE')
         ON CONFLICT (user_id) DO NOTHING`,
        [syntheticUserId, syntheticUserEmail]
      );
    } catch (_) {}
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('CRITICAL ACCEPTANCE TEST: Normal user creates ticket, views it, replies, and agent interacts', async () => {
    // 1. Submit Ticket as normal user with ONLY category, subject, description (no financial records)
    const createRes = await fetch(`${baseUrl}/api/v1/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userAccessToken}`,
      },
      body: JSON.stringify({
        category: 'TECHNICAL',
        subject: 'Test ticket creation',
        description: 'This is an end-to-end support ticket creation test.',
      }),
    });

    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    expect(createData.ticketReference).toBeDefined();
    expect(createData.ticketReference).toMatch(/^OD-\d{4}-\d+/);

    const ticketRef = createData.ticketReference;
    const convId = createData.ticket.conversationId;

    // 2. Verify Ticket Exists in PostgreSQL authoritative store
    const dbTicket = await query('SELECT * FROM support_conversations WHERE conversation_id = $1', [convId]);
    expect(dbTicket.rows.length).toBe(1);
    expect(dbTicket.rows[0].user_id).toBe(syntheticUserId);
    expect(dbTicket.rows[0].subject).toBe('Test ticket creation');
    expect(dbTicket.rows[0].status).toBe('OPEN');

    // 3. User lists their tickets (GET /api/v1/support/tickets)
    const listRes = await fetch(`${baseUrl}/api/v1/support/tickets`, {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
      },
    });

    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.success).toBe(true);
    const foundInList = listData.tickets.find((t) => t.ticketReference === ticketRef || t.conversationId === convId);
    expect(foundInList).toBeDefined();
    expect(foundInList.subject).toBe('Test ticket creation');

    // 4. User opens the ticket thread (GET /api/v1/support/tickets/:ticketReference)
    const detailRes = await fetch(`${baseUrl}/api/v1/support/tickets/${ticketRef}`, {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
      },
    });

    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.success).toBe(true);
    expect(detailData.ticket.conversationId).toBe(convId);
    expect(detailData.ticket.messages.length).toBe(1);
    expect(detailData.ticket.messages[0].text).toBe('This is an end-to-end support ticket creation test.');

    // 5. User sends a follow-up message
    const replyRes = await fetch(`${baseUrl}/api/v1/support/tickets/${ticketRef}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userAccessToken}`,
      },
      body: JSON.stringify({
        text: 'Follow-up detail from normal user.',
      }),
    });

    expect(replyRes.status).toBe(201);
    const replyData = await replyRes.json();
    expect(replyData.success).toBe(true);
    expect(replyData.message.text).toBe('Follow-up detail from normal user.');

    // 6. Support Agent views ticket and adds an Internal Note (confidential)
    await supportEngine.addMessage(convId, {
      senderId: 'agent_priya',
      senderType: 'admin',
      messageType: 'INTERNAL_NOTE',
      text: 'CONFIDENTIAL: User network trace verified, bug acknowledged by core devops.',
    });

    // 7. Support Agent replies to user
    await supportEngine.addMessage(convId, {
      senderId: 'agent_priya',
      senderType: 'admin',
      agentName: 'Priya Sharma',
      messageType: 'ADMIN_MESSAGE',
      text: 'Hello, we have confirmed the bug report and released a patch.',
    });

    // 8. User fetches ticket thread again — Internal Note must NEVER leak
    const finalDetailRes = await fetch(`${baseUrl}/api/v1/support/tickets/${ticketRef}`, {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
      },
    });

    expect(finalDetailRes.status).toBe(200);
    const finalDetailData = await finalDetailRes.json();
    const messages = finalDetailData.ticket.messages;
    expect(messages.some((m) => m.text.includes('released a patch'))).toBe(true);
    expect(messages.some((m) => m.text.includes('CONFIDENTIAL'))).toBe(false);
    expect(finalDetailData.ticket.internalNotes.length).toBe(0);
  });

  it('TEST 8: Optional related records can be null or undefined without error', async () => {
    const res = await fetch(`${baseUrl}/api/v1/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userAccessToken}`,
      },
      body: JSON.stringify({
        category: 'BET',
        subject: 'Bet inquiry with no linked record',
        description: 'I have a general question regarding odds calculation.',
        relatedEntityType: null,
        relatedEntityId: null,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.ticket.relatedEntityType).toBeNull();
  });

  it('TEST 25: Ticket creation failure with empty subject returns clear, safe error', async () => {
    const res = await fetch(`${baseUrl}/api/v1/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userAccessToken}`,
      },
      body: JSON.stringify({
        category: 'TECHNICAL',
        subject: '',
        description: 'Some text',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Subject is required.');
  });
});
