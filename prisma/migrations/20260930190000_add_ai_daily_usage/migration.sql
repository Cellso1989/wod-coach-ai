CREATE TABLE "ai_daily_usages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_daily_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_daily_usages_userId_dateKey_key" ON "ai_daily_usages"("userId", "dateKey");

CREATE INDEX "ai_daily_usages_dateKey_idx" ON "ai_daily_usages"("dateKey");

ALTER TABLE "ai_daily_usages" ADD CONSTRAINT "ai_daily_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
