/**
 * Harness dos testes de persistência de autenticação (Node, sem navegador).
 *
 * - `installFakeDom()` cria window/document mínimos (EventTarget) para o auto-bloqueio.
 * - `freshApp()` reimporta store/vault/actions/db do zero (estado de módulo limpo).
 * - `reload(app)` simula recarregar a aba: só o que estava no "IndexedDB" (registros persistidos) sobrevive;
 *   DEK, credenciais de sessão, store e timers somem — exatamente como no navegador.
 * - `installFakePluggy()` troca o `fetch` global por uma Pluggy simulada (comportamento configurável).
 *
 * NENHUM teste usa credenciais reais. Nada aqui toca o IndexedDB do usuário (em Node o db.ts cai para memória).
 */
import { vi } from 'vitest';

// Derivar a chave (PBKDF2 de 600 mil iterações, como em produção) custa ~0,3–2 s por cofre criado/aberto; com a máquina
// ocupada (vários agentes/navegadores) o limite padrão de 5 s gerava falsos vermelhos. Só estica o prazo, sem mexer em nada mais.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

export const CLIENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const GOOD_SECRET = 'segredo-valido-1234567890';
export const OTHER_SECRET = 'outro-segredo-valido-0987654321';
export const BAD_SECRET = 'segredo-invalido-000000';
export const PASS = 'Minha-Senha-Local-2026';
export const ITEM_ID = '11111111-2222-4333-8444-555555555555';

export const MINUTE = 60_000;

// ------------------------------------------------------------------ DOM falso

export interface FakeDom {
  win: EventTarget;
  doc: EventTarget & { visibilityState: 'visible' | 'hidden'; hidden: boolean };
  /** Dispara um evento de usuário como o navegador faz: no document, que borbulha até a window. */
  fire(type: string): void;
  /** Dispara um evento só na window (focus/blur/pageshow não borbulham). */
  fireWindow(type: string): void;
  setVisibility(state: 'visible' | 'hidden'): void;
  /** Quantidade de listeners distintos ativos (window + document) — para detectar listeners duplicados. */
  listenerCount(): number;
}

export function installFakeDom(): FakeDom {
  const active = new Set<string>();
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const idOf = (fn: object) => {
    if (!ids.has(fn)) ids.set(fn, nextId++);
    return ids.get(fn)!;
  };
  const capture = (o: unknown) => (typeof o === 'boolean' ? o : !!(o as { capture?: boolean } | undefined)?.capture);
  const track = (name: string, t: EventTarget) => {
    const add = t.addEventListener.bind(t);
    const remove = t.removeEventListener.bind(t);
    t.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, o?: unknown) => {
      if (fn) active.add(`${name}|${type}|${idOf(fn)}|${capture(o)}`);
      add(type, fn, o as AddEventListenerOptions);
    }) as typeof t.addEventListener;
    t.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, o?: unknown) => {
      if (fn) active.delete(`${name}|${type}|${idOf(fn)}|${capture(o)}`);
      remove(type, fn, o as EventListenerOptions);
    }) as typeof t.removeEventListener;
  };

  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as 'visible' | 'hidden',
    hidden: false,
    hasFocus: () => true,
    documentElement: { setAttribute() {}, getAttribute: () => null },
    querySelectorAll: () => [],
  });
  track('win', win);
  track('doc', doc);

  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    };
  };
  const g = globalThis as Record<string, unknown>;
  g.window = win;
  g.document = doc;
  g.location = { search: '', pathname: '/', hash: '', href: 'http://localhost/' };
  g.history = { replaceState() {} };
  g.localStorage = mem();
  g.sessionStorage = mem();

  return {
    win,
    doc,
    fire(type) {
      doc.dispatchEvent(new Event(type, { bubbles: true }));
      win.dispatchEvent(new Event(type));
    },
    fireWindow(type) {
      win.dispatchEvent(new Event(type));
    },
    setVisibility(state) {
      doc.visibilityState = state;
      doc.hidden = state === 'hidden';
      doc.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
      win.dispatchEvent(new Event('visibilitychange'));
    },
    listenerCount: () => active.size,
  };
}

export function uninstallFakeDom(): void {
  const g = globalThis as Record<string, unknown>;
  for (const k of ['window', 'document', 'location', 'history', 'localStorage', 'sessionStorage']) delete g[k];
}

