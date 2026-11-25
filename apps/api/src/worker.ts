import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

interface WorkerBindings {
  APP_ENV?: string;
  ALLOWED_ORIGINS?: string;
}

export default {
  fetch(request: Request, bindings: WorkerBindings) {
    const config = loadConfig({ APP_ENV: bindings.APP_ENV, ALLOWED_ORIGINS: bindings.ALLOWED_ORIGINS });
    return createApp(config).fetch(request);
  },
};
