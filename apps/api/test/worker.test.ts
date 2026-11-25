import { describe, expect, it } from 'vitest';
import worker from '../src/worker.ts';

describe('entrada Hono do Worker', () => {
  it('serve a sonda de saúde pelo contrato Fetch do Worker', async () => {
    const response = await worker.fetch(new Request('https://api.example.test/api/v1/health'), {
      APP_ENV: 'production', ALLOWED_ORIGINS: 'https://web.example.test',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('mantém rotas privadas indisponíveis até conectar a identidade real', async () => {
    const response = await worker.fetch(new Request('https://api.example.test/api/v1/session/context'), {
      APP_ENV: 'production', ALLOWED_ORIGINS: 'https://web.example.test',
    });
    expect(response.status).toBe(503);
  });
});
