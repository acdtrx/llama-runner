import type { ApiError } from '../types';

export class HttpError extends Error {
  readonly status: number;
  readonly apiError: ApiError;

  constructor(status: number, apiError: ApiError) {
    super(apiError.message);
    this.name = 'HttpError';
    this.status = status;
    this.apiError = apiError;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body: unknown = text.length > 0 ? JSON.parse(text) : null;

  if (!res.ok) {
    const envelope = (body as { error?: ApiError } | null) ?? null;
    const apiError: ApiError =
      envelope?.error ?? { code: 'INTERNAL_ERROR', message: `HTTP ${res.status}` };
    throw new HttpError(res.status, apiError);
  }

  return body as T;
}
