import { describe, expect, it } from 'vitest';
import { assertEnvironmentIsolation } from '../src/isolation.ts';

describe('isolamento de migrações locais', () => {
  const databaseUrl = 'postgresql://nidovra_app:synthetic@127.0.0.1:5432/nidovra_test';

  it('exige configuração explícita e uma base de testes em loopback', () => {
    expect(() => assertEnvironmentIsolation({})).toThrow('APP_ENV');
    expect(() => assertEnvironmentIsolation({ APP_ENV: 'test' })).toThrow('DATABASE_URL');
    expect(() => assertEnvironmentIsolation({ APP_ENV: 'test', DATABASE_URL: databaseUrl })).not.toThrow();
    expect(() => assertEnvironmentIsolation({ APP_ENV: 'test', DATABASE_URL: databaseUrl.replace('nidovra_test', 'postgres') })).toThrow('DATABASE_URL');
  });

  it('bloqueia o projeto MotoHub, servidores remotos e produção', () => {
    expect(() => assertEnvironmentIsolation({ APP_ENV: 'test', DATABASE_URL: databaseUrl, NEON_PROJECT_ID: 'falling-river-62191222' })).toThrow('proibido');
    expect(() => assertEnvironmentIsolation({ APP_ENV: 'test', DATABASE_URL: databaseUrl.replace('127.0.0.1', 'remote.example') })).toThrow('DATABASE_URL');
    expect(() => assertEnvironmentIsolation({ APP_ENV: 'test', DATABASE_URL: `${databaseUrl}?host=remote.example` })).toThrow('DATABASE_URL');
    expect(() => assertEnvironmentIsolation({ APP_ENV: 'production', DATABASE_URL: databaseUrl })).toThrow('APP_ENV');
  });
});
