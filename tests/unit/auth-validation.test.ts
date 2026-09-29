import { describe, it, expect } from 'vitest';
import { changePasswordSchema, registerSchema, loginSchema } from '@wod-coach-ai/validation';

describe('registerSchema', () => {
  it('accepts valid input and normalizes email', () => {
    const result = registerSchema.parse({
      name: 'Atleta Teste',
      email: 'Athlete@Example.com',
      password: 'supersecret123',
    });

    expect(result.email).toBe('athlete@example.com');
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      name: 'Atleta Teste',
      email: 'athlete@example.com',
      password: 'short',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      name: 'Atleta Teste',
      email: 'not-an-email',
      password: 'supersecret123',
    });

    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'athlete@example.com',
      password: 'anything',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({
      email: 'athlete@example.com',
      password: '',
    });

    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('accepts current password and a strong enough new password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'new-password-123',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a short new password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'short',
    });

    expect(result.success).toBe(false);
  });
});
