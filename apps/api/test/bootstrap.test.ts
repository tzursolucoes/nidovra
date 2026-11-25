import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

describe('bootstrap da API', () => {
  it('rejeita configuração obrigatória ausente', () => {
    expect(() => loadConfig({})).toThrow('APP_ENV');
  });

  it('aceita configuração local sem credenciais e valida a lista de origens', () => {
    const config = loadConfig({ APP_ENV: 'development' });
    expect(config.appEnv).toBe('development');
    expect(config.allowedOrigins).toEqual(['http://localhost:5173']);
    expect(() => loadConfig({ APP_ENV: 'unknown' })).toThrow('APP_ENV');
    expect(() => loadConfig({ APP_ENV: 'production' })).toThrow('ALLOWED_ORIGINS');
    expect(() => loadConfig({ APP_ENV: 'production', ALLOWED_ORIGINS: '*' })).toThrow('ALLOWED_ORIGINS');
  });

  it('trata a origem vazia do arquivo de exemplo como ausente', () => {
    expect(loadConfig({ APP_ENV: 'development', ALLOWED_ORIGINS: ' ' }).allowedOrigins)
      .toEqual(['http://localhost:5173']);
    expect(() => loadConfig({ APP_ENV: 'production', ALLOWED_ORIGINS: ' ' })).toThrow('ALLOWED_ORIGINS');
  });

  it('responde à sonda de saúde sem expor dados privados', async () => {
    const app = createApp(loadConfig({ APP_ENV: 'test', AUTH_SECRET: 'valor-privado-sintético' }));
    const response = await app.request('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
