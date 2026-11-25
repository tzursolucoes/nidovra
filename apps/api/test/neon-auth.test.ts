import { describe, expect, it, vi } from 'vitest';
import { createNeonAuth } from '../src/modules/identity/neon-auth.ts';

const origin = 'https://nidovra.pages.dev';
const base = 'https://example.neonauth.aws.neon.tech/nidovra/auth';
const sessionCookie = '__Secure-neon-auth.session_token=opaque';

describe('integração de sessão Neon', () => {
  it('valida no provedor e encaminha somente cookies de autenticação', async () => {
    const upstream = vi.fn(async (_url: URL, _init: RequestInit) => Response.json({
      user: { id: 'example', email: 'teste@example.test', emailVerified: true },
    }));
    const auth = createNeonAuth(base, origin, upstream);
    const request = new Request(origin, { headers: { Cookie: `other=private; ${sessionCookie}` } });
    expect(await auth.resolveSession(request)).toEqual({ id: 'example', email: 'teste@example.test', emailVerified: true });
    const [url, init] = upstream.mock.calls[0]!;
    expect(url.pathname.endsWith('/get-session')).toBe(true);
    expect(url.searchParams.get('disableCookieCache')).toBe('true');
    expect(new Headers(init.headers).get('Cookie')).toBe(sessionCookie);
  });

  it('rejeita origens externas e omite o token do corpo de retorno', async () => {
    const upstream = vi.fn(async (_url: URL, _init: RequestInit) => Response.json(
      { token: 'do-not-expose' },
      { headers: { 'Set-Cookie': `${sessionCookie}; Path=/; Domain=example.neon.tech; Partitioned; Secure` } },
    ));
    const auth = createNeonAuth(base, origin, upstream);
    const signIn = (requestOrigin: string) => new Request(origin + '/api/v1/auth/sign-in/email', {
      method: 'POST',
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'teste@example.test', password: 'valor-sintetico' }),
    });
    expect((await auth.proxy(signIn('https://external.test'), 'sign-in/email')).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    const result = await auth.proxy(signIn(origin), 'sign-in/email');
    expect(await result.json()).toEqual({ ok: true });
    expect(result.headers.getSetCookie()).toEqual([`${sessionCookie}; Path=/; Secure; HttpOnly; SameSite=Lax`]);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('envia somente e-mail e código no fluxo de confirmação', async () => {
    const upstream = vi.fn(async (_url: URL, _init: RequestInit) => Response.json({ ok: true }));
    const auth = createNeonAuth(base, origin, upstream);
    const request = new Request(origin + '/api/v1/auth/email-otp/verify-email', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'teste@example.test', otp: '012345', callbackURL: 'https://external.test' }),
    });
    expect((await auth.proxy(request, 'email-otp/verify-email')).status).toBe(200);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url.pathname.endsWith('/email-otp/verify-email')).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({ email: 'teste@example.test', otp: '012345' });
  });
});
