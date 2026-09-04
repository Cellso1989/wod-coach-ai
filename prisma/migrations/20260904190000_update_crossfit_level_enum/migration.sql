-- Replace the CrossfitLevel enum (BEGINNER/INTERMEDIATE/ADVANCED/COMPETITOR)
-- with CrossFit's standard scaling terms (SCALED/INTERMEDIATE/RX/ELITE).
-- Existing rows whose value has no clear equivalent in the new set
-- (BEGINNER, ADVANCED, COMPETITOR) are set to NULL rather than guessed at
-- automatically — the athlete picks the right one again next time they
-- save their profile. Only INTERMEDIATE maps 1:1 and is preserved.

CREATE TYPE "CrossfitLevel_new" AS ENUM ('SCALED', 'INTERMEDIATE', 'RX', 'ELITE');

ALTER TABLE "athlete_profiles"
  ALTER COLUMN "level" TYPE "CrossfitLevel_new"
  USING (
    CASE "level"::text
      WHEN 'INTERMEDIATE' THEN 'INTERMEDIATE'
      ELSE NULL
    END
  )::"CrossfitLevel_new";

DROP TYPE "CrossfitLevel";
ALTER TYPE "CrossfitLevel_new" RENAME TO "CrossfitLevel";
