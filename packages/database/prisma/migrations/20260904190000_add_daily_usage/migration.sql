-- Persistent, concurrency-safe UTC daily quota accounting.
CREATE TABLE "DailyUsage" (
  "userId" TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "analysesCreated" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyUsage_pkey" PRIMARY KEY ("userId", "usageDate"),
  CONSTRAINT "DailyUsage_analysesCreated_check" CHECK ("analysesCreated" >= 0)
);

CREATE INDEX "DailyUsage_usageDate_idx" ON "DailyUsage"("usageDate");

ALTER TABLE "DailyUsage"
  ADD CONSTRAINT "DailyUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
