import { z } from 'zod';

export const ANALYSIS_QUEUE_NAME = 'video-analysis';
export const ANALYSIS_JOB_NAME = 'analyze-video';
export const ANALYSIS_JOB_ATTEMPTS = 3;

export const analysisJobDataSchema = z
  .object({
    analysisId: z
      .string()
      .min(20)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/),
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9._-]{8,128}$/u)
      .optional(),
  })
  .strict();

export type AnalysisJobData = z.infer<typeof analysisJobDataSchema>;

/** BullMQ job IDs must not contain a colon. The analysis ID is stable and globally unique. */
export function analysisJobId(analysisId: string): string {
  return `analysis-${analysisJobDataSchema.shape.analysisId.parse(analysisId)}`;
}

export const ANALYSIS_JOB_OPTIONS = {
  attempts: ANALYSIS_JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
} as const;
