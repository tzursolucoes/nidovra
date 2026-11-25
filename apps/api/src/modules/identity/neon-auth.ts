import type { SessionResolver } from './contracts.ts';

const authActions = ['sign-in/email', 'sign-up/email', 'sign-out',
  'email-otp/verify-email', 'send-verification-email'] as const;
type AuthAction = typeof authActions[number];
type Fetcher = (url: URL, init: RequestInit) => Promise<Response>;
const cookiePrefix = '__Secure-neon-auth.';

/** Usa os cookies opacos do provedor. O aplicativo consulta a sessão vigente a cada requisição privada. */
export function createNeonAuth(baseUrl: string, origin: string, fetcher: Fetcher = fetch) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.neon.tech') ||
    base.username || base.password || base.port || base.search || base.hash) {
    throw new Error('Endpoint de autenticação inválido.');
  }

  function headers(request: Request) {
    const result = new Headers({ Origin: origin, 'X-Neon-Auth-Middleware': 'true' });
    const cookies = (request.headers.get('Cookie') ?? '').split(';')
      .map((cookie) => cookie.trim()).filter((cookie) => cookie.startsWith(cookiePrefix));
    if (cookies.length) result.set('Cookie', cookies.join('; '));
    return result;
  }

  function urlFor(path: string) {
    return new URL(base.href.replace(/\/$/, '') + '/' + path);
  }

  const resolveSession: SessionResolver = async (request) => {
    const requestHeaders = headers(request);
    if (!requestHeaders.has('Cookie')) return null;
    const url = urlFor('get-session');
    url.searchParams.set('disableCookieCache', 'true');
    const response = await fetcher(url, {
      method: 'GET', headers: requestHeaders, redirect: 'error', cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error('Consulta de sessão indisponível.');
    const payload: { user?: { id?: unknown; email?: unknown; emailVerified?: unknown } } | null = await response.json();
    const user = payload?.user;
    if (typeof user?.id !== 'string' || !user.id || typeof user.email !== 'string' || !user.email) return null;
    return { id: user.id, email: user.email, emailVerified: user.emailVerified === true };
  };

  function reply(status: number, code?: string, upstream?: Response) {
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const cookie of upstream?.headers.getSetCookie() ?? []) {
      const [pair, ...attributes] = cookie.split(';').map((attribute) => attribute.trim());
      if (!pair?.startsWith(cookiePrefix)) continue;
      const lifetime = attributes.filter((attribute) => /^(Expires|Max-Age)=/i.test(attribute));
      responseHeaders.append('Set-Cookie', [pair, 'Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax', ...lifetime].join('; '));
    }
    return Response.json(code ? { error: { code } } : { ok: true }, { status, headers: responseHeaders });
  }

  async function proxy(request: Request, action: AuthAction) {
    const requestHeaders = headers(request);
    const url = urlFor(action);
    if (request.headers.get('Origin') !== origin) return reply(403, 'ORIGIN_NOT_ALLOWED');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
      return reply(415, 'INVALID_CONTENT_TYPE');
    }
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return reply(422, 'INVALID_INPUT');
    const data = preparePayload(action, body as Record<string, unknown>, origin);
    if (!data) return reply(422, 'INVALID_INPUT');
    requestHeaders.set('Content-Type', 'application/json');

    try {
      const upstream = await fetcher(url, {
        method: 'POST', headers: requestHeaders, redirect: 'manual', body: JSON.stringify(data),
      });
      if (upstream.ok) return reply(200, undefined, upstream);
      if (action === 'send-verification-email' && [400, 404, 422].includes(upstream.status)) {
        return reply(200);
      }
      return upstream.status >= 400 && upstream.status < 500
        ? reply(upstream.status, 'AUTH_REQUEST_REJECTED', upstream)
        : reply(503, 'AUTH_UNAVAILABLE');
    } catch {
      return reply(503, 'AUTH_UNAVAILABLE');
    }
  }

  return { proxy, resolveSession, actions: authActions };
}

function preparePayload(action: AuthAction, body: Record<string, unknown>, origin: string) {
  if (action === 'sign-out') return {};
  const { name, email, password, otp } = body;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (action === 'send-verification-email') return { email, callbackURL: origin + '/' };
  if (action === 'email-otp/verify-email') return typeof otp === 'string' && /^\d{6}$/.test(otp) ? { email, otp } : null;
  if (typeof password !== 'string' || !password || password.length > 128) return null;
  if (action === 'sign-in/email') return { email, password };
  return typeof name === 'string' && name.trim() && name.length <= 120
    ? { name, email, password, callbackURL: origin + '/' } : null;
}
