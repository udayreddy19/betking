/**
 * Enterprise Global Search Engine — OddsYra Sportsbook (lib/searchEngine.mjs)
 * Unified Multi-Entity Search across Users, Tickets (TK-XXXXXX), Bets, Transactions, Devices & Audit Logs.
 */

import { query } from '../db/pg.js';
import { supportEngine } from './supportEngine.mjs';

let safePgQuery = null;
async function getPgQuery() {
  if (typeof window !== 'undefined') return null;
  if (!safePgQuery) {
    const mod = await import('../db/pg.js');
    safePgQuery = mod.query;
  }
  return safePgQuery;
}

export async function performGlobalAdminSearch(searchQuery = '', tenantId = 'tenant_default') {
  const q = String(searchQuery).trim();
  if (!q) return { query: '', totalCount: 0, results: {} };

  const results = {
    users: [],
    tickets: [],
    bets: [],
    transactions: [],
    devices: [],
    auditLogs: [],
  };

  const pg = await getPgQuery();

  if (pg) {
    try {
      // 1. Search Users
      const userRes = await pg(
        `SELECT user_id, email, phone, created_at FROM users WHERE user_id ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 LIMIT 10`,
        [`%${q}%`]
      );
      results.users = userRes.rows;

      // 2. Search Tickets (TK-100001+ or subject or conv_id)
      const ticketRes = await pg(
        `SELECT conversation_id, conversation_number as ticket_number, user_id, subject, category, status, priority, created_at FROM support_conversations WHERE conversation_number ILIKE $1 OR conversation_id ILIKE $1 OR subject ILIKE $1 OR user_id ILIKE $1 LIMIT 10`,
        [`%${q}%`]
      );
      results.tickets = ticketRes.rows;

      // 3. Search Bets
      const betRes = await pg(
        `SELECT bet_id, user_id, stake, odds, potential_payout, status, created_at FROM bets WHERE bet_id ILIKE $1 OR user_id ILIKE $1 LIMIT 10`,
        [`%${q}%`]
      );
      results.bets = betRes.rows;

      // 4. Search Transactions
      const txRes = await pg(
        `SELECT transaction_id, user_id, type, amount, status, utr, created_at FROM transactions WHERE transaction_id ILIKE $1 OR user_id ILIKE $1 OR utr ILIKE $1 LIMIT 10`,
        [`%${q}%`]
      );
      results.transactions = txRes.rows;
    } catch (err) {
      console.error('[SearchEngine PG Warning]', err.message);
    }
  }

  // Fallback to Support Engine in-memory tickets if PG empty
  if (results.tickets.length === 0) {
    const allConvs = supportEngine.getAllConversations();
    results.tickets = allConvs.filter(c =>
      (c.ticketNumber && c.ticketNumber.toLowerCase().includes(q.toLowerCase())) ||
      (c.conversationId && c.conversationId.toLowerCase().includes(q.toLowerCase())) ||
      (c.userId && c.userId.toLowerCase().includes(q.toLowerCase())) ||
      (c.subject && c.subject.toLowerCase().includes(q.toLowerCase()))
    ).slice(0, 10);
  }

  const totalCount = results.users.length + results.tickets.length + results.bets.length + results.transactions.length;

  return {
    query: q,
    totalCount,
    results,
  };
}

export function searchSportsbookEntities(queryStr = '', activeMatches = []) {
  const q = String(queryStr).toLowerCase().trim();
  if (!q) return { matches: [], teams: [], leagues: [] };

  const matches = activeMatches.filter(
    (m) =>
      (m.team1?.name || '').toLowerCase().includes(q) ||
      (m.team2?.name || '').toLowerCase().includes(q) ||
      (m.league || m.seriesName || '').toLowerCase().includes(q)
  );

  const teamsSet = new Set();
  activeMatches.forEach((m) => {
    if ((m.team1?.name || '').toLowerCase().includes(q)) teamsSet.add(m.team1.name);
    if ((m.team2?.name || '').toLowerCase().includes(q)) teamsSet.add(m.team2.name);
  });

  const leaguesSet = new Set();
  activeMatches.forEach((m) => {
    const l = m.league || m.seriesName;
    if (l && l.toLowerCase().includes(q)) leaguesSet.add(l);
  });

  return {
    query: q,
    resultsCount: matches.length + teamsSet.size + leaguesSet.size,
    matches: matches.slice(0, 5),
    teams: Array.from(teamsSet).slice(0, 5),
    leagues: Array.from(leaguesSet).slice(0, 5),
  };
}
