import type { FastifyInstance } from 'fastify';
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
import { accessDenied, publicUser } from '../services/user-access.js';
import {
  PASSWORD_RESET_UNAVAILABLE,
  consumePasswordReset,
  createPasswordReset,
  hashResetToken,
  InvalidPasswordResetError,
  passwordResetBaseUrl,
  passwordResetEmailConfiguration,
  sendPasswordResetEmail,
} from '../services/password-reset.js';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

      return reply.code(201).send({
        user: publicUser(user),
        message: 'Cadastro recebido. Aguarde a aprovação do administrador para entrar.',
      });
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

      const denied = accessDenied(user);
      if (denied) return reply.code(403).send({ error: denied, code: 'ACCESS_DENIED' });

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
        return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
      }

      reply.header('Cache-Control', 'no-store');
      const baseUrl = passwordResetBaseUrl();
      const emailConfiguration = passwordResetEmailConfiguration();
      const localPreview = process.env.NODE_ENV === 'development' && !emailConfiguration;
      // Check global configuration before looking up a user: the 503 must not reveal accounts.
      if (!baseUrl || (!emailConfiguration && !localPreview)) {
        request.log.error(
          {
            event: 'password_reset.unavailable',
            baseUrlConfigured: Boolean(baseUrl),
            emailConfigured: Boolean(emailConfiguration),
          },
          'Password reset configuration is missing or invalid',
        );
        return reply.code(503).send({ error: PASSWORD_RESET_UNAVAILABLE });
      }

      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (user) {
        const reset = await createPasswordReset(user.id, baseUrl);
        if (localPreview) return reply.send({ ok: true, devResetUrl: reset.resetUrl });
        const delivery = await sendPasswordResetEmail(
          emailConfiguration!,
          user.email,
          reset.resetUrl,
        );
        if (delivery.ok) {
          request.log.info(
            {
              event: 'password_reset.email_accepted',
              resetId: reset.id,
              messageId: delivery.messageId,
            },
            'Password reset email accepted by provider',
          );
        } else {
          await prisma.passwordResetToken.updateMany({
            where: { id: reset.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          request.log.error(
            {
              event: 'password_reset.email_failed',
              resetId: reset.id,
              reason: delivery.reason,
              status: delivery.status,
            },
            'Password reset email failed; check the email provider',
          );
        }
      }
      // Keep the same response for unknown accounts and provider failures.
      return reply.send({ ok: true });
    },
  );

  app.post(
    '/auth/reset-password',
    { config: { rateLimit: PASSWORD_RESET_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
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
        return reply.code(400).send({ error: 'Link inválido ou expirado' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      try {
        await consumePasswordReset(resetToken, passwordHash);
      } catch (error) {
        if (error instanceof InvalidPasswordResetError) {
          return reply.code(400).send({ error: 'Link inválido ou expirado' });
        }
        throw error;
      }
      reply.header('Cache-Control', 'no-store');
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
