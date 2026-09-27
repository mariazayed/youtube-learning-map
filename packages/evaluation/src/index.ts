import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const languageSchema = z.enum(['ar', 'en']);
const durationClassSchema = z.enum(['short', 'long']);
const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);

export const evaluationVideoSchema = z
  .object({
    id: z.string().regex(/^(ar|en)-(short|long)-0[1-5]$/u),
    youtubeVideoId: videoIdSchema,
    youtubeUrl: z.string().url(),
    sourceLanguage: languageSchema,
    outputLanguage: languageSchema,
    durationClass: durationClassSchema,
    title: z.string().trim().min(1).max(200),
    topic: z.string().trim().min(1).max(100),
    checkedAt: z.iso.date(),
  })
  .strict()
  .superRefine((video, context) => {
    const canonical = `https://www.youtube.com/watch?v=${video.youtubeVideoId}`;
    if (video.youtubeUrl !== canonical) {
      context.addIssue({
        code: 'custom',
        path: ['youtubeUrl'],
        message: 'Evaluation URLs must be canonical YouTube URLs.',
      });
    }
    if (video.sourceLanguage !== video.outputLanguage) {
      context.addIssue({
        code: 'custom',
        path: ['outputLanguage'],
        message: 'The baseline evaluates each source in its own language.',
      });
    }
  });

export const evaluationDatasetSchema = z
  .object({
    version: z.number().int().positive(),
    promptVersion: z.number().int().positive(),
    schemaVersion: z.number().int().positive(),
    shortMaximumSeconds: z.number().int().positive(),
    maximumSeconds: z.number().int().positive(),
    videos: z.array(evaluationVideoSchema).length(20),
  })
  .strict()
  .superRefine((dataset, context) => {
    if (dataset.shortMaximumSeconds >= dataset.maximumSeconds) {
      context.addIssue({
        code: 'custom',
        path: ['shortMaximumSeconds'],
        message: 'The short threshold must be below the maximum duration.',
      });
    }
    const ids = new Set<string>();
    const videoIds = new Set<string>();
    for (const [index, video] of dataset.videos.entries()) {
      if (ids.has(video.id) || videoIds.has(video.youtubeVideoId)) {
        context.addIssue({
          code: 'custom',
          path: ['videos', index],
          message: 'Evaluation entries and YouTube videos must be unique.',
        });
      }
      ids.add(video.id);
      videoIds.add(video.youtubeVideoId);
    }
    for (const language of languageSchema.options) {
      for (const durationClass of durationClassSchema.options) {
        const count = dataset.videos.filter(
          (video) =>
            video.sourceLanguage === language && video.durationClass === durationClass,
        ).length;
        if (count !== 5) {
          context.addIssue({
            code: 'custom',
            path: ['videos'],
            message: `Expected five ${language}/${durationClass} videos; found ${count}.`,
          });
        }
      }
    }
  });

export type EvaluationDataset = z.infer<typeof evaluationDatasetSchema>;

export const scoreSchema = z.number().int().min(1).max(5);
export const qualityScoresSchema = z
  .object({
    factualAccuracy: scoreSchema,
    coverage: scoreSchema,
    simplicity: scoreSchema,
    hierarchyQuality: scoreSchema,
    duplicateConcepts: scoreSchema,
    timestampUsefulness: scoreSchema,
    arabicLanguageQuality: scoreSchema,
    unsupportedClaims: scoreSchema,
  })
  .strict();

export const evaluationSubmissionSchema = z
  .object({
    datasetVersion: z.number().int().positive(),
    promptVersion: z.number().int().positive(),
    schemaVersion: z.number().int().positive(),
    model: z.string().trim().min(1).max(100),
    evaluator: z.string().trim().min(1).max(100),
    evaluatedAt: z.string().datetime(),
    results: z
      .array(
        z
          .object({
            videoId: z.string().min(1),
            analysisId: z.string().min(1).max(100),
            scores: qualityScoresSchema,
            evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
            notes: z.string().trim().max(2_000).default(''),
          })
          .strict(),
      )
      .length(20),
  })
  .strict();

