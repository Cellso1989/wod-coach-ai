CREATE TYPE "WorkoutDiscipline" AS ENUM ('CROSSFIT', 'HYROX');

ALTER TABLE "wods"
ADD COLUMN "discipline" "WorkoutDiscipline" NOT NULL DEFAULT 'CROSSFIT';

CREATE TABLE "hyrox_strategies" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "workoutSummary" TEXT NOT NULL,
    "target" TEXT,
    "runPace" TEXT,
    "pacing" TEXT NOT NULL,
    "blockPlan" JSONB NOT NULL,
    "breakStrategy" JSONB NOT NULL,
    "transitionStrategy" TEXT NOT NULL,
    "criticalRisk" TEXT NOT NULL,
    "finalPush" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "warnings" TEXT[],
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hyrox_strategies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hyrox_strategies_wodId_key" ON "hyrox_strategies"("wodId");

ALTER TABLE "hyrox_strategies"
ADD CONSTRAINT "hyrox_strategies_wodId_fkey"
FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
