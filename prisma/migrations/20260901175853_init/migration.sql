-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "CrossfitLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "WodSourceType" AS ENUM ('TEXT', 'IMAGE', 'TEXT_AND_IMAGE');

-- CreateEnum
CREATE TYPE "WodFormat" AS ENUM ('AMRAP', 'FOR_TIME', 'EMOM', 'E2MOM', 'CHIPPER', 'ROUNDS_FOR_TIME', 'STRENGTH', 'INTERVAL');

-- CreateEnum
CREATE TYPE "MovementCategory" AS ENUM ('gymnastics', 'weightlifting', 'conditioning', 'monostructural', 'mixed_modal');

-- CreateEnum
CREATE TYPE "StrategyOutcome" AS ENUM ('YES', 'PARTIALLY', 'NO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "heightCm" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "sex" "Sex",
    "crossfitSince" TIMESTAMP(3),
    "level" "CrossfitLevel",
    "competitionCategory" TEXT,
    "weeklyFrequency" INTEGER,
    "goals" TEXT[],
    "injuries" TEXT[],
    "limitedMovements" TEXT[],
    "equipment" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_checkins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sleep" INTEGER NOT NULL,
    "energy" INTEGER NOT NULL,
    "stress" INTEGER NOT NULL,
    "muscleSoreness" INTEGER NOT NULL,
    "jointPain" INTEGER NOT NULL,
    "motivation" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "notes" TEXT,
    "readinessScore" INTEGER NOT NULL,
    "readinessBand" TEXT NOT NULL,
    "cautionFlags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sourceType" "WodSourceType" NOT NULL,
    "rawText" TEXT,
    "imageData" TEXT,
    "imageMimeType" TEXT,
    "name" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wod_analyses" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "format" "WodFormat",
    "durationMinutes" INTEGER,
    "stimulus" TEXT,
    "estimatedIntensity" INTEGER,
    "engineDemand" INTEGER,
    "gripDemand" INTEGER,
    "legDemand" INTEGER,
    "gymnasticsDemand" INTEGER,
    "technicalDemand" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL,
    "warnings" TEXT[],
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wod_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wod_movements" (
    "id" TEXT NOT NULL,
    "wodAnalysisId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MovementCategory" NOT NULL,
    "reps" INTEGER,
    "distanceMeters" INTEGER,
    "loadDescription" TEXT,
    "calories" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wod_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wod_results" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "score" TEXT NOT NULL,
    "timeSeconds" INTEGER,
    "rounds" INTEGER,
    "reps" INTEGER,
    "load" DOUBLE PRECISION,
    "distance" DOUBLE PRECISION,
    "rpe" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wod_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wod_feedbacks" (
    "id" TEXT NOT NULL,
    "wodResultId" TEXT NOT NULL,
    "strategyWorked" "StrategyOutcome",
    "gripScore" INTEGER,
    "legsScore" INTEGER,
    "breathingScore" INTEGER,
    "overallDifficulty" INTEGER,
    "whereItBroke" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wod_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movementName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wod_strategies" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "recommendedIntensity" INTEGER NOT NULL,
    "targetRpe" INTEGER NOT NULL,
    "loadRecommendation" TEXT,
    "pacing" TEXT NOT NULL,
    "restStrategy" TEXT NOT NULL,
    "transitionStrategy" TEXT NOT NULL,
    "energyManagement" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "target" TEXT,
    "criticalPoint" TEXT,
    "breakStrategy" JSONB NOT NULL,
    "movementStrategy" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "warnings" TEXT[],
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wod_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_profiles_userId_key" ON "athlete_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_checkins_userId_date_key" ON "daily_checkins"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "wod_analyses_wodId_key" ON "wod_analyses"("wodId");

-- CreateIndex
CREATE UNIQUE INDEX "wod_results_wodId_key" ON "wod_results"("wodId");

-- CreateIndex
CREATE UNIQUE INDEX "wod_feedbacks_wodResultId_key" ON "wod_feedbacks"("wodResultId");

-- CreateIndex
CREATE INDEX "personal_records_userId_movementName_idx" ON "personal_records"("userId", "movementName");

-- CreateIndex
CREATE UNIQUE INDEX "wod_strategies_wodId_key" ON "wod_strategies"("wodId");

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wods" ADD CONSTRAINT "wods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wod_analyses" ADD CONSTRAINT "wod_analyses_wodId_fkey" FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wod_movements" ADD CONSTRAINT "wod_movements_wodAnalysisId_fkey" FOREIGN KEY ("wodAnalysisId") REFERENCES "wod_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wod_results" ADD CONSTRAINT "wod_results_wodId_fkey" FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wod_feedbacks" ADD CONSTRAINT "wod_feedbacks_wodResultId_fkey" FOREIGN KEY ("wodResultId") REFERENCES "wod_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wod_strategies" ADD CONSTRAINT "wod_strategies_wodId_fkey" FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
