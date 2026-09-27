import { describe, expect, it } from 'vitest';
import { validateAnalysisForm } from './analysis-form';

describe('validateAnalysisForm', () => {
  it('returns the shared contract value for valid input', () => {
    expect(
      validateAnalysisForm({
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        outputLanguage: 'ar',
      }),
    ).toEqual({
      success: true,
      data: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        outputLanguage: 'ar',
      },
    });
  });

  it.each([
    ['', 'en'],
    ['not-a-url', 'en'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'fr'],
  ])('rejects invalid input without submitting it', (youtubeUrl, outputLanguage) => {
    expect(validateAnalysisForm({ youtubeUrl, outputLanguage }).success).toBe(false);
  });
});
