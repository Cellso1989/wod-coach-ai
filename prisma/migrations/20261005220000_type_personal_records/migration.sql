CREATE TYPE "PersonalRecordType" AS ENUM ('UNKNOWN', 'ONE_RM', 'REP_MAX', 'UNBROKEN_REPS', 'TIME');

ALTER TABLE "personal_records"
ADD COLUMN "recordType" "PersonalRecordType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "repetitions" INTEGER;
