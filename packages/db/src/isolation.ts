/** Valida a configuração anterior à abertura de conexão para migrações locais. */
export function assertEnvironmentIsolation(env: Readonly<Record<string, string | undefined>>): void {
  if (env.NEON_PROJECT_ID?.trim().toLowerCase() === 'falling-river-62191222') {
    throw new Error('Projeto Neon proibido como alvo do Nidovra.');
  }

  const mode = env.APP_ENV;
  if (mode !== 'development' && mode !== 'test') {
    throw new Error('APP_ENV deve identificar um ambiente local: development ou test.');
  }

  const databaseName = mode === 'test' ? 'nidovra_test' : 'nidovra_dev';
  const invalidTarget = `DATABASE_URL deve apontar para o banco local ${databaseName} sem parâmetros.`;
  const url = URL.parse(env.DATABASE_URL ?? '');
  // Parâmetros extras podem substituir o destino conforme o driver PostgreSQL.
  if (!url || (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== `/${databaseName}` ||
    url.href.includes('?') || url.href.includes('#')) {
    throw new Error(invalidTarget);
  }
}
