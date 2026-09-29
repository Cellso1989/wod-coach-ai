import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@wod-coach-ai/database';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  registerSchema,
  loginSchema,
  resetPasswordSchema,
} from '@wod-coach-ai/validation';
import { AUTH_COOKIE_NAME } from '../plugins/auth.js';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

// Login/registro são o alvo mais óbvio de força bruta — limite bem mais
// apertado que o resto da API (que já tem um limite global mais generoso).
// Aplicado só nestas duas rotas (não em /auth/me, chamada a cada carga de
// página, nem em /auth/logout).
const BRUTE_FORCE_RATE_LIMIT = {
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 100),
  timeWindow: '1 minute',
};

const PASSWORD_RESET_RATE_LIMIT = {
  max: Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX ?? 10),
  timeWindow: '15 minutes',
};

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function buildResetUrl(token: string, fallbackBaseUrl?: string) {
  const configuredBaseUrl = process.env.PASSWORD_RESET_BASE_URL ?? process.env.PUBLIC_APP_URL;
  const fallback =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
      ? undefined
      : fallbackBaseUrl;
  const baseFromEnvOrDev = configuredBaseUrl ?? fallback;
  const baseUrl = baseFromEnvOrDev?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  if (!apiKey || !from) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Redefinir senha do WOD Coach AI',
      text: `Use este link para redefinir sua senha: ${resetUrl}\n\nEste link expira em 1 hora.`,
      html: `<p>Use este link para redefinir sua senha:</p><p><a href="${resetUrl}">Redefinir senha</a></p><p>Este link expira em 1 hora.</p>`,
    }),
  });

  return response.ok;
}

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/register',
    { config: { rateLimit: BRUTE_FORCE_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
      }

      const { name, email, password } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: 'E-mail já cadastrado' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({ data: { name, email, passwordHash } });

      const token = app.jwt.sign({ sub: user.id });
      reply.setCookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });

      return reply.code(201).send({ user: publicUser(user) });
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: BRUTE_FORCE_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
      }

      const token = app.jwt.sign({ sub: user.id });
      reply.setCookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });

      return reply.send({ user: publicUser(user) });
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  app.post(
    '/auth/forgot-password',
    { config: { rateLimit: PASSWORD_RESET_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = forgotPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Dados invÃ¡lidos', details: parsed.error.flatten() });
      }

      const { email } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email } });
      let devResetUrl: string | undefined;

      if (user) {
        const token = randomBytes(32).toString('base64url');
        const origin =
          typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
        const resetUrl = buildResetUrl(token, origin);

        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
          },
        });

        if (resetUrl) {
          const sent = await sendPasswordResetEmail(user.email, resetUrl);
          if (!sent && process.env.NODE_ENV !== 'production') {
            devResetUrl = resetUrl;
          }
          if (!sent && process.env.NODE_ENV === 'production') {
            app.log.warn(
              'Password reset email was not sent because email env is missing or failed',
            );
          }
        }
      }

      return reply.send({ ok: true, devResetUrl });
    },
  );

  app.post(
    '/auth/reset-password',
    { config: { rateLimit: PASSWORD_RESET_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Dados invÃ¡lidos', details: parsed.error.flatten() });
      }

      const { token, newPassword } = parsed.data;
      const tokenHash = hashResetToken(token);
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!resetToken) {
        return reply.code(400).send({ error: 'Link invÃ¡lido ou expirado' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
      ]);

      return reply.send({ ok: true });
    },
  );

  app.post('/auth/change-password', { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return reply.code(404).send({ error: 'Usuário não encontrado' });
    }

    const currentPasswordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentPasswordMatches) {
      return reply.code(401).send({ error: 'Senha atual inválida' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    return reply.send({ ok: true });
  });

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return reply.code(404).send({ error: 'Usuário não encontrado' });
    }
    return reply.send({ user: publicUser(user) });
  });
}
