import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma, type Prisma } from '@wod-coach-ai/database';
import { accessDenied } from '../services/user-access.js';

export const AUTH_COOKIE_NAME = 'wod_coach_ai_token';

// Reuse only within this request. Every protected request still checks the database.
// These are the public session fields plus the timestamp needed for access logging.
const authenticatedUserSelect = {
  id: true,
  email: true,
  name: true,
  accessStatus: true,
  isAdmin: true,
  lastAccessAt: true,
} as const;
type AuthenticatedUser = Prisma.UserGetPayload<{ select: typeof authenticatedUserSelect }>;

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; generationJobId?: string; generationJobToken?: string };
    user: { sub: string; generationJobId?: string; generationJobToken?: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUser: AuthenticatedUser | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not set');
  }

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: AUTH_COOKIE_NAME,
      signed: false,
    },
  });

  app.decorateRequest('authenticatedUser', null);

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Não autenticado' });
    }
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: authenticatedUserSelect,
    });
    if (!user) {
      reply.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
      return reply.code(401).send({ error: 'Não autenticado' });
    }
    const denied = accessDenied(user);
    if (denied) {
      reply.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
      return reply.code(403).send({ error: denied, code: 'ACCESS_DENIED' });
    }
    request.authenticatedUser = user;
  });
});
