-- AlterTable
ALTER TABLE "daily_checkins" DROP COLUMN "sleep",
DROP COLUMN "energy",
DROP COLUMN "stress",
DROP COLUMN "muscleSoreness",
DROP COLUMN "jointPain",
DROP COLUMN "motivation",
DROP COLUMN "readinessScore",
DROP COLUMN "readinessBand",
DROP COLUMN "cautionFlags",
ADD COLUMN "timeSeconds" INTEGER,
ADD COLUMN "rounds" INTEGER,
ADD COLUMN "reps" INTEGER;
