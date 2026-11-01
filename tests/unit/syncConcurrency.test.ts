/**
 * Sincronização concorrente com bloqueio, remoção de instituição e novas conexões.
 * Cobre o que acontece quando o usuário (ou outra parte do app) mexe no estado enquanto
 * "Atualizar agora" ainda está baixando dados da Pluggy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASS, freshApp, installFakeDom, setupUnlockedVault, uninstallFakeDom, type App } from './helpers/authHarness';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

function jwt(): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
}
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let calls: string[] = [];
let gate: Promise<void> | null = null;
let gatedItem = A;
let release: () => void = () => {};
let authGate: Promise<void> | null = null;
let authRelease: () => void = () => {};

function installPluggy(): void {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push(`${init.method ?? 'GET'} ${url.pathname}${url.search}`);
    if (url.pathname === '/auth') {
      if (authGate) await authGate;
      return res(200, { apiKey: jwt() });
    }
    if (url.pathname.startsWith('/items/')) {
      const id = url.pathname.split('/')[2]!;
      return res(200, { id, status: 'UPDATED', executionStatus: 'SUCCESS', connector: { id: 201, name: `Banco ${id.slice(0, 4)}` }, lastUpdatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/accounts') {
      const itemId = url.searchParams.get('itemId')!;
      if (gate && itemId === gatedItem) await gate;
      return res(200, { page: 1, total: 1, totalPages: 1, results: [{ id: `acc-${itemId}`, itemId, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'CC', number: '1234-5', balance: 100, currencyCode: 'BRL' }] });
    }
    if (url.pathname === '/v2/transactions') {
      const acc = url.searchParams.get('accountId')!;
      return res(200, { results: [{ id: `tx-${acc}`, date: '2026-10-01T00:00:00.000Z', description: 'x', amount: -10, currencyCode: 'BRL', status: 'POSTED' }], next: null });
    }
    return res(200, { page: 1, total: 0, totalPages: 1, results: [] });
  }) as typeof fetch;
}

/** Registra Items como o app faz (registro em pluggy_items; itemIds vem dele). */
async function register(...ids: string[]): Promise<void> {
  for (const id of ids) await app.repo.secureRepo.put('pluggy_items', id, { itemId: id, addedAt: new Date().toISOString(), data: null });
  await app.actions.loadCache();
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const fetchedAccountsOf = (id: string) => calls.filter((c) => c.includes(`/accounts?itemId=${id}`)).length;

let app: App;
beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  installFakeDom();
  installPluggy();
  gate = null;
  gatedItem = A;
  authGate = null;
  app = await freshApp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallFakeDom();
});

describe('syncAll: pedidos que chegam durante uma sincronização', () => {
  it('nova instituição adicionada durante a sincronização completa também é baixada', async () => {
    await setupUnlockedVault(app);
    await register(A);
    gate = new Promise((r) => (release = r));
    const full = app.actions.syncAll();
    await tick();
    const add = app.actions.addItemById(B);
    await tick();
    release();
    await Promise.all([full, add]);
    expect(fetchedAccountsOf(B)).toBeGreaterThan(0);
    expect(app.store.state.dataset.items.map((i) => i.id)).toContain(B);
  });

  it('"Atualizar agora" durante a sincronização de um só item baixa também os outros', async () => {
    await setupUnlockedVault(app);
    await register(A, B);
    gate = new Promise((r) => (release = r));
    const single = app.actions.syncAll({ onlyItemId: A });
    await tick();
    const full = app.actions.syncAll();
    release();
    await Promise.all([single, full]);
    expect(fetchedAccountsOf(B)).toBeGreaterThan(0);
  });

  it('pedido já coberto pela sincronização em andamento reaproveita a mesma', async () => {
    await setupUnlockedVault(app);
    await register(A, B);
    gate = new Promise((r) => (release = r));
    const full = app.actions.syncAll();
    await tick();
    const again = app.actions.syncAll({ onlyItemId: A });
    release();
    await Promise.all([full, again]);
    expect(fetchedAccountsOf(A)).toBe(1);
  });

  it('instituição removida durante a sincronização não volta', async () => {
    await setupUnlockedVault(app);
    await register(B, A);
    await app.actions.syncAll();
    const order = app.store.state.itemIds;
    const victim = order[order.length - 1]!;
    gatedItem = order[0]!;
    gate = new Promise((r) => (release = r));
    const s = app.actions.syncAll();
    await tick();
    await app.actions.removeItemLocally(victim);
    release();
    await s;
    expect(app.store.state.itemIds).not.toContain(victim);
    expect(app.store.state.dataset.items.map((i) => i.id)).not.toContain(victim);
  });
});

