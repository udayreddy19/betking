/**
 * Admin Routes Index — OddsYra Admin Operations
 * 
 * Central router that mounts all modular admin route files.
 * Applied middleware: correlationId → adminAuth → auditLogger
 */

import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import { auditLogger } from '../middleware/auditLogger.js';
import { correlationId } from '../middleware/correlationId.js';
import { adminApiRateLimiter, adminMutationRateLimiter } from '../middleware/rateLimiter.js';

const adminRouter = Router();

// Apply middleware stack to all admin routes
adminRouter.use(correlationId);
adminRouter.use(adminAuth);
adminRouter.use(adminApiRateLimiter);
adminRouter.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return adminMutationRateLimiter(req, res, next);
  }
  return next();
});
adminRouter.use(auditLogger);

// ── Mount feature routers ──

// Phase 1: Command Center
import commandCenterRouter from './admin/commandCenter.js';
adminRouter.use('/command', commandCenterRouter);

// IPLSRL operator control desk
import iplsrlRouter from './admin/iplsrl.js';
adminRouter.use('/iplsrl', iplsrlRouter);

// Phase 2: Case Management
import casesRouter from './admin/cases.js';
adminRouter.use('/cases', casesRouter);

// Phase 3: Workflow / Approval Engine
import workflowsRouter from './admin/workflows.js';
adminRouter.use('/workflows', workflowsRouter);

// Phase 4: Business Rule Engine
import rulesRouter from './admin/rules.js';
adminRouter.use('/rules', rulesRouter);

// Phase 5: Entity Timeline
import timelineRouter from './admin/timeline.js';
adminRouter.use('/timeline', timelineRouter);

// Phase 6: Reconciliation Center
import reconciliationRouter from './admin/reconciliation.js';
adminRouter.use('/reconciliation', reconciliationRouter);

// Phase 7: Emergency Operations Center
import emergencyRouter from './admin/emergency.js';
adminRouter.use('/emergency', emergencyRouter);

// Phase 8: Admin Security Center
import securityRouter from './admin/security.js';
adminRouter.use('/security', securityRouter);

// Phase 9: Two-Person Control (Maker-Checker)
import makerCheckerRouter from './admin/makerChecker.js';
adminRouter.use('/maker-checker', makerCheckerRouter);

// Phase 10: Bulk Operations
import bulkRouter from './admin/bulk.js';
adminRouter.use('/bulk', bulkRouter);

// Phase 11: Scheduled Operations
import scheduledRouter from './admin/scheduled.js';
adminRouter.use('/scheduled', scheduledRouter);

// Phase 12: Config Versioning
import configRouter from './admin/config.js';
adminRouter.use('/config', configRouter);

// Phase 13: Data Quality Center
import dataQualityRouter from './admin/dataQuality.js';
adminRouter.use('/data-quality', dataQualityRouter);

// Phase 14: Provider Control Center
import providersRouter from './admin/providers.js';
adminRouter.use('/providers', providersRouter);

// Phase 15: Event Debugger
import eventsRouter from './admin/events.js';
adminRouter.use('/events', eventsRouter);

// Phase 16: Correlation Tracing
import tracesRouter from './admin/traces.js';
adminRouter.use('/traces', tracesRouter);

// Phase 17: Actionable Notifications
import notificationsRouter from './admin/notifications.js';
adminRouter.use('/notifications', notificationsRouter);

// Phase 18: Saved Views
import savedViewsRouter from './admin/savedViews.js';
adminRouter.use('/saved-views', savedViewsRouter);

// Phase 19: My Workspace
import workspaceRouter from './admin/workspace.js';
adminRouter.use('/workspace', workspaceRouter);

// Phase 20: Task Management
import tasksRouter from './admin/tasks.js';
adminRouter.use('/tasks', tasksRouter);

// Phase 21: Financial State Reconstruction
import financialRouter from './admin/financialReconstruction.js';
adminRouter.use('/financial', financialRouter);

import customerDossierRouter from './admin/customerDossier.js';
adminRouter.use(customerDossierRouter);

import kycRouter from './admin/kyc.js';
adminRouter.use('/kyc', kycRouter);

import riskRouter from './admin/risk.js';
adminRouter.use('/risk', riskRouter);

import financeRouter from './admin/finance.js';
adminRouter.use('/finance', financeRouter);

// Phase 22: Odds Pricing Debug
import oddsDebugRouter from './admin/oddsDebug.js';
adminRouter.use('/odds', oddsDebugRouter);

// Phase 3 Operations — Control Tower / Alerts / Incidents / Health / Notifications
import operationsRouter from './admin/operations.js';
adminRouter.use('/operations', operationsRouter);

// OddsEngine V3 Model Health & Intelligence
import oddsModelHealthRouter from './admin/oddsModelHealth.js';
adminRouter.use('/odds-model', oddsModelHealthRouter);

import oddsIntelligenceRouter from './admin/oddsIntelligence.js';
adminRouter.use('/odds-intelligence', oddsIntelligenceRouter);

export default adminRouter;
