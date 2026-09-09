import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeWhatsAppPhone,
  BUILTIN_ADMIN_TEMPLATES,
  kapsoService
} from '../server/services/kapsoService.js';

describe('Kapso WhatsApp Integration Service', () => {
  describe('Phone Number Normalization (E.164)', () => {
    it('normalizes a standard 10-digit Indian number by prefixing 91', () => {
      expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210');
    });

    it('cleans formatting with spaces, dashes, and leading plus', () => {
      expect(normalizeWhatsAppPhone('+91 98765-43210')).toBe('919876543210');
      expect(normalizeWhatsAppPhone('+1 (555) 234-5678')).toBe('15552345678');
    });

    it('preserves complete international numbers with existing country code', () => {
      expect(normalizeWhatsAppPhone('919876543210')).toBe('919876543210');
      expect(normalizeWhatsAppPhone('447123456789')).toBe('447123456789');
    });

    it('throws error for invalid lengths (< 10 or > 15)', () => {
      expect(() => normalizeWhatsAppPhone('12345')).toThrow(/Invalid phone number length/);
      expect(() => normalizeWhatsAppPhone('123456789012345678')).toThrow(/Invalid phone number length/);
    });

    it('throws error for empty or non-string inputs', () => {
      expect(() => normalizeWhatsAppPhone('')).toThrow(/Phone number must be a non-empty string/);
      expect(() => normalizeWhatsAppPhone(null)).toThrow(/Phone number must be a non-empty string/);
    });
  });

  describe('Built-in Operational Templates', () => {
    it('has required administrative templates registered', () => {
      const names = BUILTIN_ADMIN_TEMPLATES.map((t) => t.name);
      expect(names).toContain('oddsyra_support_update');
      expect(names).toContain('oddsyra_kyc_reminder');
      expect(names).toContain('oddsyra_withdrawal_status');
      expect(names).toContain('oddsyra_deposit_help');
      expect(names).toContain('oddsyra_vip_exclusive');
    });

    it('each template has valid category, parameters, and sample text', () => {
      BUILTIN_ADMIN_TEMPLATES.forEach((t) => {
        expect(['UTILITY', 'MARKETING', 'AUTHENTICATION']).toContain(t.category);
        expect(Array.isArray(t.parameters)).toBe(true);
        expect(t.sampleText).toBeTruthy();
        t.parameters.forEach((p) => {
          expect(p.key).toBeTruthy();
          expect(p.label).toBeTruthy();
        });
      });
    });
  });

  describe('Kapso Service Operations & Sandbox Fallback', () => {
    beforeEach(() => {
      // Ensure clean env for testing sandbox fallback
      delete process.env.KAPSO_API_KEY;
      delete process.env.KAPSO_PHONE_NUMBER_ID;
      kapsoService.reloadConfig();
    });

    it('reports sandbox mode when API credentials are unset', () => {
      const status = kapsoService.getStatus();
      expect(status.configured).toBe(false);
      expect(status.mode).toBe('MOCK_SANDBOX');
    });

    it('simulates text message send in mock sandbox mode safely', async () => {
      const result = await kapsoService.sendTextMessage({
        to: '9876543210',
        body: 'Hello player, your withdrawal has been verified.',
        adminId: 'admin_test_1',
        userId: 'usr_123'
      });

      expect(result.success).toBe(true);
      expect(result.mock).toBe(true);
      expect(result.status).toBe('MOCK_SENT');
      expect(result.recipient).toBe('919876543210');
      expect(result.body).toBe('Hello player, your withdrawal has been verified.');
      expect(result.logId).toMatch(/^wal_/);
    });

    it('simulates template message send and interpolates parameters in mock mode', async () => {
      const result = await kapsoService.sendTemplateMessage({
        to: '+91 98765 43210',
        templateName: 'oddsyra_kyc_reminder',
        parameters: ['Uday', 'PAN Card'],
        adminId: 'admin_test_1',
        userId: 'usr_123'
      });

      expect(result.success).toBe(true);
      expect(result.mock).toBe(true);
      expect(result.status).toBe('MOCK_SENT');
      expect(result.recipient).toBe('919876543210');
      expect(result.body).toContain('Hello Uday');
      expect(result.body).toContain('PAN Card');
    });

    it('lists all templates seamlessly', async () => {
      const templates = await kapsoService.listTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(5);
      expect(templates.some((t) => t.name === 'oddsyra_support_update')).toBe(true);
    });

    it('rejects sending when required parameters are missing', async () => {
      await expect(
        kapsoService.sendTextMessage({ to: '', body: 'Hi', adminId: 'admin' })
      ).rejects.toThrow(/Recipient phone number is required/);

      await expect(
        kapsoService.sendTextMessage({ to: '9876543210', body: '', adminId: 'admin' })
      ).rejects.toThrow(/Message body is required/);

      await expect(
        kapsoService.sendTextMessage({ to: '9876543210', body: 'Hi', adminId: '' })
      ).rejects.toThrow(/Admin ID is required/);
    });
  });
});
