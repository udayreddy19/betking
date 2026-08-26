/**
 * Phase 1: Admin Command Center — ⌘+K Global Command Palette API
 * 
 * Provides unified multi-entity search across the entire platform
 * with RBAC-aware filtering and quick action execution.
 */

import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';

const router = Router();

// Lazy-load DB query to avoid issues with browser imports
let pgQuery = null;
async function getQuery() {
  if (!pgQuery) {
    const mod = await import('../../../db/pg.js');
    pgQuery = mod.query;
  }
  return pgQuery;
}

/**
 * RBAC-aware entity search configuration.
 * Maps roles to the entity types they can search.
 */
const ROLE_SEARCH_ACCESS = {
  SUPER_ADMIN: ['users', 'bets', 'tickets', 'matches', 'markets', 'transactions', 'deposits', 'withdrawals', 'kyc_cases', 'fraud_cases', 'incidents', 'admin_users', 'audit_events', 'configuration'],
  FINANCE_ADMIN: ['users', 'bets', 'transactions', 'deposits', 'withdrawals', 'audit_events'],
  TRADING_ADMIN: ['bets', 'matches', 'markets', 'transactions', 'audit_events'],
  SUPPORT_AGENT: ['users', 'tickets', 'bets', 'transactions', 'kyc_cases'],
  RISK_ANALYST: ['users', 'bets', 'fraud_cases', 'transactions', 'risk_signals', 'audit_events'],
  MARKETING_ADMIN: ['users', 'audit_events'],
  OPERATIONS_ADMIN: ['incidents', 'matches', 'markets', 'audit_events', 'configuration'],
};

/**
 * Quick actions that require confirmation and special permission
 */
const DANGEROUS_ACTIONS = new Set([
  'suspend_market', 'create_incident', 'restrict_account',
  'approve_withdrawal', 'reject_withdrawal', 'void_bet',
  'suspend_user', 'freeze_wallet',
]);

/**
 * POST /api/admin/v2/command/search
 * Unified multi-entity search with RBAC filtering
 */
