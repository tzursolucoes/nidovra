import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { identityError, requireSession, type IdentityContext } from '../../middleware/auth.ts';
import { isUuid, requireAdmin, requireMembership } from '../../middleware/household.ts';
import { ActiveFamilyExists, IdempotencyConflict, type IdentityDependencies } from './contracts.ts';

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function readText(context: Context<IdentityContext>, key: string) {
  if (!/^application\/json(?:\s*;|$)/i.test(context.req.header('Content-Type') ?? '')) {
    return null;
  }
  const data: unknown = await context.req.json().catch(() => null);
  if (!data || typeof data !== 'object' || !Object.hasOwn(data, key)) return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : null;
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function createIdentityRoutes(
  allowedOrigins: readonly string[],
  dependencies?: IdentityDependencies,
) {
  const app = new Hono<IdentityContext>();
  app.use('*', async (context, next) => {
    context.set('requestId', randomUUID());
    context.header('Cache-Control', 'no-store');
    await next();
  });
  app.onError((error, context) => {
    if (error instanceof IdempotencyConflict) {
      return identityError(context, 409, 'IDEMPOTENCY_CONFLICT', 'A chave já identifica outra solicitação.');
    }
    if (error instanceof ActiveFamilyExists) {
      return identityError(context, 409, 'ACTIVE_FAMILY_EXISTS', 'Sua conta já participa de uma família ativa.');
    }
    return identityError(context, 503, 'IDENTITY_UNAVAILABLE', 'Identidade temporariamente indisponível.');
  });

  const session = requireSession(dependencies?.resolveSession);
  if (!dependencies) {
    app.get('/session/context', session);
    app.post('/households', session);
    app.patch('/households/:id', session);
    app.get('/households/:id/members', session);
    app.post('/households/:id/invitations', session);
    app.post('/invitations/accept', session);
    app.delete('/households/:id/members/:memberId', session);
    return app;
  }

  const { identityStore: store, invitationTokenSecret } = dependencies;
  const membership = requireMembership(store);
  const mutationOrigin = createMiddleware<IdentityContext>(async (context, next) => {
    if (!allowedOrigins.includes(context.req.header('Origin') ?? '')) {
      return identityError(context, 403, 'ORIGIN_NOT_ALLOWED', 'Origem da solicitação não permitida.');
    }
    await next();
  });
  const limit = bodyLimit({
    maxSize: 8192,
    onError: (context) => identityError(context, 413, 'PAYLOAD_TOO_LARGE', 'Dados da solicitação excedem o limite.'),
  });

  app.get('/session/context', session, async (context) => {
    const { id, email } = context.var.user;
    const memberships = await store.listMemberships(id);
    return context.json({ user: { id, email }, memberships });
  });

  app.post('/households', mutationOrigin, session, limit, async (context) => {
    const key = context.req.header('Idempotency-Key');
    const name = await readText(context, 'name');
    if (!name || name.length > 120 || !isUuid(key)) {
      return identityError(context, 422, 'INVALID_INPUT', 'Informe nome e chave de idempotência válidos.');
    }
    const result = await store.createHousehold({ actorId: context.var.user.id, key: key.toLowerCase(), name });
    return context.json(result, 201);
  });

  app.patch('/households/:id', mutationOrigin, session, membership, requireAdmin, limit, async (context) => {
    const name = await readText(context, 'name');
    if (!name || name.length > 120) {
      return identityError(context, 422, 'INVALID_INPUT', 'Informe um nome com até 120 caracteres.');
    }
    const result = await store.renameHousehold({
      actorId: context.var.user.id,
      householdId: context.var.membership.householdId,
      name,
    });
    return result
      ? context.json(result)
      : identityError(context, 404, 'HOUSEHOLD_NOT_FOUND', 'Família indisponível.');
  });

  app.get('/households/:id/members', session, membership, async (context) => {
    const members = await store.listMembers(context.var.membership.householdId, context.var.user.id);
    return members
      ? context.json({ members })
      : identityError(context, 404, 'HOUSEHOLD_NOT_FOUND', 'Família indisponível.');
  });

  app.post('/households/:id/invitations', mutationOrigin, session, membership, requireAdmin, limit, async (context) => {
    if (!invitationTokenSecret || invitationTokenSecret.byteLength < 32) {
      return identityError(context, 503, 'INVITATION_UNAVAILABLE', 'A criação de convites está indisponível.');
    }
    const email = normalizeEmail(await readText(context, 'email') ?? '');
    const key = context.req.header('Idempotency-Key');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isUuid(key)) {
      return identityError(context, 422, 'INVALID_INPUT', 'Informe e-mail e chave de idempotência válidos.');
    }
    const actorId = context.var.user.id;
    const { householdId } = context.var.membership;
    const canonicalKey = key.toLowerCase();
    // FAM-02: o mesmo comando pode ser repetido sem guardar o token de convite em texto claro.
    const token = createHmac('sha256', invitationTokenSecret)
      .update(JSON.stringify(['nidovra-invitation-v1', actorId, householdId, canonicalKey, email]))
      .digest('base64url');
    const result = await store.createInvitation({ actorId, householdId, key: canonicalKey, email, tokenHash: digest(token) });
    return result
      ? context.json({ ...result, token }, 201)
      : identityError(context, 404, 'HOUSEHOLD_NOT_FOUND', 'Família indisponível.');
  });

  app.post('/invitations/accept', mutationOrigin, session, limit, async (context) => {
    const token = await readText(context, 'token');
    const result = token && /^[\w-]{43}$/.test(token)
      ? await store.acceptInvitation({
        actorId: context.var.user.id,
        email: normalizeEmail(context.var.user.email),
        tokenHash: digest(token),
      })
      : null;
    return result
      ? context.json(result)
      : identityError(context, 404, 'INVITATION_UNAVAILABLE', 'Convite indisponível.');
  });

  app.delete('/households/:id/members/:memberId', mutationOrigin, session, membership, requireAdmin, async (context) => {
    const memberId = context.req.param('memberId');
    if (!isUuid(memberId)) {
      return identityError(context, 404, 'MEMBER_NOT_FOUND', 'Integrante indisponível.');
    }
    const outcome = await store.revokeMembership(context.var.membership.householdId, context.var.user.id, memberId);
    if (outcome === 'owner-protected') {
      return identityError(context, 409, 'OWNER_TRANSFER_REQUIRED', 'Transfira a administração titular antes de remover este integrante.');
    }
    return outcome === 'revoked'
      ? context.body(null, 204)
      : identityError(context, 404, 'MEMBER_NOT_FOUND', 'Integrante indisponível.');
  });
  return app;
}
