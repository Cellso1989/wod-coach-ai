import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '@wod-coach-ai/database';

const SESSION_RETURN_INTERVAL_MS = 30 * 60 * 1000;

// Call only after the generated analysis and source updates have been saved successfully.
// Analysis events have no 30-minute throttle and do not alter the last recorded session access.
export async function recordWorkoutAnalysis(
  userId: string,
  discipline: 'CROSSFIT' | 'HYROX',
  log: FastifyBaseLogger,
) {
  const kind = discipline === 'CROSSFIT' ? 'CROSSFIT_ANALYSIS' : 'HYROX_ANALYSIS';
  try {
    await prisma.userAccessLog.create({ data: { userId, kind } });
  } catch {
    // An audit failure must not turn a saved analysis into a failed generation/retry.
    log.error(
      { event: 'workout_analysis_log.failed', userId, kind },
      'Could not record workout analysis',
    );
  }
}

// Session checks run on app opening/visibility, not on every navigation or API call.
export async function recordUserAccess(
  user: { id: string; lastAccessAt: Date | null },
  kind: 'LOGIN' | 'SESSION_RETURN',
  log: FastifyBaseLogger,
) {
  const now = new Date();
  const userId = user.id;
  // The auth handler already read the user: avoid a transaction for repeated visibility checks.
  if (
    kind === 'SESSION_RETURN' &&
    user.lastAccessAt &&
    now.getTime() - user.lastAccessAt.getTime() < SESSION_RETURN_INTERVAL_MS
  )
    return;
  try {
    await prisma.$transaction(async (tx) => {
      // The conditional UPDATE locks the user row and deduplicates concurrent tabs/instances.
      // Login always records an event; returns only record after 30 minutes since the last event.
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          accessStatus: 'APPROVED',
          ...(kind === 'SESSION_RETURN'
            ? {
                OR: [
                  { lastAccessAt: null },
                  { lastAccessAt: { lte: new Date(now.getTime() - SESSION_RETURN_INTERVAL_MS) } },
                ],
              }
            : {}),
        },
        data: { lastAccessAt: now },
      });
      if (updated.count === 0) return;
      await tx.userAccessLog.create({ data: { userId, kind, createdAt: now } });
    });
  } catch {
    // An unavailable audit store must not lock athletes out. Avoid logging credentials or headers.
    log.error({ event: 'user_access_log.failed', userId, kind }, 'Could not record user access');
  }
}