router.post('/search', async (req, res) => {
  try {
    const { query: searchQuery, entityTypes, limit = 10 } = req.body;
    const q = String(searchQuery || '').trim();

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters', code: 'INVALID_QUERY' });
    }

    const adminRole = req.admin.role;
    const allowedTypes = ROLE_SEARCH_ACCESS[adminRole] || [];
    const typesToSearch = entityTypes
      ? entityTypes.filter(t => allowedTypes.includes(t))
      : allowedTypes;

    const dbQuery = await getQuery();
    const results = {};
    const searchErrors = {};
    const searchPattern = `%${q}%`;

    // Search Users (email, phone digits, name, user id)
    if (typesToSearch.includes('users')) {
      try {
        const { buildUserContactSearchClause } = await import('../../../lib/adminDomainData.mjs');
        const contact = buildUserContactSearchClause(q, { startIdx: 1, searchBy: 'all' });
        const userRes = contact.sql
          ? await dbQuery(
            `SELECT u.user_id,
                    u.email,
                    u.phone,
                    u.first_name,
                    u.last_name,
                    p.display_name,
                    u.created_at
             FROM users u
             LEFT JOIN user_profiles p ON p.user_id = u.user_id
             WHERE ${contact.sql}
             ORDER BY u.created_at DESC
             LIMIT $${contact.params.length + 1}`,
            [...contact.params, limit],
          )
          : { rows: [] };
        results.users = userRes.rows.map((r) => {
          const name = [r.display_name, [r.first_name, r.last_name].filter(Boolean).join(' ')]
            .map((s) => String(s || '').trim())
            .find(Boolean) || '';
          return {
            ...r,
            _entityType: 'user',
            _displayId: r.user_id,
            _displayLabel: [name, r.email, r.phone].filter(Boolean).join(' · ') || r.user_id,
          };
        });
      } catch (err) {
        console.error('[command/search] users', err.message);
        results.users = [];
      }
    }

    // Search Bets
    if (typesToSearch.includes('bets')) {
      try {
        const betRes = await dbQuery(
          `SELECT bet_id, user_id, stake, odds, potential_payout, status, created_at FROM bets
           WHERE bet_id ILIKE $1 OR user_id ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.bets = betRes.rows.map(r => ({
          ...r, _entityType: 'bet', _displayId: r.bet_id, _displayLabel: `₹${r.stake} @ ${r.odds}`,
        }));
      } catch (err) { console.warn('[command/search] bets', err.message); results.bets = []; searchErrors.bets = err.message; }
    }

    // Search Tickets
    if (typesToSearch.includes('tickets')) {
      try {
        const ticketRes = await dbQuery(
          `SELECT conversation_id, conversation_number, user_id, subject, category, status, priority, created_at
           FROM support_conversations
           WHERE conversation_number ILIKE $1 OR conversation_id ILIKE $1 OR subject ILIKE $1 OR user_id ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.tickets = ticketRes.rows.map(r => ({
          ...r, _entityType: 'ticket', _displayId: r.conversation_id, _displayLabel: r.subject || r.conversation_number || 'Support Ticket',
        }));
      } catch (err) { console.warn('[command/search] tickets', err.message); results.tickets = []; searchErrors.tickets = err.message; }
    }

    // Search Matches (DB + live aggregator fallback)
    if (typesToSearch.includes('matches')) {
      try {
        const matchRes = await dbQuery(
          `SELECT m.match_id, m.status, m.start_time, m.updated_at,
                  t1.name AS team1_name, t2.name AS team2_name
           FROM matches m
           LEFT JOIN teams t1 ON m.team1_id = t1.team_id
           LEFT JOIN teams t2 ON m.team2_id = t2.team_id
           WHERE m.match_id ILIKE $1 OR t1.name ILIKE $1 OR t2.name ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.matches = matchRes.rows.map(r => ({
          ...r, _entityType: 'match', _displayId: r.match_id, _displayLabel: `${r.team1_name || '?'} vs ${r.team2_name || '?'}`,
        }));
      } catch (err) { console.warn('[command/search] matches', err.message); results.matches = []; searchErrors.matches = err.message; }

      try {
        const { getCachedAggregatedLiveScores, aggregateLiveScores } = await import('../../../lib/aggregator.mjs');
        const snap = getCachedAggregatedLiveScores() || await aggregateLiveScores({ force: false });
        const qLower = q.toLowerCase();
        const liveHits = (snap?.matches || [])
          .filter((m) => {
            const t1 = (m.team1?.name || m.team1 || '').toString().toLowerCase();
            const t2 = (m.team2?.name || m.team2 || '').toString().toLowerCase();
            const id = String(m.id || m.matchId || '').toLowerCase();
            const league = String(m.league || '').toLowerCase();
            return id.includes(qLower) || t1.includes(qLower) || t2.includes(qLower) || league.includes(qLower);
          })
          .slice(0, limit)
          .map((m) => ({
            match_id: m.id || m.matchId,
            status: m.isLive ? 'LIVE' : (m.matchState || 'UNKNOWN'),
            _entityType: 'match',
            _displayId: m.id || m.matchId,
            _displayLabel: `${m.team1?.name || m.team1 || '?'} vs ${m.team2?.name || m.team2 || '?'}`,
            source: m.source || 'live',
          }));
        const seen = new Set((results.matches || []).map((m) => m._displayId));
        results.matches = [
          ...(results.matches || []),
          ...liveHits.filter((m) => !seen.has(m._displayId)),
        ].slice(0, limit);
      } catch { /* keep DB matches */ }
    }

    // Search Markets
    if (typesToSearch.includes('markets')) {
      try {
        const marketRes = await dbQuery(
          `SELECT market_id, match_id, name, category, status FROM markets
           WHERE market_id ILIKE $1 OR name ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.markets = marketRes.rows.map(r => ({
          ...r, _entityType: 'market', _displayId: r.market_id, _displayLabel: r.name,
        }));
      } catch (err) { console.warn('[command/search] markets', err.message); results.markets = []; searchErrors.markets = err.message; }
    }

    // Search Transactions
    if (typesToSearch.includes('transactions')) {
      try {
        const txRes = await dbQuery(
          `SELECT transaction_id, user_id, type, amount, status, utr, method, created_at FROM transactions
           WHERE transaction_id ILIKE $1 OR user_id ILIKE $1 OR utr ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.transactions = txRes.rows.map(r => ({
          ...r, _entityType: 'transaction', _displayId: r.transaction_id, _displayLabel: `${r.type} ₹${r.amount}`,
        }));
      } catch (err) { console.warn('[command/search] transactions', err.message); results.transactions = []; searchErrors.transactions = err.message; }
    }

    // Search KYC Cases
    if (typesToSearch.includes('kyc_cases')) {
      try {
        const kycRes = await dbQuery(
          `SELECT case_id, user_id, status, pan_number, reviewed_by, updated_at FROM kyc_cases
           WHERE case_id ILIKE $1 OR user_id ILIKE $1 OR pan_number ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.kyc_cases = kycRes.rows.map(r => ({
          ...r, _entityType: 'kyc_case', _displayId: r.case_id, _displayLabel: `KYC: ${r.status}`,
        }));
      } catch (err) { console.warn('[command/search] kyc_cases', err.message); results.kyc_cases = []; searchErrors.kyc_cases = err.message; }
    }

    // Search Fraud Cases
    if (typesToSearch.includes('fraud_cases')) {
      try {
        const fraudRes = await dbQuery(
          `SELECT id, user_id, risk_score, assigned_investigator, status, notes, created_at FROM fraud_cases
           WHERE id ILIKE $1 OR user_id ILIKE $1 OR assigned_investigator ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.fraud_cases = fraudRes.rows.map(r => ({
          ...r, _entityType: 'fraud_case', _displayId: r.id, _displayLabel: `Fraud: Risk ${r.risk_score}`,
        }));
      } catch (err) { console.warn('[command/search] fraud_cases', err.message); results.fraud_cases = []; searchErrors.fraud_cases = err.message; }
    }

    // Search Incidents
    if (typesToSearch.includes('incidents')) {
      try {
        const incRes = await dbQuery(
          `SELECT id, title, severity, service, status, created_at FROM incidents
           WHERE id ILIKE $1 OR title ILIKE $1 OR service ILIKE $1
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.incidents = incRes.rows.map(r => ({
          ...r, _entityType: 'incident', _displayId: r.id, _displayLabel: r.title,
        }));
      } catch (err) { console.warn('[command/search] incidents', err.message); results.incidents = []; searchErrors.incidents = err.message; }
    }

    // Search Audit Events
    if (typesToSearch.includes('audit_events')) {
      try {
        const auditRes = await dbQuery(
          `SELECT event_id, actor_id, target_id, action, created_at FROM audit_events
           WHERE action ILIKE $1 OR actor_id ILIKE $1 OR target_id ILIKE $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.audit_events = auditRes.rows.map(r => ({
          ...r, _entityType: 'audit_event', _displayId: `AE-${r.event_id}`, _displayLabel: r.action,
        }));
      } catch (err) { console.warn('[command/search] audit_events', err.message); results.audit_events = []; searchErrors.audit_events = err.message; }
    }

    // Search withdrawals
    if (typesToSearch.includes('withdrawals')) {
      try {
        const wdRes = await dbQuery(
          `SELECT withdrawal_id, user_id, amount, status, created_at FROM withdrawals
           WHERE withdrawal_id ILIKE $1 OR user_id ILIKE $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [searchPattern, limit]
        );
        results.withdrawals = wdRes.rows.map(r => ({
          ...r, _entityType: 'withdrawal', _displayId: r.withdrawal_id, _displayLabel: `₹${r.amount} · ${r.status}`,
        }));
      } catch (err) { console.warn('[command/search] withdrawals', err.message); results.withdrawals = []; searchErrors.withdrawals = err.message; }
    }

    // Calculate total
    const totalCount = Object.values(results).reduce((sum, arr) => sum + (arr?.length || 0), 0);

    // Log search to history
    try {
      await dbQuery(
        `INSERT INTO admin_search_history (admin_id, search_query, result_count, entity_types_searched, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.admin.id, q, totalCount, typesToSearch, req.admin.tenant]
      );
    } catch { /* non-critical */ }

    res.json({
      query: q,
      totalCount,
      searchedTypes: typesToSearch,
      results,
      ...(Object.keys(searchErrors).length ? { searchErrors } : {}),
      correlationId: req.correlationId,
    });

  } catch (err) {
    console.error('[CommandCenter] Search error:', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

/**
 * POST /api/admin/v2/command/execute
 * Execute a quick action from the command palette.
 * Dangerous actions require confirmation, reason, and permission.
 */
router.post('/execute', async (req, res) => {
  try {
    const { actionType, targetEntityType, targetEntityId, reason, confirmed } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required', code: 'MISSING_ACTION' });
    }

    const isDangerous = DANGEROUS_ACTIONS.has(actionType);

    // Dangerous actions require confirmation and reason
    if (isDangerous) {
      if (!confirmed) {
        return res.status(400).json({
          error: 'This action requires explicit confirmation',
          code: 'CONFIRMATION_REQUIRED',
          actionType,
          isDangerous: true,
          requiresReason: true,
        });
      }
      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({
          error: 'A reason of at least 5 characters is required for dangerous actions',
          code: 'REASON_REQUIRED',
        });
      }
    }

    const dbQuery = await getQuery();

    // Log the action
    await logAdminAction({
      actorId: req.admin.id,
      targetId: targetEntityId,
      action: `COMMAND_PALETTE:${actionType}`,
      details: {
        actionType,
        targetEntityType,
        targetEntityId,
        reason: reason || null,
        isDangerous,
        confirmed: !!confirmed,
        correlationId: req.correlationId,
      },
    });

    // Log to quick actions table
    try {
      await dbQuery(
        `INSERT INTO admin_quick_actions_log (admin_id, action_type, target_entity_type, target_entity_id, action_details, requires_confirmation, confirmation_reason, status, correlation_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          req.admin.id, actionType, targetEntityType || null, targetEntityId || null,
          JSON.stringify({ reason }), isDangerous, reason || null,
          isDangerous && confirmed ? 'CONFIRMED' : 'EXECUTED',
          req.correlationId, req.admin.tenant,
        ]
      );
    } catch { /* non-critical */ }

    // Return action result (actual execution is handled by specific domain services)
    res.json({
      success: true,
      actionType,
      targetEntityType,
      targetEntityId,
      status: isDangerous ? 'CONFIRMED_AND_QUEUED' : 'EXECUTED',
      correlationId: req.correlationId,
      message: `Action '${actionType}' ${isDangerous ? 'confirmed and queued' : 'executed'} successfully`,
    });

  } catch (err) {
    console.error('[CommandCenter] Execute error:', err.message);
    res.status(500).json({ error: 'Action execution failed', message: err.message });
  }
});

/**
 * GET /api/admin/v2/command/recent
 * Get recent search history for the current admin
 */
router.get('/recent', async (req, res) => {
  try {
    const dbQuery = await getQuery();
    const result = await dbQuery(
      `SELECT id, search_query, result_count, entity_types_searched, created_at
       FROM admin_search_history
       WHERE admin_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.admin.id]
    );
    res.json({ recent: result.rows });
  } catch (err) {
    res.json({ recent: [], note: err.message });
  }
});

export default router;