export type EvaluationSubmission = z.infer<typeof evaluationSubmissionSchema>;
export type QualityScores = z.infer<typeof qualityScoresSchema>;

export const QUALITY_DIMENSIONS = Object.keys(
  qualityScoresSchema.shape,
) as (keyof QualityScores)[];

export type EvaluationReport = {
  passed: boolean;
  datasetVersion: number;
  promptVersion: number;
  schemaVersion: number;
  model: string;
  overall: QualityScores;
  groups: Record<string, QualityScores>;
  failures: string[];
};

export function loadDataset(): EvaluationDataset {
  const path = resolve(__dirname, '../datasets/v1.json');
  return evaluationDatasetSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function averages(scores: QualityScores[]): QualityScores {
  return Object.fromEntries(
    QUALITY_DIMENSIONS.map((dimension) => [
      dimension,
      Number(
        (
          scores.reduce((total, current) => total + current[dimension], 0) / scores.length
        ).toFixed(2),
      ),
    ]),
  ) as QualityScores;
}

export function scoreEvaluation(
  input: unknown,
  dataset = loadDataset(),
): EvaluationReport {
  const submission = evaluationSubmissionSchema.parse(input);
  if (
    submission.datasetVersion !== dataset.version ||
    submission.promptVersion !== dataset.promptVersion ||
    submission.schemaVersion !== dataset.schemaVersion
  ) {
    throw new Error('Evaluation versions do not match the locked dataset.');
  }
  const resultByVideo = new Map(
    submission.results.map((result) => [result.videoId, result]),
  );
  if (resultByVideo.size !== dataset.videos.length) {
    throw new Error('Every evaluation video must have exactly one result.');
  }
  const unknown = [...resultByVideo.keys()].filter(
    (id) => !dataset.videos.some((video) => video.id === id),
  );
  if (unknown.length > 0) throw new Error(`Unknown evaluation video: ${unknown[0]}`);

  const overall = averages(submission.results.map((result) => result.scores));
  const groups: Record<string, QualityScores> = {};
  for (const language of languageSchema.options) {
    for (const durationClass of durationClassSchema.options) {
      const key = `${language}-${durationClass}`;
      const ids = new Set(
        dataset.videos
          .filter(
            (video) =>
              video.sourceLanguage === language && video.durationClass === durationClass,
          )
          .map((video) => video.id),
      );
      groups[key] = averages(
        submission.results
          .filter((result) => ids.has(result.videoId))
          .map((result) => result.scores),
      );
    }
  }

  const failures: string[] = [];
  for (const [dimension, score] of Object.entries(overall)) {
    if (score < 4) failures.push(`${dimension} overall score ${score} is below 4.0.`);
  }
  for (const result of submission.results) {
    if (result.scores.factualAccuracy < 3) {
      failures.push(`${result.videoId} has a critical factual-accuracy score.`);
    }
    if (result.scores.unsupportedClaims < 3) {
      failures.push(`${result.videoId} has a critical unsupported-claims score.`);
    }
  }

  return {
    passed: failures.length === 0,
    datasetVersion: dataset.version,
    promptVersion: submission.promptVersion,
    schemaVersion: submission.schemaVersion,
    model: submission.model,
    overall,
    groups,
    failures,
  };
}

export function createEvaluationTemplate(dataset = loadDataset()): EvaluationSubmission {
  const neutralScores = Object.fromEntries(
    QUALITY_DIMENSIONS.map((dimension) => [dimension, 3]),
  ) as QualityScores;
  return {
    datasetVersion: dataset.version,
    promptVersion: dataset.promptVersion,
    schemaVersion: dataset.schemaVersion,
    model: 'replace-with-model-name',
    evaluator: 'replace-with-reviewer-name',
    evaluatedAt: new Date().toISOString(),
    results: dataset.videos.map((video) => ({
      videoId: video.id,
      analysisId: 'replace-with-analysis-id',
      scores: { ...neutralScores },
      evidence: ['Replace with a source-grounded reviewer observation.'],
      notes: '',
    })),
  };
}
