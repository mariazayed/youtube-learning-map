export class ProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly safeMessage = 'The video could not be analyzed. Please retry later.',
  ) {
    super(safeMessage);
    this.name = 'ProcessingError';
  }
}

export type ClassifiedFailure = {
  code: string;
  retryable: boolean;
  safeMessage: string;
};

export function classifyFailure(error: unknown): ClassifiedFailure {
  if (error instanceof ProcessingError) {
    return {
      code: error.code,
      retryable: error.retryable,
      safeMessage: error.safeMessage,
    };
  }
  return {
    code: 'TEMPORARY_PROCESSING_FAILURE',
    retryable: true,
    safeMessage: 'The video could not be analyzed. Please retry later.',
  };
}

export function asError(error: unknown): Error {
  return error instanceof ProcessingError
    ? error
    : new ProcessingError('TEMPORARY_PROCESSING_FAILURE', true);
}
