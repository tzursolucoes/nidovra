export function loadConfig(env: Readonly<Record<string, string | undefined>>) {
  const appEnv = env.APP_ENV;
  if (appEnv !== 'development' && appEnv !== 'test' && appEnv !== 'production') {
    throw new Error('APP_ENV deve ser development, test ou production.');
  }

  const rawOrigins = env.ALLOWED_ORIGINS?.trim();
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((origin) => origin.trim())
    : appEnv === 'development' ? ['http://localhost:5173'] : [];

  if ((appEnv === 'production' && allowedOrigins.length === 0) ||
    allowedOrigins.some((origin) => !isAllowedOrigin(origin, appEnv))) {
    throw new Error('ALLOWED_ORIGINS deve conter origens HTTP explícitas; produção exige HTTPS.');
  }

  return { appEnv, allowedOrigins } as const;
}

function isAllowedOrigin(origin: string, mode: 'development' | 'test' | 'production'): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && mode !== 'production'));
  } catch {
    return false;
  }
}
