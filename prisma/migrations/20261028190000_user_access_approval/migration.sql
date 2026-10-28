BEGIN;
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'APPROVED', 'BLOCKED');

-- Preserve access for existing accounts, then require approval for all new ones.
ALTER TABLE "users" ADD COLUMN "accessStatus" "AccessStatus" NOT NULL DEFAULT 'APPROVED',
                    ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "accessStatus" SET DEFAULT 'PENDING';

-- Bind administration to the existing owner's account. Signup cannot grant it.
-- Abort on ambiguous identity instead of selecting an arbitrary account.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "users" WHERE lower(trim("email")) = 'celso.sabino1989@gmail.com') > 1 THEN
    RAISE EXCEPTION 'Ambiguous existing owner account: celso.sabino1989@gmail.com';
  END IF;
  UPDATE "users" SET "isAdmin" = true WHERE lower(trim("email")) = 'celso.sabino1989@gmail.com';
END $$;

CREATE TABLE "user_access_audits" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetEmail" TEXT NOT NULL,
  "fromStatus" "AccessStatus" NOT NULL,
  "toStatus" "AccessStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_access_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_access_audits_targetId_createdAt_idx" ON "user_access_audits"("targetId", "createdAt");

COMMIT;
