import type { OutputLanguage, VideoAnalysisResult } from '@learnmap/contracts';

export type VideoAnalysisInput = {
  youtubeUrl: string;
  outputLanguage: OutputLanguage;
  title?: string;
  durationSeconds?: number;
};

export abstract class VideoAnalysisProvider {
  /** Returns a runtime-validated, normalized result. Callers still validate before persistence. */
  abstract analyze(input: VideoAnalysisInput): Promise<VideoAnalysisResult>;
}
