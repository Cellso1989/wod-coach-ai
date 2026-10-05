BEGIN;

CREATE TABLE "wod_analysis_versions" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wod_analysis_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wod_strategy_versions" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "analysisVersionId" TEXT,
    "sourceSnapshot" JSONB NOT NULL,
    "inputSnapshot" JSONB,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wod_strategy_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wod_analyses" ADD COLUMN "versionId" TEXT;
ALTER TABLE "wod_strategies" ADD COLUMN "versionId" TEXT;

CREATE UNIQUE INDEX "wod_analysis_versions_wodId_version_key" ON "wod_analysis_versions"("wodId", "version");
CREATE UNIQUE INDEX "wod_strategy_versions_wodId_version_key" ON "wod_strategy_versions"("wodId", "version");
CREATE INDEX "wod_strategy_versions_analysisVersionId_idx" ON "wod_strategy_versions"("analysisVersionId");
CREATE UNIQUE INDEX "wod_analyses_versionId_key" ON "wod_analyses"("versionId");
CREATE UNIQUE INDEX "wod_strategies_versionId_key" ON "wod_strategies"("versionId");

-- Preserve the state available at migration time. Older overwritten data and
-- the original AI input cannot be reconstructed; do not fabricate them.
INSERT INTO "wod_analysis_versions" ("id", "wodId", "version", "reason", "sourceSnapshot", "snapshot", "createdAt")
SELECT 'legacy-analysis-' || a."id", a."wodId", 1, 'LEGACY',
       jsonb_build_object('id', w."id", 'date', w."date", 'sourceType', w."sourceType",
         'rawText', w."rawText", 'imageData', w."imageData", 'imageMimeType', w."imageMimeType",
         'name', w."name", 'notes', w."notes"),
       (to_jsonb(a) - 'versionId') || jsonb_build_object('movements',
         COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m."order") FROM "wod_movements" m
           WHERE m."wodAnalysisId" = a."id"), '[]'::jsonb)), a."updatedAt"
FROM "wod_analyses" a JOIN "wods" w ON w."id" = a."wodId"
WHERE w."discipline" = 'CROSSFIT';

UPDATE "wod_analyses" a SET "versionId" = v."id"
FROM "wod_analysis_versions" v WHERE v."wodId" = a."wodId";

INSERT INTO "wod_strategy_versions" ("id", "wodId", "version", "analysisVersionId", "sourceSnapshot", "snapshot", "createdAt")
SELECT 'legacy-strategy-' || s."id", s."wodId", 1, NULL,
       jsonb_build_object('id', w."id", 'date', w."date", 'sourceType', w."sourceType",
         'rawText', w."rawText", 'imageData', w."imageData", 'imageMimeType', w."imageMimeType",
         'name', w."name", 'notes', w."notes"),
       to_jsonb(s) - 'versionId', s."updatedAt"
FROM "wod_strategies" s JOIN "wods" w ON w."id" = s."wodId"
WHERE w."discipline" = 'CROSSFIT';

-- Legacy strategies are not linked to an analysis: the old schema cannot
-- prove which analysis produced them (including previously stale strategies).
UPDATE "wod_strategies" s SET "versionId" = v."id"
FROM "wod_strategy_versions" v WHERE v."wodId" = s."wodId";

ALTER TABLE "wod_analysis_versions" ADD CONSTRAINT "wod_analysis_versions_wodId_fkey"
    FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wod_strategy_versions" ADD CONSTRAINT "wod_strategy_versions_wodId_fkey"
    FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wod_strategy_versions" ADD CONSTRAINT "wod_strategy_versions_analysisVersionId_fkey"
    FOREIGN KEY ("analysisVersionId") REFERENCES "wod_analysis_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wod_analyses" ADD CONSTRAINT "wod_analyses_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "wod_analysis_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wod_strategies" ADD CONSTRAINT "wod_strategies_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "wod_strategy_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
