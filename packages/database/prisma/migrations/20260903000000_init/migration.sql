-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutputLanguage" AS ENUM ('AR', 'EN');

-- CreateTable
CREATE TABLE "VideoAnalysis" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "youtubeVideoId" TEXT NOT NULL,
  "youtubeUrl" TEXT NOT NULL,
  "videoTitle" TEXT,
  "channelTitle" TEXT,
  "thumbnailUrl" TEXT,
  "durationSeconds" INTEGER,
  "outputLanguage" "OutputLanguage" NOT NULL,
  "status" "AnalysisStatus" NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "mindMap" JSONB,
  "provider" TEXT,
  "model" TEXT,
  "promptVersion" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoAnalysis_ownerId_cacheKey_key" ON "VideoAnalysis"("ownerId", "cacheKey");
CREATE INDEX "VideoAnalysis_ownerId_createdAt_idx" ON "VideoAnalysis"("ownerId", "createdAt");
CREATE INDEX "VideoAnalysis_status_idx" ON "VideoAnalysis"("status");
CREATE INDEX "VideoAnalysis_youtubeVideoId_outputLanguage_idx" ON "VideoAnalysis"("youtubeVideoId", "outputLanguage");
