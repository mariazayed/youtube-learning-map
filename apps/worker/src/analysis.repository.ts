import { Injectable } from '@nestjs/common';
import { prisma, type VideoAnalysis } from '@learnmap/database';
import type { DetectedLanguage, VideoAnalysisResult } from '@learnmap/contracts';
import type { ClassifiedFailure } from './processing-error';
import type { VerifiedYoutubeMetadata } from './youtube-metadata.service';

export function toDatabaseDetectedLanguage(
  language: DetectedLanguage,
): 'AR' | 'EN' | 'OTHER' {
  return { ar: 'AR', en: 'EN', other: 'OTHER' }[language] as 'AR' | 'EN' | 'OTHER';
}

@Injectable()
export class AnalysisRepository {
  findById(id: string): Promise<VideoAnalysis | null> {
    return prisma.videoAnalysis.findUnique({ where: { id } });
  }

  async beginAttempt(id: string, existingStartedAt: Date | null): Promise<boolean> {
    const result = await prisma.videoAnalysis.updateMany({
      where: { id, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: {
        status: 'PROCESSING',
        progress: 10,
        startedAt: existingStartedAt ?? new Date(),
        completedAt: null,
        attemptCount: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
    });
    return result.count === 1;
  }

  async refreshMetadata(id: string, metadata: VerifiedYoutubeMetadata): Promise<void> {
    await prisma.videoAnalysis.update({
      where: { id },
      data: {
        videoTitle: metadata.title,
        channelTitle: metadata.channelTitle,
        durationSeconds: metadata.durationSeconds,
      },
    });
  }

  async setProgress(id: string, progress: number): Promise<void> {
    await prisma.videoAnalysis.update({ where: { id }, data: { progress } });
  }

  async complete(id: string, result: VideoAnalysisResult, model: string): Promise<void> {
    const detectedLanguage = toDatabaseDetectedLanguage(result.detectedLanguage);
    await prisma.videoAnalysis.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        detectedLanguage,
        summary: result.summary,
        mindMap: result.mindMap,
        provider: 'gemini',
        model,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
      },
    });
  }

  async prepareRetry(id: string): Promise<void> {
    await prisma.videoAnalysis.updateMany({
      where: { id, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'QUEUED', progress: 0, errorCode: null, errorMessage: null },
    });
  }

  async fail(id: string, failure: ClassifiedFailure): Promise<void> {
    await prisma.videoAnalysis.updateMany({
      where: { id, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: {
        status: 'FAILED',
        progress: 0,
        errorCode: failure.code,
        errorMessage: failure.safeMessage,
      },
    });
  }
}
