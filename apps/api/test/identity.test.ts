import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

const householdId = 'c2be4628-5347-4c78-9d13-32f7615edd78';
const membershipId = '9af3db64-a705-4eb0-981d-cf1ac19984e8';
const memberId = '4a521cec-87d2-4c2b-910b-97d2fd666137';
const idempotencyKey = 'e1b0b0e9-727a-452d-b787-4defea24f715';
const origin = 'https://app.example.test';
const user = { id: 'identidade-sintetica', email: 'membro@example.test', emailVerified: true };
const config = loadConfig({ APP_ENV: 'test', ALLOWED_ORIGINS: origin });

function setup(role: 'admin' | 'member' | null = 'admin') {
  const membership = { id: membershipId, householdId, householdName: 'Casa', role: role ?? 'member' as const };
  const store = {
    listMemberships: vi.fn(async () => role ? [membership] : []),
    getMembership: vi.fn(async () => role ? membership : null),
    listMembers: vi.fn(async () => [{ id: membershipId, authUserId: user.id, role: 'admin' as const }]),
    createHousehold: vi.fn(async () => ({ id: householdId, name: 'Casa', role: 'admin' as const })),
    createInvitation: vi.fn(async () => ({ id: memberId, email: 'convite@example.test', expiresAt: '2030-01-01T00:00:00.000Z' })),
    acceptInvitation: vi.fn(async (): Promise<{ householdId: string } | null> => ({ householdId })),
    revokeMembership: vi.fn(async (): Promise<'revoked' | 'missing' | 'owner-protected'> => 'revoked'),
  };
  const app = createApp(config, {
    identityStore: store,
    resolveSession: async (request: Request) => {
      const auth = request.headers.get('Cookie');
      if (auth === 'sessao=verificada') return user;
      if (auth === 'sessao=pendente') return { ...user, emailVerified: false };
      return null;
    },
    invitationTokenSecret: Buffer.alloc(32, 1),
  });
  return { app, store };
}

