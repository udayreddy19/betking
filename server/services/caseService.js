/**
 * Phase 2: Case Service — BetKing Unified Case Management
 * 
 * Full CRUD + workflow operations for cases with audit trail.
 * Connects to PostgreSQL cases, case_notes, case_evidence, case_tasks, case_history tables.
 */

import { query, withTransaction } from '../../db/pg.js';
import { logAdminAction } from '../middleware/auditLogger.js';

const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'ESCALATED', 'RESOLVED', 'CLOSED'];
const VALID_TYPES = ['FRAUD', 'KYC', 'WITHDRAWAL', 'PAYMENT', 'SETTLEMENT', 'SUPPORT_ESCALATION', 'RESPONSIBLE_GAMING', 'SECURITY', 'OPERATIONAL'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function generateId(prefix = 'case') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// SLA deadlines based on priority (hours)
const SLA_HOURS = { LOW: 72, MEDIUM: 24, HIGH: 8, CRITICAL: 2 };

export class CaseService {
  /**
   * Create a new case
   */
  async createCase({ caseType, priority = 'MEDIUM', severity = 'MEDIUM', title, description, userId, entityType, entityId, team, relatedBets, relatedTransactions, relatedTickets, relatedPayments, relatedKyc, createdBy, tenantId = 'betking_in' }) {
    if (!VALID_TYPES.includes(caseType)) throw new Error(`Invalid case type: ${caseType}`);
    if (!VALID_PRIORITIES.includes(priority)) throw new Error(`Invalid priority: ${priority}`);
    if (!title) throw new Error('Case title is required');

    const caseId = generateId('case');
    const slaHours = SLA_HOURS[priority] || 24;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    await query(
      `INSERT INTO cases (case_id, case_type, priority, severity, status, title, description, user_id, entity_type, entity_id, team, sla_deadline, related_bets, related_transactions, related_tickets, related_payments, related_kyc, created_by, tenant_id)
       VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [caseId, caseType, priority, severity, title, description || null, userId || null, entityType || null, entityId || null, team || null, slaDeadline,
       JSON.stringify(relatedBets || []), JSON.stringify(relatedTransactions || []), JSON.stringify(relatedTickets || []), JSON.stringify(relatedPayments || []), JSON.stringify(relatedKyc || []),
       createdBy, tenantId]
    );

    // Record history
    await this._recordHistory(caseId, 'CREATED', createdBy, null, 'OPEN', { caseType, priority, severity, title });

    return { caseId, caseType, priority, severity, status: 'OPEN', title, slaDeadline };
  }

  /**
   * Get case by ID with all related data
   */
  async getCase(caseId) {
    const caseRes = await query('SELECT * FROM cases WHERE case_id = $1', [caseId]);
    if (caseRes.rows.length === 0) throw new Error(`Case ${caseId} not found`);

    const [notesRes, evidenceRes, tasksRes, historyRes] = await Promise.all([
      query('SELECT * FROM case_notes WHERE case_id = $1 ORDER BY created_at ASC', [caseId]),
      query('SELECT * FROM case_evidence WHERE case_id = $1 ORDER BY created_at DESC', [caseId]),
      query('SELECT * FROM case_tasks WHERE case_id = $1 ORDER BY created_at ASC', [caseId]),
      query('SELECT * FROM case_history WHERE case_id = $1 ORDER BY created_at ASC', [caseId]),
    ]);

    return {
      ...caseRes.rows[0],
      notes: notesRes.rows,
      evidence: evidenceRes.rows,
      tasks: tasksRes.rows,
      history: historyRes.rows,
    };
  }

  /**
   * List cases with filters, pagination, sorting
   */
  async listCases({ status, caseType, priority, severity, ownerId, team, userId, page = 1, limit = 25, sortBy = 'created_at', sortDir = 'DESC', tenantId = 'betking_in' }) {
    const conditions = ['tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    if (status) { conditions.push(`status = $${paramIndex++}`); params.push(status); }
    if (caseType) { conditions.push(`case_type = $${paramIndex++}`); params.push(caseType); }
    if (priority) { conditions.push(`priority = $${paramIndex++}`); params.push(priority); }
    if (severity) { conditions.push(`severity = $${paramIndex++}`); params.push(severity); }
    if (ownerId) { conditions.push(`owner_id = $${paramIndex++}`); params.push(ownerId); }
    if (team) { conditions.push(`team = $${paramIndex++}`); params.push(team); }
    if (userId) { conditions.push(`user_id = $${paramIndex++}`); params.push(userId); }

    const allowedSorts = ['created_at', 'updated_at', 'priority', 'severity', 'sla_deadline', 'status'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const safeSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const offset = (page - 1) * limit;
    const whereClause = conditions.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM cases WHERE ${whereClause}`, params),
      query(
        `SELECT case_id, case_type, priority, severity, status, title, user_id, owner_id, team, sla_deadline, created_by, created_at, updated_at
         FROM cases WHERE ${whereClause}
         ORDER BY ${safeSort} ${safeSortDir}
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      ),
    ]);

    return {
      cases: dataRes.rows,
      pagination: {
        page, limit,
        total: parseInt(countRes.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countRes.rows[0].count, 10) / limit),
      },
    };
  }

  /**
   * Update case status
   */
  async updateStatus(caseId, newStatus, actorId, reason) {
    if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

    const existing = await query('SELECT status FROM cases WHERE case_id = $1', [caseId]);
    if (existing.rows.length === 0) throw new Error(`Case ${caseId} not found`);
    const oldStatus = existing.rows[0].status;

    const updates = { status: newStatus, updated_at: 'NOW()' };
    if (newStatus === 'RESOLVED') updates.resolved_at = new Date().toISOString();
    if (newStatus === 'CLOSED') updates.closed_at = new Date().toISOString();

    await query(
      `UPDATE cases SET status = $1, updated_at = NOW(), resolved_at = $3, closed_at = $4 WHERE case_id = $2`,
      [newStatus, caseId, newStatus === 'RESOLVED' ? new Date().toISOString() : null, newStatus === 'CLOSED' ? new Date().toISOString() : null]
    );

    await this._recordHistory(caseId, 'STATUS_CHANGED', actorId, oldStatus, newStatus, { reason });
    return { caseId, oldStatus, newStatus };
  }

  /**
   * Assign or reassign a case
   */
  async assignCase(caseId, ownerId, team, actorId) {
    const existing = await query('SELECT owner_id, team FROM cases WHERE case_id = $1', [caseId]);
    if (existing.rows.length === 0) throw new Error(`Case ${caseId} not found`);

    const oldOwner = existing.rows[0].owner_id;
    await query('UPDATE cases SET owner_id = $1, team = $2, updated_at = NOW() WHERE case_id = $3', [ownerId, team || null, caseId]);

    const action = oldOwner ? 'REASSIGNED' : 'ASSIGNED';
    await this._recordHistory(caseId, action, actorId, oldOwner, ownerId, { team });
    return { caseId, action, oldOwner, newOwner: ownerId, team };
  }

  /**
   * Escalate a case
   */
  async escalateCase(caseId, reason, actorId) {
    await query("UPDATE cases SET status = 'ESCALATED', updated_at = NOW() WHERE case_id = $1", [caseId]);
    await this._recordHistory(caseId, 'ESCALATED', actorId, null, 'ESCALATED', { reason });
    return { caseId, status: 'ESCALATED', reason };
  }

  /**
   * Add a note to a case
   */
  async addNote(caseId, authorId, content, isInternal = true) {
    const noteId = generateId('note');
    await query(
      'INSERT INTO case_notes (note_id, case_id, author_id, content, is_internal) VALUES ($1, $2, $3, $4, $5)',
      [noteId, caseId, authorId, content, isInternal]
    );
    await query('UPDATE cases SET updated_at = NOW() WHERE case_id = $1', [caseId]);
    await this._recordHistory(caseId, 'NOTE_ADDED', authorId, null, null, { noteId, isInternal });
    return { noteId, caseId, authorId, content, isInternal };
  }

  /**
   * Add evidence to a case
   */
  async addEvidence(caseId, { evidenceType, title, description, url, data, uploadedBy }) {
    const evidenceId = generateId('evd');
    await query(
      'INSERT INTO case_evidence (evidence_id, case_id, evidence_type, title, description, url, data, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [evidenceId, caseId, evidenceType, title, description || null, url || null, JSON.stringify(data || {}), uploadedBy]
    );
    await query('UPDATE cases SET updated_at = NOW() WHERE case_id = $1', [caseId]);
    await this._recordHistory(caseId, 'EVIDENCE_ADDED', uploadedBy, null, null, { evidenceId, evidenceType, title });
    return { evidenceId, caseId, evidenceType, title };
  }

  /**
   * Add a task to a case
   */
  async addTask(caseId, { title, description, assigneeId, priority, dueDate, createdBy }) {
    const taskId = generateId('task');
    await query(
      'INSERT INTO case_tasks (task_id, case_id, title, description, assignee_id, priority, due_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [taskId, caseId, title, description || null, assigneeId || null, priority || 'MEDIUM', dueDate || null, createdBy]
    );
    await query('UPDATE cases SET updated_at = NOW() WHERE case_id = $1', [caseId]);
    await this._recordHistory(caseId, 'TASK_ADDED', createdBy, null, null, { taskId, title, assigneeId });
    return { taskId, caseId, title, assigneeId };
  }

  /**
   * Resolve a case
   */
  async resolveCase(caseId, resolution, resolutionType, actorId) {
    await query(
      "UPDATE cases SET status = 'RESOLVED', resolution = $1, resolution_type = $2, resolved_at = NOW(), updated_at = NOW() WHERE case_id = $3",
      [resolution, resolutionType || 'RESOLVED', caseId]
    );
    await this._recordHistory(caseId, 'RESOLVED', actorId, null, 'RESOLVED', { resolution, resolutionType });
    return { caseId, status: 'RESOLVED', resolution };
  }

  /**
   * Close a case
   */
  async closeCase(caseId, actorId) {
    await query("UPDATE cases SET status = 'CLOSED', closed_at = NOW(), updated_at = NOW() WHERE case_id = $1", [caseId]);
    await this._recordHistory(caseId, 'CLOSED', actorId, null, 'CLOSED');
    return { caseId, status: 'CLOSED' };
  }

  /**
   * Reopen a case
   */
  async reopenCase(caseId, reason, actorId) {
    await query("UPDATE cases SET status = 'OPEN', resolved_at = NULL, closed_at = NULL, updated_at = NOW() WHERE case_id = $1", [caseId]);
    await this._recordHistory(caseId, 'REOPENED', actorId, null, 'OPEN', { reason });
    return { caseId, status: 'OPEN', reason };
  }

  /**
   * Internal: Record case history entry
   */
  async _recordHistory(caseId, action, actorId, oldValue, newValue, details = {}) {
    try {
      await query(
        'INSERT INTO case_history (case_id, action, actor_id, old_value, new_value, details) VALUES ($1, $2, $3, $4, $5, $6)',
        [caseId, action, actorId, oldValue || null, newValue || null, JSON.stringify(details)]
      );
    } catch (err) {
      console.error('[CaseService] Failed to record history:', err.message);
    }
  }
}

export const caseService = new CaseService();
