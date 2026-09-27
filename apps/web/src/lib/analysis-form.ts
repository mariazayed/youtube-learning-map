import {
  createAnalysisRequestSchema,
  type CreateAnalysisRequest,
} from '@learnmap/contracts';

export type FormValidationResult =
  | { success: true; data: CreateAnalysisRequest }
  | { success: false; field: 'youtubeUrl' | 'outputLanguage'; code: string };

export function validateAnalysisForm(input: unknown): FormValidationResult {
  const result = createAnalysisRequestSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  const issue = result.error.issues[0];
  return {
    success: false,
    field: issue?.path[0] === 'outputLanguage' ? 'outputLanguage' : 'youtubeUrl',
    code: issue?.code ?? 'invalid_input',
  };
}
