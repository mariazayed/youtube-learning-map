-- Append-only, pseudonymous security and administrative audit events.
CREATE TYPE "AuditAction" AS ENUM (
  'ANALYSIS_CREATED',
  'ANALYSIS_RETRIED',
  'ANALYSIS_DELETED',
  'ACCOUNT_DELETED',
  'RETENTION_PURGE',
  'SECRET_ROTATION_DEPLOYED'
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorHash" VARCHAR(64),
  "action" "AuditAction" NOT NULL,
  "targetType" VARCHAR(50) NOT NULL,
  "targetHash" VARCHAR(64),
  "deduplicationKey" VARCHAR(64),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditEvent_deduplicationKey_key"
  ON "AuditEvent"("deduplicationKey");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_actorHash_createdAt_idx"
  ON "AuditEvent"("actorHash", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx"
  ON "AuditEvent"("action", "createdAt");
