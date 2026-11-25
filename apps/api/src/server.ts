import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const env = process.argv.includes('--local')
  ? { ...process.env, APP_ENV: process.env.APP_ENV ?? 'development' }
  : process.env;
const app = createApp(loadConfig(env));

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3001 }, ({ address, port }) => {
  console.log(`API Nidovra em http://${address}:${port}`);
});
