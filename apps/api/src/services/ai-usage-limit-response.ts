import type { FastifyReply } from 'fastify';
import { AiDailyLimitExceededError } from './ai-usage-limit-service.js';

export function sendAiDailyLimitError(reply: FastifyReply, err: AiDailyLimitExceededError) {
  return reply.code(429).send({
    error: 'Calma, atleta! 😂 Até a IA precisa de descanso. Voltamos amanhã!',
    limit: err.usage.limit,
    used: err.usage.used,
    remaining: err.usage.remaining,
    date: err.usage.dateKey,
  });
}
