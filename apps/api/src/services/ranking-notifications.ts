import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export function resultNotificationMessage(name: string): string {
  return `${name} registrou um resultado 👀`;
}

export async function announceRankingResult(
  tx: Prisma.TransactionClient,
  resultId: string,
  actorId: string,
) {
  const actor = await tx.athleteProfile.findUnique({ where: { userId: actorId } });
  if (!actor?.rankingOptIn) return;

  // The unique resultId also deduplicates concurrent first-save requests.
  const announcementId = randomUUID();
  const created = await tx.resultAnnouncement.createMany({
    data: [{ id: announcementId, resultId, actorId }],
    skipDuplicates: true,
  });
  if (!created.count) return;

  const recipients = await tx.user.findMany({
    where: { id: { not: actorId }, athleteProfile: { is: { rankingOptIn: true } } },
    select: { id: true, pushSubscriptions: { select: { id: true } } },
  });
  const notifications = recipients.map((recipient) => ({
    id: randomUUID(),
    announcementId,
    userId: recipient.id,
  }));
  if (!notifications.length) return;
  await tx.rankingNotification.createMany({ data: notifications });
  const deliveries = recipients.flatMap((recipient, index) =>
    recipient.pushSubscriptions.map((subscription) => ({
      notificationId: notifications[index]!.id,
      subscriptionId: subscription.id,
    })),
  );
  if (deliveries.length) await tx.pushDelivery.createMany({ data: deliveries });
}
