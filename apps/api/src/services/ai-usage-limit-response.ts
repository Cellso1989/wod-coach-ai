import type { FastifyReply } from 'fastify';
import { AiDailyLimitExceededError } from './ai-usage-limit-service.js';

export function sendAiDailyLimitError(reply: FastifyReply, err: AiDailyLimitExceededError) {
  return reply.code(429).send({
    error: `Limite diario de ${err.usage.limit} chamadas de IA atingido. Tente novamente amanha.`,
    limit: err.usage.limit,
    used: err.usage.used,
    remaining: err.usage.remaining,
    date: err.usage.dateKey,
  });
}
