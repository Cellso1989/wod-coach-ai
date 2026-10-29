import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../packages/database/dist/index.js';
import { buildApp } from '../../apps/api/src/app.js';
import {
  consumePasswordReset,
  InvalidPasswordResetError,
} from '../../apps/api/src/services/password-reset.js';

// Opt in only against the isolated local database. No real mail or app users are touched.
describe.skipIf(!process.env.PASSWORD_RESET_TEST_DATABASE_URL)(
  'password recovery on PostgreSQL',
  () => {
    let app: ReturnType<typeof buildApp>;
    let adminId: string;
    let athleteId: string;
    let otherId: string;
    let adminHeaders: { authorization: string };
    let athleteHeaders: { authorization: string };
    const email = 'athlete@recovery.example.test';
    const originalPassword = 'correct-password';
    // Public test password above, bcrypt cost 4.
    const originalHash = '$2a$04$.7pz4BmlMXjq9ZnanWYM2e1RWTc7rqjfksptyeL9jJYIBJoz5dNRi';
    const newPassword = 'new-test-password';
    const mail = vi.fn();
    let requestSequence = 1;

    beforeAll(async () => {
      const url = new URL(process.env.PASSWORD_RESET_TEST_DATABASE_URL!);
      if (
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/password_reset_test' ||
        process.env.DATABASE_URL !== url.href
      ) {
        throw new Error('Use the disposable local password_reset_test database');
      }
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('PASSWORD_RESET_BASE_URL', 'https://app.example.test');
      vi.stubEnv('RESEND_API_KEY', 'test-api-key');
      vi.stubEnv('PASSWORD_RESET_FROM', 'Coach <noreply@example.test>');
      vi.stubGlobal('fetch', mail);
      const makeUser = (name: string, userEmail: string, isAdmin = false) =>
        prisma.user.create({
          data: {
            name,
            email: userEmail,
            passwordHash: originalHash,
            accessStatus: 'APPROVED',
            isAdmin,
          },
        });
      adminId = (await makeUser('Owner', 'owner@recovery.example.test', true)).id;
      athleteId = (await makeUser('Athlete', email)).id;
      otherId = (await makeUser('Other athlete', 'other@recovery.example.test')).id;
      app = buildApp();
      await app.ready();
      const session = (id: string) => {
        const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { sub: id }]
          .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
          .join('.');
        const signature = createHmac('sha256', process.env.JWT_SECRET!)
          .update(unsigned)
          .digest('base64url');
        return { authorization: `Bearer ${unsigned}.${signature}` };
      };
      adminHeaders = session(adminId);
      athleteHeaders = session(athleteId);
    });

    beforeEach(async () => {
      mail
        .mockReset()
        .mockImplementation(async () => new Response(JSON.stringify({ id: 'message-id' })));
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('PASSWORD_RESET_BASE_URL', 'https://app.example.test');
      vi.stubEnv('PUBLIC_APP_URL', '');
      vi.stubEnv('RESEND_API_KEY', 'test-api-key');
      vi.stubEnv('PASSWORD_RESET_FROM', 'Coach <noreply@example.test>');
      await prisma.passwordResetToken.deleteMany({
        where: { userId: { in: [adminId, athleteId, otherId] } },
      });
      await prisma.user.update({
        where: { id: athleteId },
        data: { passwordHash: originalHash, accessStatus: 'APPROVED' },
      });
    });

    afterAll(async () => {
      if (athleteId)
        await prisma.user.deleteMany({ where: { id: { in: [adminId, athleteId, otherId] } } });
      if (app) await app.close();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    const forgot = (address = email, origin?: string) =>
      app.inject({
        remoteAddress: `127.0.0.${requestSequence++}`,
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: address },
        headers: origin ? { origin } : {},
      });
    const reset = (token: string, password = newPassword) =>
      app.inject({
        remoteAddress: `127.0.0.${requestSequence++}`,
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token, newPassword: password },
      });
    const sentToken = () => {
      const payload = JSON.parse(mail.mock.calls.at(-1)![1].body);
      return new URL(payload.text.match(/https:\/\/\S+/)![0]).searchParams.get('token')!;
    };
    const adminReset = (id = athleteId, headers = adminHeaders) =>
      app.inject({
        remoteAddress: `127.0.0.${requestSequence++}`,
        method: 'POST',
        url: `/api/admin/users/${id}/password-reset`,
        headers,
      });

    it('emails a one-hour token, stores only its hash, and ignores an untrusted Origin', async () => {
      const response = await forgot(email, 'https://attacker.example.test');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(response.headers['cache-control']).toBe('no-store');
      const token = sentToken();
      expect(token).toHaveLength(43);
      const record = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: athleteId },
      });
      expect(record.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(record.tokenHash).not.toBe(token);
      expect(record.usedAt).toBeNull();
      expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(3_590_000);
      expect(JSON.parse(mail.mock.calls[0]![1].body).text).not.toContain('attacker.example.test');
    });

    it('returns the same public response for an unknown account', async () => {
      expect((await forgot('missing@recovery.example.test')).json()).toEqual(
        (await forgot()).json(),
      );
      expect(mail).toHaveBeenCalledTimes(1);
    });

    it.each(['RESEND_API_KEY', 'PASSWORD_RESET_FROM', 'PASSWORD_RESET_BASE_URL'] as const)(
      'reports unavailable for every account when %s is missing, without issuing tokens',
      async (key) => {
        vi.stubEnv(key, '');
        const existing = await forgot();
        const unknown = await forgot('missing@recovery.example.test');
        expect(existing.statusCode).toBe(503);
        expect(existing.body).toBe(unknown.body);
        expect(mail).not.toHaveBeenCalled();
        expect(await prisma.passwordResetToken.count({ where: { userId: athleteId } })).toBe(0);
      },
    );

    it.each(['rejected', 'network', 'malformed'])(
      'revokes an undeliverable token after a %s failure without disclosing the account',
      async (failure) => {
        if (failure === 'rejected')
          mail.mockResolvedValueOnce(new Response('private-provider-error', { status: 403 }));
        if (failure === 'network') mail.mockRejectedValueOnce(new Error('private-network-error'));
        if (failure === 'malformed') mail.mockResolvedValueOnce(new Response('{}'));
        const response = await forgot();
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
        expect(response.body).not.toContain('private');
        const record = await prisma.passwordResetToken.findFirstOrThrow({
          where: { userId: athleteId },
        });
        expect(record.usedAt).not.toBeNull();
        expect((await reset(sentToken())).statusCode).toBe(400);
      },
    );

    it('only exposes a preview link in explicit development with no email configuration', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('RESEND_API_KEY', '');
      const response = await forgot();
      expect(response.statusCode).toBe(200);
      expect(response.json().devResetUrl).toMatch(
        /^https:\/\/app.example.test\/reset-password\?token=/,
      );
      expect(mail).not.toHaveBeenCalled();
    });

    it('changes the password, prevents reuse, invalidates other links and allows login with the new password', async () => {
      await forgot();
      const first = sentToken();
      await forgot();
      const second = sentToken();
      expect((await reset(first)).statusCode).toBe(200);
      expect((await reset(first)).statusCode).toBe(400);
      expect((await reset(second)).statusCode).toBe(400);
      const login = (password: string) =>
        app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
      expect((await login(originalPassword)).statusCode).toBe(401);
      expect((await login(newPassword)).statusCode).toBe(200);
      expect(
        await prisma.passwordResetToken.count({ where: { userId: athleteId, usedAt: null } }),
      ).toBe(0);
    });

    it.each(['same link', 'different links'])(
      'accepts exactly one simultaneous reset for the same account using %s',
      async (mode) => {
        await forgot();
        const first = sentToken();
        let second = first;
        if (mode === 'different links') {
          await forgot();
          second = sentToken();
        }
        const results = await Promise.all([
          reset(first, 'concurrent-password-one'),
          reset(second, 'concurrent-password-two'),
        ]);
        expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
        const winner =
          results[0]!.statusCode === 200 ? 'concurrent-password-one' : 'concurrent-password-two';
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/auth/login',
              payload: { email, password: winner },
            })
          ).statusCode,
        ).toBe(200);
      },
    );

    it('rejects an expired token and rolls back a failed atomic claim', async () => {
      await forgot();
      const token = sentToken();
      const record = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: athleteId },
      });
      await prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await reset(token)).statusCode).toBe(400);
      await expect(consumePasswordReset(record, 'should-not-be-persisted')).rejects.toBeInstanceOf(
        InvalidPasswordResetError,
      );
      expect((await prisma.user.findUniqueOrThrow({ where: { id: athleteId } })).passwordHash).toBe(
        originalHash,
      );
    });

    it('does not reset a password with malformed input', async () => {
      expect((await reset('invalid')).statusCode).toBe(400);
      await forgot();
      expect((await reset(sentToken(), 'short')).statusCode).toBe(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: athleteId } })).passwordHash).toBe(
        originalHash,
      );
    });

    it('lets only an administrator generate links, without email credentials or changing access', async () => {
      vi.stubEnv('RESEND_API_KEY', '');
      vi.stubEnv('PASSWORD_RESET_FROM', '');
      await prisma.user.update({ where: { id: athleteId }, data: { accessStatus: 'BLOCKED' } });
      const response = await adminReset();
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toMatchObject({
        email,
        resetUrl: expect.stringContaining('/reset-password?token='),
        expiresAt: expect.any(String),
      });
      expect(mail).not.toHaveBeenCalled();
      const token = new URL(response.json().resetUrl).searchParams.get('token')!;
      expect((await reset(token)).statusCode).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: athleteId } })).accessStatus).toBe(
        'BLOCKED',
      );
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email, password: newPassword },
          })
        ).statusCode,
      ).toBe(403);
    });

    it('rejects anonymous users and non-administrators before issuing recovery links', async () => {
      expect((await adminReset(athleteId, { authorization: '' })).statusCode).toBe(401);
      expect((await adminReset(otherId, athleteHeaders)).statusCode).toBe(403);
      expect(
        await prisma.passwordResetToken.count({ where: { userId: { in: [athleteId, otherId] } } }),
      ).toBe(0);
    });

    it('protects administrator accounts and validates the target and configured app address', async () => {
      expect((await adminReset(adminId)).statusCode).toBe(403);
      expect((await adminReset('invalid')).statusCode).toBe(400);
      expect((await adminReset('44444444-4444-4444-8444-444444444444')).statusCode).toBe(404);
      vi.stubEnv('PASSWORD_RESET_BASE_URL', '');
      expect((await adminReset()).statusCode).toBe(503);
    });

    it('limits repeated public recovery requests from the same IP', async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/auth/forgot-password',
              remoteAddress: '192.0.2.1',
              payload: { email: 'missing@recovery.example.test' },
            })
          ).statusCode,
        ).toBe(200);
      }
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/forgot-password',
            remoteAddress: '192.0.2.1',
            payload: { email: 'missing@recovery.example.test' },
          })
        ).statusCode,
      ).toBe(429);
      expect(mail).not.toHaveBeenCalled();
    });
  },
);
