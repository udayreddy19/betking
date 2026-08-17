/**
 * Phase 2: Case Management API Routes — OddsYra Admin
 * Full CRUD + workflow operations for unified case management.
 */

import { Router } from 'express';
import { requirePermission, requireRole } from '../../middleware/adminAuth.js';
import { caseService } from '../../services/caseService.js';

const router = Router();

// GET /api/admin/v2/cases — list cases with filters
router.get('/', async (req, res) => {
  try {
    const result = await caseService.listCases({
      status: req.query.status,
      caseType: req.query.caseType,
      priority: req.query.priority,
      severity: req.query.severity,
      ownerId: req.query.ownerId,
      team: req.query.team,
      userId: req.query.userId,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 25, 100),
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
      tenantId: req.admin.tenant,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list cases', message: err.message });
  }
});

// POST /api/admin/v2/cases — create case
router.post('/', async (req, res) => {
  try {
    const result = await caseService.createCase({ ...req.body, createdBy: req.admin.id, tenantId: req.admin.tenant });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create case', message: err.message });
  }
});

// GET /api/admin/v2/cases/:id — get case detail
router.get('/:id', async (req, res) => {
  try {
    const result = await caseService.getCase(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: 'Case not found', message: err.message });
  }
});

// PUT /api/admin/v2/cases/:id/status — update status
router.put('/:id/status', async (req, res) => {
  try {
    const result = await caseService.updateStatus(req.params.id, req.body.status, req.admin.id, req.body.reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update status', message: err.message });
  }
});

// PUT /api/admin/v2/cases/:id/assign — assign/reassign
router.put('/:id/assign', async (req, res) => {
  try {
    const result = await caseService.assignCase(req.params.id, req.body.ownerId, req.body.team, req.admin.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to assign case', message: err.message });
  }
});

// POST /api/admin/v2/cases/:id/notes — add note
router.post('/:id/notes', async (req, res) => {
  try {
    const result = await caseService.addNote(req.params.id, req.admin.id, req.body.content, req.body.isInternal);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to add note', message: err.message });
  }
});

// POST /api/admin/v2/cases/:id/evidence — add evidence
router.post('/:id/evidence', async (req, res) => {
  try {
    const result = await caseService.addEvidence(req.params.id, { ...req.body, uploadedBy: req.admin.id });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to add evidence', message: err.message });
  }
});

// POST /api/admin/v2/cases/:id/tasks — add task
router.post('/:id/tasks', async (req, res) => {
  try {
    const result = await caseService.addTask(req.params.id, { ...req.body, createdBy: req.admin.id });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to add task', message: err.message });
  }
});

// POST /api/admin/v2/cases/:id/escalate — escalate
router.post('/:id/escalate', async (req, res) => {
  try {
    const result = await caseService.escalateCase(req.params.id, req.body.reason, req.admin.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to escalate case', message: err.message });
  }
});

// POST /api/admin/v2/cases/:id/resolve — resolve
router.post('/:id/resolve', async (req, res) => {
  try {
    const result = await caseService.resolveCase(req.params.id, req.body.resolution, req.body.resolutionType, req.admin.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to resolve case', message: err.message });
  }
});

// POST /api/admin/v2/cases/:id/close — close
router.post('/:id/close', async (req, res) => {
  try {
    const result = await caseService.closeCase(req.params.id, req.admin.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to close case', message: err.message });
  }
});

// POST /api/admin/v2/cases/:id/reopen — reopen
router.post('/:id/reopen', async (req, res) => {
  try {
    const result = await caseService.reopenCase(req.params.id, req.body.reason, req.admin.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to reopen case', message: err.message });
  }
});

export default router;
