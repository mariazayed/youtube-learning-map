-- CreateTable
-- Email is nullable while Phase 1 anonymous identities remain supported. PostgreSQL unique
-- indexes allow multiple NULL values, while still protecting every real email address.
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Backfill one user for every existing anonymous owner before adding the required relation.
INSERT INTO "User" ("id", "createdAt", "updatedAt")
SELECT
  "ownerId",
  MIN("createdAt"),
  CURRENT_TIMESTAMP
FROM "VideoAnalysis"
GROUP BY "ownerId";

-- RenameColumn
ALTER TABLE "VideoAnalysis" RENAME COLUMN "ownerId" TO "userId";

-- DropIndex
DROP INDEX "VideoAnalysis_ownerId_cacheKey_key";
DROP INDEX "VideoAnalysis_ownerId_createdAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "VideoAnalysis_userId_cacheKey_key"
  ON "VideoAnalysis"("userId", "cacheKey");
CREATE INDEX "VideoAnalysis_userId_createdAt_idx"
  ON "VideoAnalysis"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "VideoAnalysis"
ADD CONSTRAINT "VideoAnalysis_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraints
-- Prisma introspects these constraints as database-level guarantees even though they are not
-- currently represented in the Prisma schema language.
ALTER TABLE "VideoAnalysis"
ADD CONSTRAINT "VideoAnalysis_progress_check"
CHECK ("progress" BETWEEN 0 AND 100),
ADD CONSTRAINT "VideoAnalysis_durationSeconds_check"
CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0),
ADD CONSTRAINT "VideoAnalysis_promptVersion_check"
CHECK ("promptVersion" > 0),
ADD CONSTRAINT "VideoAnalysis_schemaVersion_check"
CHECK ("schemaVersion" > 0),
ADD CONSTRAINT "VideoAnalysis_attemptCount_check"
CHECK ("attemptCount" >= 0);
