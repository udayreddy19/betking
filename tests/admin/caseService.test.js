import { describe, it, expect, beforeAll } from 'vitest';
import { caseService } from '../../server/services/caseService.js';
import { query } from '../../db/pg.js';

describe('CaseService Unit & Integration Tests', () => {
  let createdCaseId = null;

  beforeAll(async () => {
    // Ensure test user exists in DB
    await query(`
      INSERT INTO users (user_id, email, phone, password_hash)
      VALUES ('user_test_case_101', 'casetest@oddsyra.com', '+919999999999', 'hash')
      ON CONFLICT (user_id) DO NOTHING
    `);
  });

  it('should create a new operational case', async () => {
    const caseData = await caseService.createCase({
      caseType: 'WITHDRAWAL',
      priority: 'HIGH',
      severity: 'HIGH',
      title: 'Suspicious Withdrawal Request Audit #W-9901',
      description: 'Automated flag triggered for high withdrawal amount.',
      userId: 'user_test_case_101',
      team: 'FINANCE',
      createdBy: 'admin_unit_tester',
      tenantId: 'oddsyra_in',
    });

    expect(caseData.caseId).toBeDefined();
    expect(caseData.status).toBe('OPEN');
    expect(caseData.priority).toBe('HIGH');
    createdCaseId = caseData.caseId;
  });

  it('should retrieve the created case details', async () => {
    expect(createdCaseId).not.toBeNull();
    const caseDetails = await caseService.getCase(createdCaseId);

    expect(caseDetails.case_id).toBe(createdCaseId);
    expect(caseDetails.title).toContain('Suspicious Withdrawal');
    expect(Array.isArray(caseDetails.history)).toBe(true);
    expect(caseDetails.history.length).toBeGreaterThan(0);
  });

  it('should update status and assign case', async () => {
    expect(createdCaseId).not.toBeNull();
    const assignRes = await caseService.assignCase(createdCaseId, 'fin_admin_1', 'FINANCE', 'admin_unit_tester');
    expect(assignRes.newOwner).toBe('fin_admin_1');

    const statusRes = await caseService.updateStatus(createdCaseId, 'IN_PROGRESS', 'fin_admin_1', 'Starting review');
    expect(statusRes.newStatus).toBe('IN_PROGRESS');
  });

  it('should add notes and evidence to case', async () => {
    expect(createdCaseId).not.toBeNull();
    const note = await caseService.addNote(createdCaseId, 'fin_admin_1', 'Verified user KYC and bank statement.');
    expect(note.noteId).toBeDefined();

    const evd = await caseService.addEvidence(createdCaseId, {
      evidenceType: 'DOCUMENT',
      title: 'Bank Statement PDF',
      uploadedBy: 'fin_admin_1',
    });
    expect(evd.evidenceId).toBeDefined();
  });

  it('should resolve and close case', async () => {
    expect(createdCaseId).not.toBeNull();
    const res = await caseService.resolveCase(createdCaseId, 'Withdrawal verified and cleared.', 'RESOLVED', 'fin_admin_1');
    expect(res.status).toBe('RESOLVED');

    const closeRes = await caseService.closeCase(createdCaseId, 'fin_admin_1');
    expect(closeRes.status).toBe('CLOSED');
  });
});
