type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Role = 'admin' | 'member';

export interface SessionContext {
  user: { id: string; email: string };
  memberships: { id: string; householdId: string; householdName: string; role: Role }[];
}

export interface HouseholdMember {
  id: string;
  authUserId: string;
  role: Role;
}

export class IdentityError extends Error {
  constructor(readonly status: number) {
    super('Falha na operação de identidade.');
  }
}

export function createIdentityClient(fetcher: Fetcher = fetch, configuredOrigin = '') {
  const value = configuredOrigin.trim();
  const origin = value ? URL.parse(value) : null;
  if (value && (!origin || origin.protocol !== 'https:' || origin.username || origin.password || origin.href !== `${origin.origin}/`)) {
    throw new Error('VITE_API_BASE_URL deve ser uma origem HTTPS.');
  }

  async function request(path: string, init?: RequestInit) {
    const response = await fetcher(`${origin?.origin ?? ''}/api/v1${path}`, {
      ...init, credentials: 'include', cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new IdentityError(response.status);
    return response;
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    return (await request(path, init)).json();
  }

  function post(body: unknown, key?: string): RequestInit {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (key !== undefined) headers.set('Idempotency-Key', key);
    return { method: 'POST', headers, body: JSON.stringify(body) };
  }

  async function signIn(email: string, password: string) {
    await request('/auth/sign-in/email', post({ email, password }));
  }

  const session = () => json<SessionContext>('/session/context');

  return {
    signIn,
    async signUp(name: string, email: string, password: string) {
      await request('/auth/sign-up/email', post({ name, email, password }));
    },
    async sendVerificationCode(email: string) {
      await request('/auth/send-verification-email', post({ email }));
    },
    async verifyEmail(email: string, otp: string) {
      await request('/auth/email-otp/verify-email', post({ email, otp }));
    },
    async signOut() {
      await request('/auth/sign-out', post({}));
    },
    session,
    async sessionAfterVerification(email: string, password?: string) {
      async function verifiedContext() {
        try {
          const context = await session();
          // Outra aba pode ter iniciado sessão para uma conta diferente durante a confirmação.
          if (context.user.email.trim().toLowerCase() !== email.trim().toLowerCase()) throw new IdentityError(409);
          return context;
        } catch (failure) {
          if (failure instanceof IdentityError && [401, 403].includes(failure.status)) return null;
          throw failure;
        }
      }

      const context = await verifiedContext();
      // O provedor pode confirmar o e-mail sem emitir sessão. Tenta entrar uma única vez.
      if (context || !password) return context;
      try {
        await signIn(email, password);
      } catch (failure) {
        if (failure instanceof IdentityError && [401, 403].includes(failure.status)) return null;
        throw failure;
      }
      return verifiedContext();
    },
    createHousehold: (name: string, key: string) =>
      json<{ id: string; name: string; role: 'admin' }>('/households', post({ name }, key)),
    members: (householdId: string) =>
      json<{ members: HouseholdMember[] }>(`/households/${encodeURIComponent(householdId)}/members`),
    invite: (householdId: string, email: string, key: string) =>
      json<{ id: string; email: string; expiresAt: string; token: string }>(
        `/households/${encodeURIComponent(householdId)}/invitations`, post({ email }, key),
      ),
    accept: (token: string) => json<{ householdId: string }>('/invitations/accept', post({ token })),
    async revoke(householdId: string, memberId: string) {
      await request(`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
      });
    },
  };
}
