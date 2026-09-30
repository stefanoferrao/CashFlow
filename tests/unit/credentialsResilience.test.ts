/**
 * Erros transitórios (rede, 5xx, apiKey expirado, IndexedDB instável) NÃO podem apagar credenciais nem forçar relogin.
 * Só bloqueio (manual/inatividade), "Remover credenciais" e "Apagar todos os dados locais" mexem no cofre.
 *
 * Tudo roda com Pluggy e IndexedDB falsos — nenhuma credencial real, nenhum banco real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, GOOD_SECRET, ITEM_ID, PASS, freshApp, installFakeDom, installFakePluggy, loadModules, setupUnlockedVault, snapshotStorage, uninstallFakeDom, type App, type FakePluggy, type PluggyBehavior } from './helpers/authHarness';
import { fakeIndexedDb, type Backing } from './helpers/fakeIndexedDb';

let app: App;
let pluggy: FakePluggy;

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  installFakeDom();
  pluggy = installFakePluggy();
  app = await freshApp();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uninstallFakeDom();
});

async function expectCredentialsIntact(): Promise<void> {
  expect(app.vault.isUnlocked()).toBe(true);
  expect(app.store.state.mode).toBe('real');
  expect(app.store.state.connection.hasCredentials).toBe(true);
  expect(await app.vault.hasStoredCredentials()).toBe(true);
  await expect(app.vault.useCredentials(async (c) => c)).resolves.toEqual({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET });
}

const TRANSIENT: PluggyBehavior[] = ['network', 'server-503', 'auth-401'];

describe('"Testar conexão" com falha', () => {
  it.each(TRANSIENT)('%s: credenciais e cofre ficam intactos e o teste seguinte (rede de volta) funciona sem relogin', async (behavior) => {
    await setupUnlockedVault(app);
    pluggy.behavior = behavior;
    await app.actions.testConnection();
    expect(app.store.state.connection.status).toBe('error');
    await expectCredentialsIntact();

    pluggy.behavior = 'ok';
    await app.actions.testConnection();
    expect(app.store.state.connection.status).toBe('ok');
    await expectCredentialsIntact();
  });
});

describe('sincronização com falha', () => {
  async function withItem(): Promise<void> {
    await setupUnlockedVault(app);
    app.store.set({ itemIds: [ITEM_ID] });
  }

  it.each(TRANSIENT)('%s na autenticação: erro exibido, mas o app segue desbloqueado, em modo real e com as credenciais salvas', async (behavior) => {
    await withItem();
    pluggy.behavior = behavior;
    await app.actions.syncAll();
    expect(app.store.state.sync.status).toBe('error');
    expect(app.store.state.sync.errorKind).not.toBeNull();
    await expectCredentialsIntact();
  });

  it('o erro é passageiro: com a Pluggy de volta a próxima sincronização autentica de novo sem pedir nada ao usuário', async () => {
    await withItem();
    pluggy.behavior = 'server-503';
    await app.actions.syncAll();
    expect(app.store.state.sync.status).toBe('error');

    pluggy.behavior = 'ok';
    const before = pluggy.authCalls();
    await app.actions.syncAll();
    expect(pluggy.authCalls()).toBeGreaterThan(before);
    expect(app.store.state.connection.status).toBe('ok');
    await expectCredentialsIntact();
  });
});

describe('apiKey expirado/recusado no meio do uso (401 / token_expired)', () => {
  it('renova UMA vez (sem laço) e, se a Pluggy continuar recusando, avisa — mas não apaga credenciais nem tranca o cofre', async () => {
    await setupUnlockedVault(app);
    pluggy.behavior = 'data-401';
    await expect(app.actions.addItemById(ITEM_ID)).rejects.toMatchObject({ kind: 'token_expired' });
    expect(pluggy.authCalls()).toBe(2); // 1ª autenticação + 1 renovação, nunca mais que isso
    await expectCredentialsIntact();

    pluggy.behavior = 'ok';
    await expect(app.actions.addItemById(ITEM_ID)).resolves.toBeUndefined();
    expect(app.store.state.itemIds).toContain(ITEM_ID);
    await expectCredentialsIntact();
  });

  it('401 passageiro: o cliente renova o apiKey em silêncio e a chamada original dá certo', async () => {
    await setupUnlockedVault(app);
    let served401 = false;
    const auth = { calls: 0 };
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth') {
        auth.calls++;
        return new Response(JSON.stringify({ apiKey: `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 7200 })}.s` }), { status: 200 });
      }
      if (!served401) {
        served401 = true;
        return new Response(JSON.stringify({ code: 401, codeDescription: 'UNAUTHORIZED', message: 'expired' }), { status: 401 });
      }
      return new Response(JSON.stringify({ id: ITEM_ID, status: 'UPDATED' }), { status: 200 });
    }) as typeof fetch;
    const client = new app.client.PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: (fn) => app.vault.useCredentials(fn), fetchImpl });
    await expect(client.getItem(ITEM_ID)).resolves.toMatchObject({ id: ITEM_ID });
    expect(auth.calls).toBe(2);
    await expectCredentialsIntact();
  });
});

describe('primeira configuração com credenciais erradas', () => {
  it('Secret inválido NÃO fica salvo, mas o cofre criado serve para a nova tentativa (mesma senha local)', async () => {
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: 'segredo-invalido-000000', passphrase: PASS })).rejects.toMatchObject({ kind: 'invalid_credentials' });
    expect(await app.vault.hasStoredCredentials()).toBe(false);
    expect(app.store.state.mode).not.toBe('real');

    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    expect(app.store.state.mode).toBe('real');
    expect(await app.vault.hasStoredCredentials()).toBe(true);
    await expectCredentialsIntact();
  });

  it('senha local errada ao reconfigurar não sobrescreve nada do que já estava salvo', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    app.actions.lockApp('manual');
    const before = JSON.stringify(await snapshotStorage(app));
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: 'senha-errada-123' })).rejects.toMatchObject({ code: 'wrong_passphrase' });
    expect(JSON.stringify(await snapshotStorage(app))).toBe(before);
    await app.actions.unlockVault(PASS);
    await expectCredentialsIntact();
  });
});

describe('IndexedDB instável no boot (H3): "as credenciais sumiram"', () => {
  /** Grava um cofre + credenciais num IndexedDB falso que funciona e devolve o conteúdo persistido. */
  async function persistedVault(): Promise<Backing> {
    const backing: Backing = new Map();
    vi.stubGlobal('indexedDB', fakeIndexedDb(['ok'], backing));
    const a: App = await freshApp();
    await a.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    expect(backing.get('pluggy_credentials')?.has('vault')).toBe(true);
    expect(backing.get('pluggy_credentials')?.has('credentials')).toBe(true);
    return backing;
  }

  it('uma falha passageira na abertura NÃO joga o usuário no onboarding: o boot acha o cofre e pede só a senha local', async () => {
    const backing = await persistedVault();
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', fakeIndexedDb(['error', 'ok'], backing));
    const fresh = await freshApp();
    const p = fresh.actions.boot();
    await vi.advanceTimersByTimeAsync(3_000);
    await p;
    expect(fresh.store.state.mode).toBe('locked');
    expect(fresh.store.state.connection.hasCredentials).toBe(true);
    expect(fresh.db.isPersistent()).toBe(true);
  });

  it('falha persistente (3 tentativas): o app avisa e NÃO apaga nem sobrescreve o que está no banco real', async () => {
    const backing = await persistedVault();
    const snapshot = JSON.stringify([...backing].map(([k, v]) => [k, [...v]]));
    vi.useFakeTimers();
    const warnings: Array<{ kind: string }> = [];
    vi.stubGlobal('indexedDB', fakeIndexedDb(['error'], backing));
    const fresh = await freshApp();
    fresh.notify.onNotify((n) => warnings.push(n));
    const p = fresh.actions.boot();
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(fresh.db.isPersistent()).toBe(false);
    expect(warnings.some((w) => w.kind === 'warn')).toBe(true);

    // o usuário, sem saber, refaz o onboarding: tudo vai para a memória; o banco real fica exatamente como estava
    await fresh.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: 'Outra-Senha-Local-2027' });
    expect(JSON.stringify([...backing].map(([k, v]) => [k, [...v]]))).toBe(snapshot);
  });

  it('depois de recarregar (IndexedDB de volta), o cofre original abre com a senha original', async () => {
    const backing = await persistedVault();
    vi.stubGlobal('indexedDB', fakeIndexedDb(['ok'], backing));
    const fresh: App = await loadModules();
    vi.resetModules();
    const again: App = await loadModules();
    void fresh;
    await again.actions.boot();
    expect(again.store.state.mode).toBe('locked');
    await again.actions.unlockVault(PASS);
    expect(again.store.state.mode).toBe('real');
    expect(again.store.state.connection.hasCredentials).toBe(true);
  });
});
