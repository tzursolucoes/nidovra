import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { loadConfig } from './config.ts';

export function createApp(config: ReturnType<typeof loadConfig>) {
  const app = new Hono();
  app.use('/api/v1/*', cors({ origin: config.allowedOrigins }));
  // A sonda mede a disponibilidade HTTP, sem consultar banco nem expor configuração.
  app.get('/api/v1/health', (context) => {
    context.header('Cache-Control', 'no-store');
    return context.json({ status: 'ok' });
  });
  return app;
}
