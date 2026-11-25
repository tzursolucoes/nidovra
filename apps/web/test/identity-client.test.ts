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

  it('envia entrada, cadastro e saída na mesma origem sem ler dados de autenticação', async () => {
    const calls: [RequestInfo | URL, RequestInit | undefined][] = [];
    const client = createIdentityClient(async (input, init) => {
      calls.push([input, init]);
      return new Response(null, { status: 204 });
    });

    await expect(client.signIn('autor@example.test', 'senha-sintetica')).resolves.toBeUndefined();
    await expect(client.signUp('Conta de teste', 'autor@example.test', 'senha-sintetica')).resolves.toBeUndefined();
    await expect(client.signOut()).resolves.toBeUndefined();
    expect(calls.map(([input, init]) => ({
      input,
      method: init?.method,
      credentials: init?.credentials,
      cache: init?.cache,
      contentType: new Headers(init?.headers).get('Content-Type'),
      body: JSON.parse(String(init?.body)),
    }))).toEqual([
      {
        input: '/api/v1/auth/sign-in/email', method: 'POST', credentials: 'include', cache: 'no-store',
        contentType: 'application/json', body: { email: 'autor@example.test', password: 'senha-sintetica' },
      },
      {
        input: '/api/v1/auth/sign-up/email', method: 'POST', credentials: 'include', cache: 'no-store',
        contentType: 'application/json',
        body: { name: 'Conta de teste', email: 'autor@example.test', password: 'senha-sintetica' },
      },
      {
        input: '/api/v1/auth/sign-out', method: 'POST', credentials: 'include', cache: 'no-store',
        contentType: 'application/json', body: {},
      },
    ]);
  });

  it('preserva o status do login pendente de verificação sem propagar detalhes do provedor', async () => {
    const client = createIdentityClient(async () => Response.json({ message: 'detalhe privado' }, { status: 403 }));
    const error = await client.signIn('autor@example.test', 'senha-sintetica').catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(IdentityError);
    expect(error).toMatchObject({ status: 403 });
    expect(String(error)).not.toContain('detalhe privado');
  });

  it('solicita e confirma o código de verificação pelo contrato do provedor', async () => {
    const calls: { path: string; payload: unknown }[] = [];
    const client = createIdentityClient(async (input, init) => {
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      calls.push({ path: String(input), payload: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 204 });
    });

    await client.sendVerificationCode('autor@example.test');
    await client.verifyEmail('autor@example.test', '012345');

    expect(calls).toEqual([
      {
        path: '/api/v1/auth/send-verification-email',
        payload: { email: 'autor@example.test' },
      },
      {
        path: '/api/v1/auth/email-otp/verify-email',
        payload: { email: 'autor@example.test', otp: '012345' },
      },
    ]);
  });

  it('aproveita a sessão aberta pelo provedor sem reenviar a senha', async () => {
    const context = { user: { id: 'autor', email: 'autor@example.test' }, memberships: [] };
    const client = createIdentityClient(async (input) => {
      expect(input).toBe('/api/v1/session/context');
      return Response.json(context);
    });

    await expect(client.sessionAfterVerification('autor@example.test', 'senha-sintetica')).resolves.toEqual(context);
  });

  it.each([401, 403])('tenta entrar uma vez quando o código foi confirmado e a sessão devolve %s', async (status) => {
    const requests: string[] = [];
    const context = { user: { id: 'autor', email: 'autor@example.test' }, memberships: [] };
    const client = createIdentityClient(async (input, init) => {
      requests.push(String(input));
      if (requests.length === 1) return new Response(null, { status });
      if (requests.length === 2) {
        expect(JSON.parse(String(init?.body))).toEqual({ email: 'autor@example.test', password: 'senha-sintetica' });
        return new Response(null, { status: 204 });
      }
      return Response.json(context);
    });

    await expect(client.sessionAfterVerification('autor@example.test', 'senha-sintetica')).resolves.toEqual(context);
    expect(requests).toEqual(['/api/v1/session/context', '/api/v1/auth/sign-in/email', '/api/v1/session/context']);
  });

  it('oferece entrada manual quando a sessão está ausente e a senha não está em memória', async () => {
    const client = createIdentityClient(async (input) => {
      expect(input).toBe('/api/v1/session/context');
      return new Response(null, { status: 401 });
    });

    await expect(client.sessionAfterVerification('autor@example.test')).resolves.toBeNull();
  });

  it('propaga indisponibilidade após verificar sem tentar reenviar credenciais', async () => {
    const client = createIdentityClient(async (input) => {
      expect(input).toBe('/api/v1/session/context');
      return new Response(null, { status: 503 });
    });

    await expect(client.sessionAfterVerification('autor@example.test', 'senha-sintetica')).rejects.toMatchObject({ status: 503 });
  });

  it('não abre o contexto familiar de outro e-mail ao concluir a verificação', async () => {
    const client = createIdentityClient(async () => Response.json({
      user: { id: 'outro', email: 'outra-conta@example.test' }, memberships: [],
    }));

    await expect(client.sessionAfterVerification('autor@example.test', 'senha-sintetica')).rejects.toMatchObject({ status: 409 });
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
