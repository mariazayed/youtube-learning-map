import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractValidationError,
  processVideoAnalysisJson,
  videoAnalysisResultSchema,
  type VideoAnalysisResult,
} from '@learnmap/contracts';
import { z } from 'zod';
import { buildAnalysisPrompt, shouldUseAgenticVideo } from './analysis-prompt';
import { ProcessingError } from './processing-error';
import type { VideoAnalysisInput } from './video-analysis-provider';
import { VideoAnalysisProvider } from './video-analysis-provider';

type InteractionStep = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type InteractionResponse = {
  output_text?: string;
  steps?: InteractionStep[];
  error?: { message?: string; code?: number; status?: string };
};

export class ProviderError extends ProcessingError {
  constructor(code: string, retryable: boolean) {
    super(code, retryable);
    this.name = 'ProviderError';
  }
}

@Injectable()
export class GeminiVideoAnalysisProvider extends VideoAnalysisProvider {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async analyze(input: VideoAnalysisInput): Promise<VideoAnalysisResult> {
    const apiKey = this.config.getOrThrow<string>('GEMINI_API_KEY');
    const model = this.config.get<string>('GEMINI_VIDEO_MODEL') ?? 'gemini-3.8-flash';
    const agenticMinimumSeconds =
      this.config.get<number>('GEMINI_AGENTIC_MIN_DURATION_SECONDS') ?? 300;
    const requestTimeoutMs =
      this.config.get<number>('GEMINI_REQUEST_TIMEOUT_MS') ?? 720_000;
    const jsonSchema = z.toJSONSchema(videoAnalysisResultSchema) as Record<
      string,
      unknown
    >;
    delete jsonSchema.$schema;
    const videoInput: Record<string, unknown> = {
      type: 'video',
      uri: input.youtubeUrl,
    };
    if (shouldUseAgenticVideo(model, input.durationSeconds, agenticMinimumSeconds)) {
      videoInput.processing = 'agentic';
    }

    let response: Response;
    try {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            model,
            input: [videoInput, { type: 'text', text: buildAnalysisPrompt(input) }],
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: jsonSchema,
            },
          }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      );
    } catch {
      throw new ProviderError('PROVIDER_NETWORK_ERROR', true);
    }

    const body = (await response.json().catch(() => ({}))) as InteractionResponse;
    const providerStatus = body.error?.status?.toUpperCase() ?? '';
    const providerCode = body.error?.code;
    if (providerStatus.includes('SAFETY') || providerStatus.includes('BLOCK')) {
      throw new ProviderError('SAFETY_POLICY_REJECTION', false);
    }
    if (providerCode === 429) throw new ProviderError('PROVIDER_RATE_LIMIT', true);
    if (providerCode === 408 || (providerCode !== undefined && providerCode >= 500)) {
      throw new ProviderError('PROVIDER_TEMPORARILY_UNAVAILABLE', true);
    }
    if (!response.ok) {
      if (response.status === 429) throw new ProviderError('PROVIDER_RATE_LIMIT', true);
      if (response.status === 408 || response.status >= 500) {
        throw new ProviderError('PROVIDER_TEMPORARILY_UNAVAILABLE', true);
      }
      throw new ProviderError('PROVIDER_REQUEST_REJECTED', false);
    }
    if (body.error) throw new ProviderError('PROVIDER_REQUEST_REJECTED', false);
    const output = this.extractOutputText(body);
    try {
      return processVideoAnalysisJson(output, {
        durationSeconds: input.durationSeconds,
      });
    } catch (error) {
      if (error instanceof ContractValidationError) {
        throw new ProviderError(error.code, true);
      }
      throw error;
    }
  }

  private extractOutputText(body: InteractionResponse): string {
    if (body.output_text) return body.output_text;
    const output = [...(body.steps ?? [])]
      .reverse()
      .find((step) => step.type === 'model_output');
    const text = output?.content?.find((content) => content.type === 'text')?.text;
    if (!text) throw new ProviderError('PROVIDER_EMPTY_RESULT', true);
    return text;
  }
}
