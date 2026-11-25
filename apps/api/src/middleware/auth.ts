import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Membership, SessionResolver, SessionUser } from '../modules/identity/contracts.ts';

export type IdentityContext = {
  Variables: { requestId: string; user: SessionUser; membership: Membership };
};

export function identityError(
  context: Context<IdentityContext>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  return context.json({ code, message, requestId: context.var.requestId }, status);
}

/** FAM-01: somente uma sessão do provedor confiável e com e-mail verificado entra no domínio. */
export function requireSession(resolveSession?: SessionResolver) {
  return createMiddleware<IdentityContext>(async (context, next) => {
    if (!resolveSession) {
      return identityError(context, 503, 'IDENTITY_UNAVAILABLE', 'Identidade temporariamente indisponível.');
    }
    const user = await resolveSession(context.req.raw);
    if (!user) {
      return identityError(context, 401, 'SESSION_REQUIRED', 'Inicie uma sessão para continuar.');
    }
    if (user.emailVerified !== true) {
      return identityError(context, 403, 'EMAIL_VERIFICATION_REQUIRED', 'Verifique seu e-mail para continuar.');
    }
    context.set('user', user);
    await next();
  });
}
