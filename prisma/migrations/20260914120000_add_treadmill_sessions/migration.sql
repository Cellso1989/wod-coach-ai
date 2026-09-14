-- CreateTable
CREATE TABLE "treadmill_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "blocks" JSONB NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treadmill_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "treadmill_sessions" ADD CONSTRAINT "treadmill_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
