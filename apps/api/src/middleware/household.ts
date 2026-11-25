import { createMiddleware } from 'hono/factory';
import type { IdentityStore } from '../modules/identity/contracts.ts';
import { identityError, type IdentityContext } from './auth.ts';

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

/** FAM-02/03: revalida a associação ativa a cada operação, inclusive após revogação. */
export function requireMembership(store: IdentityStore) {
  return createMiddleware<IdentityContext>(async (context, next) => {
    const id = context.req.param('id');
    const membership = isUuid(id) ? await store.getMembership(id, context.var.user.id) : null;
    if (!membership) {
      return identityError(context, 404, 'HOUSEHOLD_NOT_FOUND', 'Família indisponível.');
    }
    context.set('membership', membership);
    await next();
  });
}

export const requireAdmin = createMiddleware<IdentityContext>(async (context, next) => {
  if (context.var.membership.role !== 'admin') {
    return identityError(context, 403, 'ADMIN_REQUIRED', 'Esta ação exige administração da família.');
  }
  await next();
});
