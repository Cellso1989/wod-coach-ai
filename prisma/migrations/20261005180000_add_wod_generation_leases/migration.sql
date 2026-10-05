CREATE TABLE "wod_generation_leases" (
    "wodId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wod_generation_leases_pkey" PRIMARY KEY ("wodId")
);

ALTER TABLE "wod_generation_leases" ADD CONSTRAINT "wod_generation_leases_wodId_fkey"
    FOREIGN KEY ("wodId") REFERENCES "wods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
