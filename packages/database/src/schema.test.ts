import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(__dirname, '..');
const schema = readFileSync(resolve(packageDirectory, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve(
    packageDirectory,
    'prisma/migrations/20260903143000_add_users_and_integrity_constraints/migration.sql',
  ),
  'utf8',
);
const languageMigration = readFileSync(
  resolve(
    packageDirectory,
    'prisma/migrations/20260904170000_add_detected_language/migration.sql',
  ),
  'utf8',
);
const usageMigration = readFileSync(
  resolve(
    packageDirectory,
    'prisma/migrations/20260904190000_add_daily_usage/migration.sql',
  ),
  'utf8',
);
const securityMigration = readFileSync(
  resolve(
    packageDirectory,
    'prisma/migrations/20260905180000_add_security_audit/migration.sql',
  ),
  'utf8',
);
const manifest = JSON.parse(
  readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

describe('Prisma data model', () => {
  it('relates every analysis to a user with cascading deletion', () => {
    expect(schema).toMatch(/model User \{/);
    expect(schema).toMatch(/email\s+String\?\s+@unique/);
    expect(schema).toMatch(/analyses\s+VideoAnalysis\[\]/);
    expect(schema).toMatch(
      /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/,
    );
  });

  it('keeps caching user-scoped and creates the query indexes', () => {
    expect(schema).toContain('@@unique([userId, cacheKey])');
    expect(schema).toContain('@@index([userId, createdAt])');
    expect(schema).toContain('@@index([youtubeVideoId, outputLanguage])');
    expect(schema).toContain('@@index([status])');
  });

  it('stores the detected video language independently from output language', () => {
    expect(schema).toMatch(/enum DetectedLanguage \{[\s\S]*AR[\s\S]*EN[\s\S]*OTHER/);
    expect(schema).toMatch(/outputLanguage\s+OutputLanguage/);
    expect(schema).toMatch(/detectedLanguage\s+DetectedLanguage\?/);
    expect(languageMigration).toContain(
      `CREATE TYPE "DetectedLanguage" AS ENUM ('AR', 'EN', 'OTHER')`,
    );
    expect(languageMigration).toContain('ADD COLUMN "detectedLanguage"');
  });

  it('stores daily usage in a user-owned UTC date ledger', () => {
    expect(schema).toMatch(/model DailyUsage \{/);
    expect(schema).toContain('@@id([userId, usageDate])');
    expect(schema).toMatch(/usageDate\s+DateTime\s+@db\.Date/);
    expect(usageMigration).toContain('CREATE TABLE "DailyUsage"');
    expect(usageMigration).toContain('DailyUsage_analysesCreated_check');
    expect(usageMigration).toContain('ON DELETE CASCADE');
  });

  it('stores pseudonymous administrative audit events without a user relation', () => {
    const auditModel = schema.match(/model AuditEvent \{[\s\S]*?\n\}/u)?.[0] ?? '';
    expect(schema).toMatch(/model AuditEvent \{/);
    expect(schema).toContain('actorHash');
    expect(schema).toContain('targetHash');
    expect(schema).toContain('deduplicationKey');
    expect(auditModel).not.toMatch(/user\s+User/u);
    expect(securityMigration).toContain('CREATE TABLE "AuditEvent"');
    expect(securityMigration).toContain('AuditEvent_deduplicationKey_key');
    expect(securityMigration).toContain('AuditEvent_action_createdAt_idx');
  });
});

describe('forward migration', () => {
  it('backfills users before making the required foreign-key relation', () => {
    const createUser = migration.indexOf('CREATE TABLE "User"');
    const backfill = migration.indexOf('INSERT INTO "User"');
    const rename = migration.indexOf('RENAME COLUMN "ownerId" TO "userId"');
    const foreignKey = migration.indexOf('ADD CONSTRAINT "VideoAnalysis_userId_fkey"');

    expect(createUser).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(createUser);
    expect(rename).toBeGreaterThan(backfill);
    expect(foreignKey).toBeGreaterThan(rename);
  });

  it('enforces numeric integrity in PostgreSQL', () => {
    expect(migration).toContain('CHECK ("progress" BETWEEN 0 AND 100)');
    expect(migration).toContain('CHECK ("durationSeconds" IS NULL');
    expect(migration).toContain('CHECK ("promptVersion" > 0)');
    expect(migration).toContain('CHECK ("schemaVersion" > 0)');
    expect(migration).toContain('CHECK ("attemptCount" >= 0)');
  });
});

describe('migration commands', () => {
  it('uses migrate deploy for production and never db push', () => {
    expect(manifest.scripts['db:deploy']).toBe('prisma migrate deploy');
    expect(Object.values(manifest.scripts).join(' ')).not.toContain('db push');
  });
});
