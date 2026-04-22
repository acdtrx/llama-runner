// Single module that owns HTTP calls to the running llama-server instance.
// No other module is allowed to fetch directly from listeningUrl — route it
// through here so the base URL resolution, timeouts, and error shape stay
// consistent.

import { AppError } from '../errors.js';
import { llamaServer } from '../process/llamaServer.js';

const DEFAULT_TIMEOUT_MS = 2000;

export class LlamaServerUnreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlamaServerUnreachable';
  }
}

export class LlamaServerNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlamaServerNotFound';
  }
}

function baseUrl(): string | null {
  const status = llamaServer.getStatus();
  if (status.state !== 'running') return null;
  return status.listeningUrl;
}

async function fetchJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const base = baseUrl();
  if (!base) throw new LlamaServerUnreachable('llama-server not running');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
    if (res.status === 404) throw new LlamaServerNotFound(`${path} not available`);
    if (!res.ok) {
      throw new AppError('INTERNAL_ERROR', `llama-server ${path} returned HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof LlamaServerNotFound) throw err;
    if (err instanceof AppError) throw err;
    const name = (err as Error).name;
    if (name === 'AbortError') throw new LlamaServerUnreachable(`${path} timed out`);
    throw new LlamaServerUnreachable(`${path}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const base = baseUrl();
  if (!base) throw new LlamaServerUnreachable('llama-server not running');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
    if (res.status === 404) throw new LlamaServerNotFound(`${path} not available`);
    if (!res.ok) {
      throw new AppError('INTERNAL_ERROR', `llama-server ${path} returned HTTP ${res.status}`);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof LlamaServerNotFound) throw err;
    if (err instanceof AppError) throw err;
    const name = (err as Error).name;
    if (name === 'AbortError') throw new LlamaServerUnreachable(`${path} timed out`);
    throw new LlamaServerUnreachable(`${path}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMetricsText(): Promise<string> {
  return fetchText('/metrics');
}

export async function fetchSlots(): Promise<unknown> {
  return fetchJson<unknown>('/slots');
}

export async function fetchProps(): Promise<unknown> {
  return fetchJson<unknown>('/props');
}

export async function fetchHealth(): Promise<unknown> {
  return fetchJson<unknown>('/health');
}
