import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@wod-coach-ai/database';

import { z } from 'zod';
async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { isAdmin: true },
  });

  if (!user || !user.isAdmin) {
    return reply.code(403).send({ error: 'Acesso restrito ao administrador' });
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.addHook('preHandler', requireAdmin);

  app.patch('/admin/users/:id/access', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z
      .object({ status: z.enum(['APPROVED', 'BLOCKED']) })
      .strict()
      .safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub } });
    // Serializable transaction makes state changes and their audit atomic, including concurrent requests.
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const target = await tx.user.findUnique({ where: { id: params.data.id } });
          if (!target) return { error: 'Usuário não encontrado', status: 404 } as const;
          if (target.isAdmin || target.id === actor.id) {
            return {
              error: 'O acesso do administrador não pode ser alterado.',
              status: 403,
            } as const;
          }
          if (target.accessStatus === body.data.status) return { user: target };
          const user = await tx.user.update({
            where: { id: target.id },
            data: { accessStatus: body.data.status },
          });
          await tx.userAccessAudit.create({
            data: {
              actorId: actor.id,
              actorEmail: actor.email,
              targetId: target.id,
              targetEmail: target.email,
              fromStatus: target.accessStatus,
              toStatus: body.data.status,
            },
          });
          return { user };
        },
        { isolationLevel: 'Serializable' },
      );
      if (result.error) return reply.code(result.status).send({ error: result.error });
      return reply.send({ user: { id: result.user.id, accessStatus: result.user.accessStatus } });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2034') {
        return reply.code(409).send({
          error: 'O acesso foi alterado por outra solicitação. Recarregue e tente novamente.',
        });
      }
      throw error;
    }
  });

  app.get('/admin/users', async (_request, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        accessStatus: true,
        isAdmin: true,
        createdAt: true,
      },
    });
    const accessHistory = await prisma.userAccessAudit.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return reply.send({ users, accessHistory });
  });
}
