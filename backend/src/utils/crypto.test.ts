import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateSalt } from './crypto';

describe('PBKDF2 Password Hashing', () => {
  describe('hashPassword', () => {
    it('returns consistent output for same inputs', async () => {
      const password = 'test-password';
      const salt = 'a'.repeat(32); // 16 bytes hex
      const hash1 = await hashPassword(password, salt);
      const hash2 = await hashPassword(password, salt);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('produces different hashes for different salts', async () => {
      const password = 'test-password';
      const salt1 = 'a'.repeat(32);
      const salt2 = 'b'.repeat(32);
      const hash1 = await hashPassword(password, salt1);
      const hash2 = await hashPassword(password, salt2);
      expect(hash1).not.toBe(hash2);
    });

    it('completes hashing in under 50ms (10,000 iterations budget)', async () => {
      const password = 'test-password';
      const salt = generateSalt(16);
      const start = performance.now();
      await hashPassword(password, salt);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
      expect(elapsed).toBeGreaterThan(1); // Should take at least 1ms
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      const password = 'correct-password';
      const salt = generateSalt(16);
      const hash = await hashPassword(password, salt);
      const isValid = await verifyPassword(password, hash, salt);
      expect(isValid).toBe(true);
    });

    it('returns false for wrong password', async () => {
      const password = 'correct-password';
      const wrongPassword = 'wrong-password';
      const salt = generateSalt(16);
      const hash = await hashPassword(password, salt);
      const isValid = await verifyPassword(wrongPassword, hash, salt);
      expect(isValid).toBe(false);
    });
  });

  describe('generateSalt', () => {
    it('returns 32-char hex string with length=16', () => {
      const salt = generateSalt(16);
      expect(salt.length).toBe(32);
      expect(salt).toMatch(/^[0-9a-f]+$/);
    });
  });
});
