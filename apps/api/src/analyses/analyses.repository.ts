import { Injectable } from '@nestjs/common';
import {
  Prisma,
  prisma,
  type OutputLanguage,
  type VideoAnalysis,
} from '@learnmap/database';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AuditService } from '../audit/audit.service';

export type CreateQueuedAnalysis = {
  userId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  videoTitle: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  outputLanguage: OutputLanguage;
  promptVersion: number;
  schemaVersion: number;
  cacheKey: string;
};

export class DailyAnalysisLimitExceededError extends Error {
  constructor(readonly limit: number) {
    super(`Daily analysis limit of ${limit} reached.`);
    this.name = 'DailyAnalysisLimitExceededError';
  }
}

type DailyUsageRow = { analysesCreated: number };

@Injectable()
export class AnalysesRepository {
  constructor(private readonly audit: AuditService) {}

  async upsertUser(user: AuthenticatedUser): Promise<void> {
    const profile: { email?: string; name?: string } = {};
    if (user.email) profile.email = user.email;
    if (user.name) profile.name = user.name;
    await prisma.user.upsert({
      where: { id: user.id },
      create: { id: user.id, ...profile },
      update: profile,
    });
  }

  findByCacheKey(userId: string, cacheKey: string): Promise<VideoAnalysis | null> {
    return prisma.videoAnalysis.findUnique({
      where: { userId_cacheKey: { userId, cacheKey } },
    });
  }

  async createQueuedWithinDailyLimit(
    data: CreateQueuedAnalysis,
    dailyLimit: number,
    usageDate: Date,
  ): Promise<{ analysis: VideoAnalysis; created: boolean }> {
    const usageDay = usageDate.toISOString().slice(0, 10);
    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.videoAnalysis.findUnique({
          where: { userId_cacheKey: { userId: data.userId, cacheKey: data.cacheKey } },
        });
        if (existing) return { analysis: existing, created: false };

        const usage = await transaction.$queryRaw<DailyUsageRow[]>`
          INSERT INTO "DailyUsage" (
            "userId", "usageDate", "analysesCreated", "createdAt", "updatedAt"
          ) VALUES (${data.userId}, ${usageDay}::date, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("userId", "usageDate") DO UPDATE
          SET "analysesCreated" = "DailyUsage"."analysesCreated" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "DailyUsage"."analysesCreated" < ${dailyLimit}
          RETURNING "analysesCreated"
        `;
        if (usage.length !== 1) throw new DailyAnalysisLimitExceededError(dailyLimit);

        const analysis = await transaction.videoAnalysis.create({ data });
        await this.audit.recordWithClient(transaction, {
          actorId: data.userId,
          action: 'ANALYSIS_CREATED',
          targetType: 'video_analysis',
          targetId: analysis.id,
        });
        return { analysis, created: true };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByCacheKey(data.userId, data.cacheKey);
        if (existing) return { analysis: existing, created: false };
      }
      throw error;
    }
  }

  listOwned(userId: string): Promise<VideoAnalysis[]> {
    return prisma.videoAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findOwned(userId: string, id: string): Promise<VideoAnalysis | null> {
    return prisma.videoAnalysis.findFirst({ where: { id, userId } });
  }

  async requeueFailed(userId: string, id: string): Promise<VideoAnalysis | null> {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.videoAnalysis.updateMany({
        where: { id, userId, status: 'FAILED' },
        data: {
          status: 'QUEUED',
          progress: 0,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
        },
      });
      if (updated.count !== 1) return null;
      const analysis = await transaction.videoAnalysis.findUnique({ where: { id } });
      if (!analysis) return null;
      await this.audit.recordWithClient(transaction, {
        actorId: userId,
        action: 'ANALYSIS_RETRIED',
        targetType: 'video_analysis',
        targetId: id,
      });
      return analysis;
    });
  }

  async markQueueFailure(userId: string, id: string): Promise<void> {
    await prisma.videoAnalysis.updateMany({
      where: { id, userId, status: 'QUEUED' },
      data: {
        status: 'FAILED',
        progress: 0,
        errorCode: 'QUEUE_UNAVAILABLE',
        errorMessage: 'Analysis could not be queued. Please retry later.',
      },
    });
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const deleted = await transaction.videoAnalysis.deleteMany({
        where: { id, userId },
      });
      if (deleted.count !== 1) return false;
      await this.audit.recordWithClient(transaction, {
        actorId: userId,
        action: 'ANALYSIS_DELETED',
        targetType: 'video_analysis',
        targetId: id,
      });
      return true;
    });
  }
}
