import { z } from 'zod';
import {
  analysisLanguageSchema,
  detectedLanguageSchema,
  videoAnalysisResultSchema,
} from './video-analysis-result';

export * from './video-analysis-result';
export * from './analysis-job';

export { analysisLanguageSchema as outputLanguageSchema } from './video-analysis-result';
export type { AnalysisLanguage as OutputLanguage } from './video-analysis-result';

export const analysisStatusSchema = z.enum([
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const createAnalysisRequestSchema = z
  .object({
    youtubeUrl: z.string().url().max(500),
    outputLanguage: analysisLanguageSchema,
  })
  .strict();
export type CreateAnalysisRequest = z.infer<typeof createAnalysisRequestSchema>;

export const accountDeletionRequestSchema = z
  .object({ confirmation: z.literal('DELETE') })
  .strict();
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;

export const analysisSchema = z
  .object({
    id: z.string().min(1),
    youtubeVideoId: z.string().min(1),
    youtubeUrl: z.string().url(),
    videoTitle: z.string().nullable(),
    channelTitle: z.string().nullable(),
    thumbnailUrl: z.string().url().nullable(),
    durationSeconds: z.number().int().nonnegative().nullable(),
    outputLanguage: analysisLanguageSchema,
    detectedLanguage: detectedLanguageSchema.nullable(),
    status: analysisStatusSchema,
    progress: z.number().int().min(0).max(100),
    summary: videoAnalysisResultSchema.shape.summary.nullable(),
    mindMap: videoAnalysisResultSchema.shape.mindMap.nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();
export type Analysis = z.infer<typeof analysisSchema>;

export const analysisAcceptedSchema = analysisSchema.pick({
  id: true,
  status: true,
});
export type AnalysisAccepted = z.infer<typeof analysisAcceptedSchema>;

export const analysisStatusResponseSchema = analysisSchema.pick({
  id: true,
  status: true,
  progress: true,
  errorCode: true,
  errorMessage: true,
  completedAt: true,
});
export type AnalysisStatusResponse = z.infer<typeof analysisStatusResponseSchema>;
