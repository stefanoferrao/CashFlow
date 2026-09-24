import { describe, expect, it } from 'vitest';
import { PluggyClient, buildNextPath, jwtExpiryMs } from '../../src/pluggy/client';
import { PluggyError, classifyHttpError, describeItemExecution } from '../../src/pluggy/errors';

function jwt(expSeconds: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: expSeconds, sub: 'x' })}.assinatura`;
}

type Call = { url: string; init: RequestInit };

function mockFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init, calls.length);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const creds = <T>(fn: (c: { clientId: string; clientSecret: string }) => Promise<T>) => fn({ clientId: 'cid', clientSecret: 'secret-xyz' });

describe('PluggyClient', () => {
  it('autentica em /auth e envia X-API-KEY nas chamadas', async () => {
    const key = jwt(Math.floor(Date.now() / 1000) + 7200);
    const { fn, calls } = mockFetch((url) => (url.endsWith('/auth') ? json(200, { apiKey: key }) : json(200, { id: 'item1', status: 'UPDATED' })));
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: creds, fetchImpl: fn });
    await c.getItem('item1');
    expect(calls[0]!.url).toBe('https://api.pluggy.ai/auth');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toEqual({ clientId: 'cid', clientSecret: 'secret-xyz', nonExpiring: false });
    expect((calls[1]!.init.headers as Record<string, string>)['X-API-KEY']).toBe(key);
    expect(calls[1]!.init.credentials).toBe('omit');
    // reaproveita o apiKey
    await c.getItem('item2');
    expect(calls.filter((x) => x.url.endsWith('/auth'))).toHaveLength(1);
  });

  it('403 API_KEY_MISSING_OR_INVALID → renova o apiKey e repete uma vez', async () => {
    let authCount = 0;
    const { fn, calls } = mockFetch((url) => {
      if (url.endsWith('/auth')) {
        authCount++;
        return json(200, { apiKey: jwt(Math.floor(Date.now() / 1000) + 7200) });
      }
      if (authCount === 1) return json(403, { code: 403, codeDescription: 'API_KEY_MISSING_OR_INVALID', message: 'Missing or invalid authorization token' });
      return json(200, { id: 'ok' });
    });
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: creds, fetchImpl: fn });
    await expect(c.getItem('i')).resolves.toEqual({ id: 'ok' });
    expect(authCount).toBe(2);
    expect(calls).toHaveLength(4);
  });

  it('credenciais inválidas → PluggyError invalid_credentials (sem vazar o secret)', async () => {
    const { fn } = mockFetch(() => json(401, { code: 401, codeDescription: 'CLIENT_KEYS_UNAUTHORIZED', message: 'client keys are invalid' }));
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: creds, fetchImpl: fn });
    let err: unknown;
    try {
      await c.testCredentials();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PluggyError);
    expect((err as PluggyError).kind).toBe('invalid_credentials');
    expect(JSON.stringify(err)).not.toContain('secret-xyz');
    expect(String((err as PluggyError).message)).not.toContain('secret-xyz');
  });

  it('paginação por cursor usa o campo `next` sem recodificar', async () => {
    const key = jwt(Math.floor(Date.now() / 1000) + 7200);
    const { fn, calls } = mockFetch((url) => {
      if (url.endsWith('/auth')) return json(200, { apiKey: key });
      if (url.includes('after=')) return json(200, { results: [{ id: 't3' }], next: null });
      return json(200, { results: [{ id: 't1' }, { id: 't2' }], next: '?accountId=acc1&after=YWJj%2BZGVm%3D%3D' });
    });
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: creds, fetchImpl: fn });
    const txs = await c.getAllTransactions('acc1', '2025-09-23', '2027-10-28');
    expect(txs.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(calls[1]!.url).toBe('https://api.pluggy.ai/v2/transactions?accountId=acc1&dateFrom=2025-09-23&dateTo=2027-10-28');
    expect(calls[2]!.url).toBe('https://api.pluggy.ai/v2/transactions?accountId=acc1&after=YWJj%2BZGVm%3D%3D');
  });

  it('paginação por página (/accounts) busca todas as páginas', async () => {
    const key = jwt(Math.floor(Date.now() / 1000) + 7200);
    const { fn } = mockFetch((url) => {
      if (url.endsWith('/auth')) return json(200, { apiKey: key });
      if (url.includes('page=2')) return json(200, { results: [{ id: 'a2' }], page: 2, total: 2, totalPages: 2 });
      return json(200, { results: [{ id: 'a1' }], page: 1, total: 2, totalPages: 2 });
    });
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: creds, fetchImpl: fn });
    const accs = await c.getAccounts('item');
    expect(accs.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('falha de rede com servidor alcançável (no-cors) → erro de CORS', async () => {
    const { fn } = mockFetch((_url, init) => {
      if (init.mode === 'no-cors') return new Response(null, { status: 200 });
      throw new TypeError('Failed to fetch');
    });
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: creds, fetchImpl: fn });
    let err: PluggyError | null = null;
    try {
      await c.testCredentials();
    } catch (e) {
      err = e as PluggyError;
    }
    expect(err?.kind).toBe('cors');
    expect(err?.title).toContain('CORS');
  });

  it('falha de rede sem servidor alcançável → offline', async () => {
    const { fn } = mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: creds, fetchImpl: fn });
    let kind = '';
    try {
      await c.testCredentials();
    } catch (e) {
      kind = (e as PluggyError).kind;
    }
    expect(kind).toBe('offline');
  });
});

describe('utilitários do cliente', () => {
  it('jwtExpiryMs lê o exp do JWT', () => {
    expect(jwtExpiryMs(jwt(2000000000))).toBe(2000000000 * 1000);
    expect(jwtExpiryMs('nao-e-jwt')).toBeNull();
  });
  it('buildNextPath aceita URL absoluta, caminho ou query', () => {
    expect(buildNextPath('/v2/transactions', 'accountId=a', 'https://api.pluggy.ai/v2/transactions?accountId=a&after=X')).toBe('/v2/transactions?accountId=a&after=X');
    expect(buildNextPath('/v2/transactions', 'accountId=a', '/v2/transactions?after=X')).toBe('/v2/transactions?accountId=a&after=X');
    expect(buildNextPath('/v2/items', '', 'after=Y')).toBe('/v2/items?after=Y');
  });
});

describe('classificação de erros', () => {
  it('mapeia status HTTP para mensagens amigáveis', () => {
    expect(classifyHttpError(401, { codeDescription: 'CLIENT_KEYS_UNAUTHORIZED' }, true)).toBe('invalid_credentials');
    expect(classifyHttpError(403, { codeDescription: 'API_KEY_MISSING_OR_INVALID' }, false)).toBe('token_expired');
    expect(classifyHttpError(403, { codeDescription: 'FORBIDDEN' }, false)).toBe('forbidden');
    expect(classifyHttpError(429, null, false)).toBe('rate_limit');
    expect(classifyHttpError(503, null, false)).toBe('server');
    expect(classifyHttpError(409, { codeDescription: 'CONNECTOR_OFFLINE' }, false)).toBe('institution_unavailable');
    expect(classifyHttpError(400, { message: "Item can't be updated" }, false)).toBe('item_cannot_update');
  });
  it('status do Item → estado de sincronização', () => {
    expect(describeItemExecution('UPDATING', 'TRANSACTIONS_IN_PROGRESS').state).toBe('syncing');
    expect(describeItemExecution('LOGIN_ERROR', 'INVALID_CREDENTIALS').state).toBe('action_required');
    expect(describeItemExecution('OUTDATED', 'ERROR').state).toBe('error');
    expect(describeItemExecution('UPDATED', 'SUCCESS').state).toBe('updated');
    expect(describeItemExecution('UPDATED', 'PARTIAL_SUCCESS').message).toBeTruthy();
  });
});