// ------------------------------------------------------------------ Pluggy falsa

function jwt(): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 7200, sub: 'mock' })}.sig`;
}

export type PluggyBehavior =
  | 'ok'
  /** fetch rejeita (TypeError) — rede caiu. */
  | 'network'
  /** POST /auth → 401 CLIENT_KEYS_UNAUTHORIZED; demais → ok. */
  | 'auth-401'
  /** Chamadas autenticadas → 401 (apiKey recusado); /auth → ok. */
  | 'data-401'
  /** Tudo → 503. */
  | 'server-503';

export interface FakePluggy {
  behavior: PluggyBehavior;
  calls: Array<{ method: string; path: string; secret?: string }>;
  authCalls(): number;
}

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function installFakePluggy(initial: PluggyBehavior = 'ok', goodSecrets: string[] = [GOOD_SECRET]): FakePluggy {
  const state: FakePluggy = {
    behavior: initial,
    calls: [],
    authCalls: () => state.calls.filter((c) => c.path === '/auth').length,
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    let secret: string | undefined;
    if (url.pathname === '/auth' && typeof init.body === 'string') secret = (JSON.parse(init.body) as { clientSecret?: string }).clientSecret;
    state.calls.push({ method, path: url.pathname, ...(secret === undefined ? {} : { secret }) });
    if (state.behavior === 'network') throw new TypeError('Failed to fetch');
    if (state.behavior === 'server-503') return res(503, { code: 503, codeDescription: 'UNAVAILABLE', message: 'try later' });
    if (url.pathname === '/auth') {
      if (state.behavior === 'auth-401' || !secret || !goodSecrets.includes(secret)) {
        return res(401, { code: 401, codeDescription: 'CLIENT_KEYS_UNAUTHORIZED', message: 'client keys are invalid' });
      }
      return res(200, { apiKey: jwt() });
    }
    if (state.behavior === 'data-401') return res(401, { code: 401, codeDescription: 'UNAUTHORIZED', message: 'token expired' });
    if (url.pathname.startsWith('/items/')) return res(200, { id: ITEM_ID, status: 'UPDATED', executionStatus: 'SUCCESS', connector: { id: 201, name: 'Banco Mock' } });
    return res(200, { page: 1, total: 0, totalPages: 1, results: [] });
  }) as typeof fetch;
  return state;
}

// ------------------------------------------------------------------ app em módulos limpos

export async function loadModules() {
  const [actions, vault, db, store, repo, errors, client, notify] = await Promise.all([
    import('../../../src/state/actions'),
    import('../../../src/security/vault'),
    import('../../../src/storage/db'),
    import('../../../src/state/store'),
    import('../../../src/storage/repository'),
    import('../../../src/pluggy/errors'),
    import('../../../src/pluggy/client'),
    import('../../../src/state/notify'),
  ]);
  return { actions, vault, db, store: store.store, repo, errors, client, notify };
}

export type App = Awaited<ReturnType<typeof loadModules>>;

export async function freshApp(): Promise<App> {
  vi.resetModules();
  return loadModules();
}

/** Tudo que está "gravado no IndexedDB" (em Node, o fallback em memória do db.ts). */
export async function snapshotStorage(app: App): Promise<Record<string, Array<Record<string, unknown>>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const s of app.db.STORES) out[s] = await app.db.idbGetAll(s);
  return out;
}

/** Recarrega a aba: módulos novos (memória zerada), mas os registros persistidos continuam. */
export async function reload(app: App): Promise<App> {
  const persisted = await snapshotStorage(app);
  const next = await freshApp();
  for (const [store, records] of Object.entries(persisted)) {
    for (const r of records) await next.db.idbPut(store as never, r as never);
  }
  return next;
}

/** Cria o cofre com senha, salva as credenciais e deixa o app em modo 'real', desbloqueado. */
export async function setupUnlockedVault(app: App, secret = GOOD_SECRET): Promise<void> {
  await app.vault.createVault(PASS);
  await app.vault.saveCredentials({ clientId: CLIENT_ID, clientSecret: secret });
  app.store.set({
    mode: 'real',
    online: true,
    connection: { hasCredentials: true, clientIdHint: 'aaaaaaaa…eeee', status: 'ok', lastError: null, vaultMode: 'passphrase', persistent: false },
  });
}
