import type { FastifyInstance } from 'fastify';
import { prisma } from '@wod-coach-ai/database';
import { athleteProfileSchema } from '@wod-coach-ai/validation';

export default async function athleteProfileRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/athlete-profile', async (request, reply) => {
    const profile = await prisma.athleteProfile.findUnique({
      where: { userId: request.user.sub },
    });

    if (!profile) {
      return reply.code(404).send({ error: 'Perfil do atleta não encontrado' });
    }

    return reply.send({ profile });
  });

  app.put('/athlete-profile', async (request, reply) => {
    const parsed = athleteProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const userId = request.user.sub;

    const profile = await prisma.$transaction(async (tx) => {
      const saved = await tx.athleteProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      if (data.rankingOptIn === false) {
        await tx.pushSubscription.deleteMany({ where: { userId } });
        await tx.rankingNotification.deleteMany({ where: { userId } });
        await tx.resultAnnouncement.deleteMany({ where: { actorId: userId } });
      }
      return saved;
    });

    return reply.send({ profile });
  });
}
