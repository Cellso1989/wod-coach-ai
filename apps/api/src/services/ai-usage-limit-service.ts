import { randomUUID } from 'node:crypto';
import { prisma } from '@wod-coach-ai/database';

const DEFAULT_DAILY_LIMIT = 3;
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export interface AiDailyUsageResult {
  limit: number;
  used: number;
  remaining: number;
  dateKey: string;
}

export class AiDailyLimitExceededError extends Error {
  constructor(readonly usage: AiDailyUsageResult) {
    super('Limite diario de analises atingido');
  }
}

function getDailyLimit() {
  const parsed = Number(process.env.AI_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_DAILY_LIMIT;
}

function getDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.AI_DAILY_LIMIT_TIME_ZONE || DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function buildUsageResult(count: number, limit: number, dateKey: string): AiDailyUsageResult {
  return {
    limit,
    used: count,
    remaining: Math.max(limit - count, 0),
    dateKey,
  };
}

export async function consumeAiDailyUsage(userId: string): Promise<AiDailyUsageResult> {
  const limit = getDailyLimit();
  const dateKey = getDateKey();

  if (limit === 0) {
    throw new AiDailyLimitExceededError(buildUsageResult(0, limit, dateKey));
  }

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "ai_daily_usages" ("id", "userId", "dateKey", "count", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, ${dateKey}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "dateKey") DO UPDATE
    SET "count" = "ai_daily_usages"."count" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "ai_daily_usages"."count" < ${limit}
    RETURNING "count"
  `;

  const consumed = rows[0];
  if (consumed) {
    return buildUsageResult(consumed.count, limit, dateKey);
  }

  const currentRows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT "count"
    FROM "ai_daily_usages"
    WHERE "userId" = ${userId}
      AND "dateKey" = ${dateKey}
    LIMIT 1
  `;
  throw new AiDailyLimitExceededError(
    buildUsageResult(currentRows[0]?.count ?? limit, limit, dateKey),
  );
}
