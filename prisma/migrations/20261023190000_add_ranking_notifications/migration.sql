-- CreateTable
CREATE TABLE "result_announcements" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_notifications" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ranking_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "result_announcements_resultId_key" ON "result_announcements"("resultId");

-- CreateIndex
CREATE INDEX "ranking_notifications_userId_createdAt_idx" ON "ranking_notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_notifications_announcementId_userId_key" ON "ranking_notifications"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "push_deliveries_finishedAt_nextAttemptAt_idx" ON "push_deliveries"("finishedAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_deliveries_notificationId_subscriptionId_key" ON "push_deliveries"("notificationId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "result_announcements" ADD CONSTRAINT "result_announcements_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "wod_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_announcements" ADD CONSTRAINT "result_announcements_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_notifications" ADD CONSTRAINT "ranking_notifications_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "result_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_notifications" ADD CONSTRAINT "ranking_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "ranking_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
