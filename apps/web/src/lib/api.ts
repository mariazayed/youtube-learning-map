import {
  accountDeletionRequestSchema,
  analysisAcceptedSchema,
  analysisSchema,
  analysisStatusResponseSchema,
  createAnalysisRequestSchema,
  type Analysis,
  type AccountDeletionRequest,
  type AnalysisAccepted,
  type AnalysisStatusResponse,
  type CreateAnalysisRequest,
} from '@learnmap/contracts';
import { z } from 'zod';
import { getAccessToken } from './auth/oidc-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

function getClientId(): string {
  if (typeof window === 'undefined') return 'server-render-placeholder';
  const existing = window.localStorage.getItem('learnmap-client-id');
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll('-', '');
  window.localStorage.setItem('learnmap-client-id', created);
  return created;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T> | null,
  init?: RequestInit,
): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : { 'X-Client-Id': getClientId() }),
      ...init?.headers,
    },
  });
  const body =
    response.status === 204
      ? undefined
      : await response
          .json()
          .catch(() => ({ message: 'The server returned an invalid response.' }));
  if (!response.ok) {
    const error = body as { message?: string | string[]; requestId?: string };
    const message = Array.isArray(error.message)
      ? error.message.join(' ')
      : error.message;
    const requestSuffix = error.requestId ? ` (request ${error.requestId})` : '';
    throw new Error(`${message ?? 'The request failed.'}${requestSuffix}`);
  }
  return schema ? schema.parse(body) : (undefined as T);
}

export const api = {
  createAnalysis(input: CreateAnalysisRequest): Promise<AnalysisAccepted> {
    const validated = createAnalysisRequestSchema.parse(input);
    return request('/analyses', analysisAcceptedSchema, {
      method: 'POST',
      body: JSON.stringify(validated),
    });
  },
  listAnalyses(): Promise<Analysis[]> {
    return request('/analyses', z.array(analysisSchema));
  },
  getAnalysis(id: string): Promise<Analysis> {
    return request(`/analyses/${encodeURIComponent(id)}`, analysisSchema);
  },
  getAnalysisStatus(id: string): Promise<AnalysisStatusResponse> {
    return request(
      `/analyses/${encodeURIComponent(id)}/status`,
      analysisStatusResponseSchema,
    );
  },
  retryAnalysis(id: string): Promise<AnalysisAccepted> {
    return request(`/analyses/${encodeURIComponent(id)}/retry`, analysisAcceptedSchema, {
      method: 'POST',
    });
  },
  deleteAnalysis(id: string): Promise<void> {
    return request(`/analyses/${encodeURIComponent(id)}`, null, { method: 'DELETE' });
  },
  async deleteAccount(input: AccountDeletionRequest): Promise<void> {
    const validated = accountDeletionRequestSchema.parse(input);
    await request('/account', null, {
      method: 'DELETE',
      body: JSON.stringify(validated),
    });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('learnmap-client-id');
    }
  },
};
