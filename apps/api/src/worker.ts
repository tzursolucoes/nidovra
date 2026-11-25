import { Pool } from 'pg';
import { bodyLimit } from 'hono/body-limit';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createNeonAuth } from './modules/identity/neon-auth.ts';
import { createPostgresIdentityStore } from './modules/identity/postgres.ts';

interface WorkerBindings {
  APP_ENV?: string;
  ALLOWED_ORIGINS?: string;
  NEON_AUTH_BASE_URL?: string;
  DATABASE_URL?: string;
  INVITATION_TOKEN_SECRET?: string;
}

export default {
  async fetch(request: Request, bindings: WorkerBindings) {
    const config = loadConfig({ APP_ENV: bindings.APP_ENV, ALLOWED_ORIGINS: bindings.ALLOWED_ORIGINS });
    const origin = config.allowedOrigins[0];
    const auth = origin && bindings.NEON_AUTH_BASE_URL
      ? createNeonAuth(bindings.NEON_AUTH_BASE_URL, origin) : undefined;
    const pool = bindings.DATABASE_URL && auth && new URL(request.url).pathname !== '/api/v1/health'
      ? new Pool({ connectionString: bindings.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000 }) : undefined;
    const app = createApp(config, pool && auth ? {
      resolveSession: auth.resolveSession,
      identityStore: createPostgresIdentityStore(pool),
      invitationTokenSecret: bindings.INVITATION_TOKEN_SECRET
        ? new TextEncoder().encode(bindings.INVITATION_TOKEN_SECRET) : undefined,
    } : undefined);
    if (auth) {
      const prefix = '/api/v1/auth';
      app.use(prefix + '/*', bodyLimit({
        maxSize: 8192,
        onError: (context) => context.json({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413, { 'Cache-Control': 'no-store' }),
      }));
      for (const action of auth.actions) {
        app.post(prefix + '/' + action, (context) => auth.proxy(context.req.raw, action));
      }
    }
    try {
      return await app.fetch(request);
    } finally {
      await pool?.end();
    }
  },
};
