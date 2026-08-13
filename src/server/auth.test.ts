import { describe, expect, it } from 'vitest';
import { hashPassword, normalizeEmail, validateRegistration } from './auth';

describe('account validation', () => {
  it('normalizes emails and requires long passwords', () => {
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
    expect(validateRegistration({ email: 'user@example.com', displayName: 'User', password: 'too-short' })).toHaveProperty('error');
    expect(validateRegistration({ email: 'user@example.com', displayName: 'User', password: 'a secure password' })).not.toHaveProperty('error');
  });

  it('stores a salted password hash rather than the password', async () => {
    const hash = await hashPassword('a secure password');
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('a secure password');
  });
});
