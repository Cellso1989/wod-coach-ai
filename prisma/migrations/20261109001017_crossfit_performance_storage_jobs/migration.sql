-- CreateEnum
CREATE TYPE "WodGenerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "wods" ADD COLUMN     "imageSha256" TEXT,
ADD COLUMN     "imageStorageKey" TEXT;

-- CreateTable
CREATE TABLE "wod_generation_jobs" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "WodGenerationJobStatus" NOT NULL DEFAULT 'PENDING',
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "analysisVersionId" TEXT,
    "token" TEXT,
    "measurementId" TEXT,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "statusCode" INTEGER,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wod_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wod_generation_jobs_status_createdAt_idx" ON "wod_generation_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "wod_generation_jobs_wodId_status_idx" ON "wod_generation_jobs"("wodId", "status");

-- CreateIndex
CREATE INDEX "wod_generation_jobs_userId_createdAt_idx" ON "wod_generation_jobs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "wod_generation_jobs" ADD CONSTRAINT "wod_generation_jobs_wodId_fkey" FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wod_generation_jobs" ADD CONSTRAINT "wod_generation_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Queue results are server-only, accessed through authenticated API routes.
ALTER TABLE "wod_generation_jobs" ENABLE ROW LEVEL SECURITY;
