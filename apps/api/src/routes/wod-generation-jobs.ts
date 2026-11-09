import type { FastifyInstance } from 'fastify';
import { prisma } from '@wod-coach-ai/database';

export default async function generationJobRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.get('/wod-generation-jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.wodGenerationJob.findFirst({
      where: {
        id,
        userId: request.user.sub,
        wod: { userId: request.user.sub, discipline: 'CROSSFIT' },
      },
      select: { status: true, statusCode: true, result: true, expiresAt: true },
    });
    if (!job) return reply.code(404).send({ error: 'Geração não encontrada' });
    const { expiresAt, ...result } = job;
    if (
      (job.status === 'PENDING' || job.status === 'RUNNING') &&
      expiresAt &&
      expiresAt <= new Date()
    ) {
      return reply
        .header('Cache-Control', 'private, no-store')
        .send({
          status: 'FAILED',
          statusCode: 504,
          result: { error: 'A geração expirou. Atualize o treino antes de tentar novamente.' },
        });
    }
    return reply.header('Cache-Control', 'private, no-store').send(result);
  });
}
