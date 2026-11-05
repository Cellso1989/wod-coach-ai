ALTER TABLE "users" ADD COLUMN "lastAccessAt" TIMESTAMP(3);

CREATE TYPE "UserAccessKind" AS ENUM ('LOGIN', 'SESSION_RETURN', 'CROSSFIT_ANALYSIS', 'HYROX_ANALYSIS');

CREATE TABLE "user_access_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "UserAccessKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_access_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_access_logs_createdAt_id_idx" ON "user_access_logs"("createdAt", "id");
CREATE INDEX "user_access_logs_userId_createdAt_id_idx" ON "user_access_logs"("userId", "createdAt", "id");
ALTER TABLE "user_access_logs" ADD CONSTRAINT "user_access_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
