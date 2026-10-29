import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  passwordResetBaseUrl,
  passwordResetEmailConfiguration,
  sendPasswordResetEmail,
} from '../../apps/api/src/services/password-reset.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('password recovery configuration and email transport', () => {
  it.each([
    '',
    'http://app.example.test',
    'javascript:alert(1)',
    'https://user:password@app.example.test',
    'https://app.example.test?token=x',
    'https://app.example.test/#fragment',
    'https://app.example.test/some-path',
  ])('rejects an unsafe or missing production base URL: %s', (url) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PASSWORD_RESET_BASE_URL', url);
    vi.stubEnv('PUBLIC_APP_URL', '');
    expect(passwordResetBaseUrl()).toBeNull();
  });

  it('supports a configured app URL and normalizes the trailing slash', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PASSWORD_RESET_BASE_URL', '  https://app.example.test/  ');
    expect(passwordResetBaseUrl()).toBe('https://app.example.test');
  });

  it('only supplies a local fallback in explicit development mode', () => {
    vi.stubEnv('PASSWORD_RESET_BASE_URL', '');
    vi.stubEnv('PUBLIC_APP_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(passwordResetBaseUrl()).toBe('http://localhost:5173');
    vi.stubEnv('NODE_ENV', 'test');
    expect(passwordResetBaseUrl()).toBeNull();
  });

  it('treats blank email credentials as missing', () => {
    vi.stubEnv('RESEND_API_KEY', '   ');
    vi.stubEnv('PASSWORD_RESET_FROM', 'noreply@example.test');
    expect(passwordResetEmailConfiguration()).toBeNull();
  });

  const configuration = { apiKey: 'test-api-key', from: 'Coach <noreply@example.test>' };
  const resetUrl = 'https://app.example.test/reset-password?token=example-token';

  it('sends text and HTML instructions with a bounded request and returns a tracking ID', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'message-id' })));
    vi.stubGlobal('fetch', fetch);
    expect(await sendPasswordResetEmail(configuration, 'athlete@example.test', resetUrl)).toEqual({
      ok: true,
      messageId: 'message-id',
    });
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ from: configuration.from, to: 'athlete@example.test' });
    expect(body.text).toContain(resetUrl);
    expect(body.text).toContain('1 hora');
    expect(body.html).toContain('Criar nova senha');
  });

  it('reports rejection without returning or consuming sensitive provider error text', async () => {
    const json = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json }));
    expect(await sendPasswordResetEmail(configuration, 'athlete@example.test', resetUrl)).toEqual({
      ok: false,
      reason: 'provider_rejected',
      status: 403,
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('handles a network failure or timeout without exposing the exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('contains-sensitive-data')));
    expect(await sendPasswordResetEmail(configuration, 'athlete@example.test', resetUrl)).toEqual({
      ok: false,
      reason: 'network_error',
    });
  });

  it('does not claim acceptance for an invalid provider success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    expect(await sendPasswordResetEmail(configuration, 'athlete@example.test', resetUrl)).toEqual({
      ok: false,
      reason: 'invalid_response',
      status: 200,
    });
  });
});
