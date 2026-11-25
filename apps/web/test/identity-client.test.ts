import { describe, expect, it } from 'vitest';
import { createIdentityClient, IdentityError } from '../src/features/settings/identity-client';

describe('cliente de identidade', () => {
  it('consulta o contexto de sessão pelo contrato versionado', async () => {
    const context = { user: { id: 'autor', email: 'autor@example.test' }, memberships: [] };
    const client = createIdentityClient(async (input, init) => {
      expect(input).toBe('/api/v1/session/context');
      expect(init?.credentials).toBe('include');
      return Response.json(context);
    });
    await expect(client.session()).resolves.toEqual(context);
  });

  it('preserva a chave de idempotência do comando de criação', async () => {
    const client = createIdentityClient(async (input, init) => {
      expect(input).toBe('/api/v1/households');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('chave-sintetica');
      expect(init?.body).toBe(JSON.stringify({ name: 'Minha família' }));
      return Response.json({ id: 'familia', name: 'Minha família', role: 'admin' }, { status: 201 });
    });
    await expect(client.createHousehold('Minha família', 'chave-sintetica')).resolves.toMatchObject({ id: 'familia' });
  });

  it('preserva a classe do erro sem propagar conteúdo privado do servidor', async () => {
    const client = createIdentityClient(async () => Response.json({ message: 'detalhe privado' }, { status: 503 }));
    const error = await client.session().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(IdentityError);
    expect(error).toMatchObject({ status: 503 });
    expect(String(error)).not.toContain('detalhe privado');
  });

  it('usa a origem HTTPS configurada e revoga apenas o vínculo indicado', async () => {
    const client = createIdentityClient(async (input, init) => {
      expect(input).toBe('https://api.example.test/api/v1/households/familia/members/vinculo');
      expect(init?.method).toBe('DELETE');
      expect(init?.credentials).toBe('include');
      return new Response(null, { status: 204 });
    }, 'https://api.example.test/');
    await expect(client.revoke('familia', 'vinculo')).resolves.toBeUndefined();
  });

  it('recusa um destino inseguro antes de enviar credenciais', () => {
    expect(() => createIdentityClient(fetch, 'http://api.example.test')).toThrow('origem HTTPS');
  });
});
