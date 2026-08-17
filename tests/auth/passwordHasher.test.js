import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { hashPassword, verifyPassword, isLegacyHash } from '../../server/auth/passwordHasher.js';

describe('Production Password Hasher Tests (scrypt + legacy upgrade)', () => {
  it('should hash a plaintext password with scrypt and random salt', async () => {
    const rawPassword = 'SecurePassword2026!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash.startsWith('scrypt:')).toBe(true);

    const parts = hash.split(':');
    expect(parts.length).toBe(3);
    expect(parts[1].length).toBe(64); // 32-byte salt in hex
    expect(parts[2].length).toBe(128); // 64-byte keylen in hex
  });

  it('should generate different hashes for the same password due to random salt', async () => {
    const password = 'IdenticalPassword123';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  it('should verify a valid password correctly against its scrypt hash', async () => {
    const password = 'MyCorrectPassword#1';
    const hash = await hashPassword(password);

    const result = await verifyPassword(password, hash);
    expect(result.valid).toBe(true);
    expect(result.needsUpgrade).toBe(false);
  });

  it('should reject an incorrect password against a scrypt hash', async () => {
    const correctPassword = 'RealPassword999';
    const wrongPassword = 'WrongPassword999';
    const hash = await hashPassword(correctPassword);

    const result = await verifyPassword(wrongPassword, hash);
    expect(result.valid).toBe(false);
    expect(result.needsUpgrade).toBe(false);
  });

  it('should verify legacy SHA-256 hash and flag needsUpgrade = true', async () => {
    const password = 'LegacyUserPass2025';
    const legacySha256Hash = crypto.createHash('sha256').update(password).digest('hex');

    expect(isLegacyHash(legacySha256Hash)).toBe(true);

    const result = await verifyPassword(password, legacySha256Hash);
    expect(result.valid).toBe(true);
    expect(result.needsUpgrade).toBe(true);

    const wrongResult = await verifyPassword('wrong_pass', legacySha256Hash);
    expect(wrongResult.valid).toBe(false);
  });

  it('should reject invalid or malformed hash inputs gracefully', async () => {
    expect((await verifyPassword('pass', null)).valid).toBe(false);
    expect((await verifyPassword('pass', '')).valid).toBe(false);
    expect((await verifyPassword('pass', 'scrypt:invalid')).valid).toBe(false);
    expect((await verifyPassword('pass', 'malformed_non_hex')).valid).toBe(false);
  });

  it('should throw error when hashing empty or non-string password', async () => {
    await expect(hashPassword('')).rejects.toThrow('Password must be a non-empty string');
    await expect(hashPassword(null)).rejects.toThrow('Password must be a non-empty string');
  });
});
