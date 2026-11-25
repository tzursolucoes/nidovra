const apiOrigin = 'https://nidovra-api.tzursolucoes.workers.dev';
const forwardHeaders = ['content-type', 'cookie', 'idempotency-key', 'origin'];

/** Conserva o cookie do Nidovra no domínio do Pages e evita redirecionar credenciais. */
export async function onRequest({ request }) {
  const current = new URL(request.url);
  const upstream = new URL(apiOrigin);
  upstream.pathname = current.pathname;
  upstream.search = current.search;
  const headers = new Headers();
  for (const name of forwardHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstreamRequest = new Request(new Request(upstream, request), { headers, redirect: 'manual' });
    const response = await fetch(upstreamRequest);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: { code: 'API_UNAVAILABLE' } }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
