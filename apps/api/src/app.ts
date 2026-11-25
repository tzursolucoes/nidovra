import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { loadConfig } from './config.ts';
import { createIdentityRoutes } from './modules/identity/routes.ts';
import type { IdentityDependencies } from './modules/identity/contracts.ts';

export function createApp(config: ReturnType<typeof loadConfig>, identity?: IdentityDependencies) {
  const app = new Hono();
  app.use('/api/v1/*', cors({
    origin: config.allowedOrigins,
    credentials: true,
    allowHeaders: ['Content-Type', 'Idempotency-Key'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  }));
  // A sonda mede a disponibilidade HTTP, sem consultar banco nem expor configuração.
  app.get('/api/v1/health', (context) => {
    context.header('Cache-Control', 'no-store');
    return context.json({ status: 'ok' });
  });
  app.route('/api/v1', createIdentityRoutes(config.allowedOrigins, identity));
  return app;
}