describe('syncAll: bloqueio no meio da sincronização', () => {
  it('bloquear enquanto baixa contas não republica dados financeiros', async () => {
    await setupUnlockedVault(app);
    await register(A);
    gate = new Promise((r) => (release = r));
    const s = app.actions.syncAll();
    await tick();
    app.actions.lockApp('manual');
    release();
    await s;
    await tick();
    expect(app.store.state.mode).toBe('locked');
    expect(app.store.state.dataset.accounts).toHaveLength(0);
    expect(app.store.state.dataset.transactions).toHaveLength(0);
    expect(app.store.state.itemIds).toHaveLength(0);
    expect(app.store.state.sync.status).not.toBe('error');
  });

  it('bloquear durante /auth não deixa o cliente antigo seguir baixando', async () => {
    await setupUnlockedVault(app);
    await register(A);
    authGate = new Promise((r) => (authRelease = r));
    const s = app.actions.syncAll();
    await tick();
    app.actions.lockApp('manual');
    authRelease();
    await s;
    await tick();
    expect(calls.filter((c) => !c.startsWith('POST /auth'))).toEqual([]);
    expect(app.store.state.dataset.accounts).toHaveLength(0);
  });

  it('bloquear durante uma sincronização que falha não mostra erro nem dados do item', async () => {
    await setupUnlockedVault(app);
    await register(A);
    await app.actions.syncAll();
    gate = new Promise((r) => (release = r));
    const s = app.actions.syncAll();
    await tick();
    app.actions.lockApp('manual');
    release();
    await s;
    await tick();
    expect(app.store.state.dataset.items).toHaveLength(0);
    expect(app.store.state.itemIds).toHaveLength(0);
    expect(app.store.state.sync.status).not.toBe('error');
  });
});

describe('syncAll: falha inesperada de armazenamento', () => {
  it('não deixa a tela de carregamento presa nem rejeita a promessa', async () => {
    await setupUnlockedVault(app);
    await register(A);
    const orig = app.repo.secureRepo.getAll;
    let n = 0;
    app.repo.secureRepo.getAll = (async (s: never) => {
      if (s === 'pluggy_items' && n++ === 0) throw new DOMException('Transaction aborted', 'AbortError');
      return orig(s);
    }) as typeof orig;
    await expect(app.actions.syncAll()).resolves.toBeUndefined();
    expect(app.store.state.sync.status).toBe('error');
    expect(app.store.state.sync.blocking).toBe(false);
    app.repo.secureRepo.getAll = orig;
  });
});

describe('syncAll: depois de bloquear e desbloquear', () => {
  it('a sincronização pedida na sessão nova roda, mesmo com a da sessão anterior ainda presa na rede', async () => {
    await setupUnlockedVault(app);
    await register(A);
    await app.actions.syncAll();
    const before = fetchedAccountsOf(A);
    gate = new Promise((r) => (release = r));
    const dead = app.actions.syncAll();
    await tick();
    app.actions.lockApp('manual');
    await app.actions.unlockVault(PASS);
    gate = null;
    // No harness o cache fica só em memória (limpo no bloqueio); com IndexedDB o Item continuaria registrado.
    await register(A);
    const fresh = app.actions.syncAll();
    await fresh;
    release();
    await dead;
    expect(fetchedAccountsOf(A)).toBe(before + 2);
    expect(app.store.state.sync.status).toBe('idle');
    expect(app.store.state.sync.lastSyncAt).not.toBeNull();
    expect(app.store.state.dataset.accounts).toHaveLength(1);
  });
});

describe('syncAll: testar a conexão durante a sincronização de um item', () => {
  it('não derruba a sincronização em andamento com um erro falso', async () => {
    await setupUnlockedVault(app);
    await register(A);
    gate = new Promise((r) => (release = r));
    const s = app.actions.syncAll({ onlyItemId: A });
    await tick();
    await app.actions.testConnection();
    release();
    await s;
    expect(app.store.state.sync.status).toBe('idle');
    expect(app.store.state.dataset.items.find((i) => i.id === A)?.syncState).not.toBe('error');
  });
});
