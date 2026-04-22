import { request } from './http';

export async function listModels(): Promise<string[]> {
  const body = await request<{ files: string[] }>('/api/models');
  return body.files;
}