function mutation(method: string, body?: object): RequestInit {
  return {
    method,
    headers: {
      Origin: origin,
      Cookie: 'sessao=verificada',
      'Idempotency-Key': idempotencyKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  };
}

describe('sessão e famílias', () => {
  it('fica indisponível sem integrações confiáveis e mantém saúde pública', async () => {
    const app = createApp(config);
    expect((await app.request('/api/v1/session/context')).status).toBe(503);
    expect((await app.request('/api/v1/health')).status).toBe(200);
  });

  it('exige sessão e e-mail verificado sem aceitar identidade em cabeçalho', async () => {
    const { app, store } = setup();
    const forged = await app.request('/api/v1/session/context', { headers: { 'X-User-Id': user.id } });
    expect(forged.status).toBe(401);
    const pending = await app.request('/api/v1/session/context', { headers: { Cookie: 'sessao=pendente' } });
    expect(pending.status).toBe(403);
    expect(store.listMemberships).not.toHaveBeenCalled();
  });

  it('retorna somente associações da identidade autenticada e desabilita cache', async () => {
    const { app, store } = setup();
    const response = await app.request('/api/v1/session/context', { headers: { Cookie: 'sessao=verificada' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: user.id, email: user.email },
      memberships: [{ id: membershipId, householdId, householdName: 'Casa', role: 'admin' }],
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(store.listMemberships).toHaveBeenCalledWith(user.id);
  });

  it('nega família forjada, verifica em cada leitura e não consulta seus membros', async () => {
    const { app, store } = setup(null);
    const path = `/api/v1/households/${householdId}/members`;
    const request = { headers: { Cookie: 'sessao=verificada' } };
    expect((await app.request(path, request)).status).toBe(404);
    store.getMembership.mockResolvedValueOnce({ id: membershipId, householdId, householdName: 'Casa', role: 'member' });
    expect((await app.request(path, request)).status).toBe(200);
    expect((await app.request(path, request)).status).toBe(404);
    expect(store.getMembership).toHaveBeenCalledWith(householdId, user.id);
    expect(store.listMembers).toHaveBeenCalledTimes(1);
  });

  it('valida origem e idempotência antes de criar família em nome da sessão', async () => {
    const { app, store } = setup();
    const path = '/api/v1/households';
    const options = mutation('POST', { name: ' Casa ' });
    expect((await app.request(path, { ...options, headers: { ...options.headers, Origin: 'https://outra.example.test' } })).status).toBe(403);
    expect((await app.request(path, { ...options, headers: { ...options.headers, 'Idempotency-Key': '' } })).status).toBe(422);
    expect(store.createHousehold).not.toHaveBeenCalled();
    const response = await app.request(path, options);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: householdId, name: 'Casa', role: 'admin' });
    expect(store.createHousehold).toHaveBeenCalledWith(expect.objectContaining({ actorId: user.id, name: 'Casa', key: idempotencyKey }));
  });

  it('limita o CORS com credenciais à origem explícita e evita carga excessiva', async () => {
    const { app, store } = setup();
    const path = '/api/v1/households';
    const preflight = (requestOrigin: string) => app.request(path, {
      method: 'OPTIONS',
      headers: {
        Origin: requestOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,idempotency-key',
      },
    });
    const allowed = await preflight(origin);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(allowed.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('idempotency-key');
    expect((await preflight('https://outra.example.test')).headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect((await app.request(path, mutation('POST', { name: 'A'.repeat(9000) }))).status).toBe(413);
    expect(store.createHousehold).not.toHaveBeenCalled();
  });

  it('restringe convite e revogação a administrador e protege a administração titular', async () => {
    const member = setup('member');
    const invitePath = `/api/v1/households/${householdId}/invitations`;
    const revokePath = `/api/v1/households/${householdId}/members/${memberId}`;
    expect((await member.app.request(invitePath, mutation('POST', { email: 'convite@example.test' }))).status).toBe(403);
    expect((await member.app.request(revokePath, mutation('DELETE'))).status).toBe(403);
    expect(member.store.createInvitation).not.toHaveBeenCalled();
    expect(member.store.revokeMembership).not.toHaveBeenCalled();
    const admin = setup();
    admin.store.revokeMembership.mockResolvedValueOnce('owner-protected');
    expect((await admin.app.request(revokePath, mutation('DELETE'))).status).toBe(409);
    expect((await admin.app.request(revokePath, mutation('DELETE'))).status).toBe(204);
  });

  it('expõe o token apenas para compartilhar e persiste o hash no contrato', async () => {
    const { app, store } = setup();
    const path = `/api/v1/households/${householdId}/invitations`;
    const options = mutation('POST', { email: ' Convite@Example.Test ' });
    const response = await app.request(path, options);
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result).toMatchObject({ id: memberId, email: 'convite@example.test' });
    expect(result.token).toMatch(/^[\w-]{43}$/);
    expect(store.createInvitation).toHaveBeenCalledWith(expect.objectContaining({
      actorId: user.id, householdId, email: 'convite@example.test', tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(JSON.stringify(store.createInvitation.mock.calls)).not.toContain(result.token);
    expect(await (await app.request(path, options)).json()).toEqual(result);
  });

  it('usa e-mail verificado e devolve erro indistinto para convite inválido', async () => {
    const { app, store } = setup();
    const path = '/api/v1/invitations/accept';
    const options = mutation('POST', { token: 'A'.repeat(43) });
    store.acceptInvitation.mockResolvedValueOnce(null);
    const invalid = await app.request(path, options);
    expect(invalid.status).toBe(404);
    expect(await invalid.json()).toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
    const accepted = await app.request(path, options);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ householdId });
    expect(store.acceptInvitation).toHaveBeenCalledWith({
      actorId: user.id, email: user.email, tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
});
