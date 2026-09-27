import { describe, expect, it } from 'vitest';
import {
  createEvaluationTemplate,
  evaluationDatasetSchema,
  loadDataset,
  scoreEvaluation,
} from './index';
import type { QualityScores } from './index';

describe('AI quality evaluation', () => {
  it('locks five videos into every language and duration group', () => {
    const dataset = loadDataset();
    expect(dataset.videos).toHaveLength(20);
    for (const language of ['ar', 'en'] as const) {
      for (const durationClass of ['short', 'long'] as const) {
        expect(
          dataset.videos.filter(
            (video) =>
              video.sourceLanguage === language && video.durationClass === durationClass,
          ),
        ).toHaveLength(5);
      }
    }
  });

  it('rejects duplicate videos and malformed canonical URLs', () => {
    const dataset = loadDataset();
    const videos = [...dataset.videos];
    videos[1] = { ...videos[1]!, youtubeVideoId: videos[0]!.youtubeVideoId };
    expect(() => evaluationDatasetSchema.parse({ ...dataset, videos })).toThrow();
    expect(() =>
      evaluationDatasetSchema.parse({
        ...dataset,
        videos: [
          { ...dataset.videos[0]!, youtubeUrl: 'https://attacker.example/video' },
          ...dataset.videos.slice(1),
        ],
      }),
    ).toThrow();
  });

  it('produces group averages and blocks a weak prompt release', () => {
    const template = createEvaluationTemplate();
    const strong = {
      ...template,
      results: template.results.map((result) => ({
        ...result,
        scores: Object.fromEntries(
          Object.keys(result.scores).map((dimension) => [dimension, 5]),
        ) as QualityScores,
      })),
    };
    expect(scoreEvaluation(strong)).toMatchObject({
      passed: true,
      overall: { factualAccuracy: 5, arabicLanguageQuality: 5 },
    });
    strong.results[0]!.scores.factualAccuracy = 1;
    expect(scoreEvaluation(strong)).toMatchObject({ passed: false });
  });

  it('rejects scores produced for a different prompt version', () => {
    const submission = createEvaluationTemplate();
    expect(() =>
      scoreEvaluation({ ...submission, promptVersion: submission.promptVersion + 1 }),
    ).toThrow('versions');
  });
});
