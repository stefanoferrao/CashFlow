/**
 * M5 — configureCredentials NÃO pode destruir credenciais boas quando a Pluggy recusa as novas.
 *
 * Bug (Fase 1, ainda presente): o Secret novo era gravado ANTES de validar; com `hadStored` verdadeiro a falha não removia nada,
 * então um erro de digitação em Configurações → Pluggy SOBRESCREVIA o Secret bom e o usuário tinha de redigitar tudo.
 *
 * Contrato: vault.snapshotCredentials() copia o blob JÁ CIFRADO (nunca decifra); vault.restoreCredentials(snapshot) regrava
 * exatamente o blob/savedAt anteriores (null → remove); configureCredentials restaura só em `invalid_credentials`.
 * Tudo com Pluggy e IndexedDB falsos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAD_SECRET, CLIENT_ID, GOOD_SECRET, OTHER_SECRET, PASS, freshApp, installFakeDom, installFakePluggy, setupUnlockedVault, snapshotStorage, uninstallFakeDom, type App, type FakePluggy } from './helpers/authHarness';
import { fakeIndexedDb, type Backing } from './helpers/fakeIndexedDb';

let app: App;
let pluggy: FakePluggy;

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  installFakeDom();
  pluggy = installFakePluggy('ok', [GOOD_SECRET, OTHER_SECRET]);
  app = await freshApp();
});

afterEach(() => {
  vi.unstubAllGlobals();
  uninstallFakeDom();
});

const storedCredentialsRecord = async (a: App) => (await a.db.idbGet('pluggy_credentials', 'credentials')) as { blob: { v: number; iv: string; ct: string }; savedAt: string } | undefined;
const currentSecret = (a: App) => a.vault.useCredentials(async (c) => c.clientSecret);

describe('vault.snapshotCredentials / restoreCredentials — modo senha', () => {
  it('snapshot → salvar outras → restore devolve as credenciais ORIGINAIS, com o mesmo blob cifrado (iv/ct/savedAt idênticos)', async () => {
    await setupUnlockedVault(app);
    const before = await storedCredentialsRecord(app);
    const snap = await app.vault.snapshotCredentials();
    expect(snap).not.toBeNull();
    expect(snap!.blob).toEqual(before!.blob);
    expect(snap!.savedAt).toBe(before!.savedAt);

    await app.vault.saveCredentials({ clientId: CLIENT_ID, clientSecret: OTHER_SECRET });
    await expect(currentSecret(app)).resolves.toBe(OTHER_SECRET);
    expect((await storedCredentialsRecord(app))!.blob).not.toEqual(before!.blob);

    await app.vault.restoreCredentials(snap);
    await expect(currentSecret(app)).resolves.toBe(GOOD_SECRET);
    const after = await storedCredentialsRecord(app);
    expect(after!.blob).toEqual(before!.blob);
    expect(after!.savedAt).toBe(before!.savedAt);
  });

  it('o snapshot carrega SÓ texto cifrado: nem Client ID, nem Secret, nem senha aparecem nele', async () => {
    await setupUnlockedVault(app);
    const dump = JSON.stringify(await app.vault.snapshotCredentials());
    expect(dump).not.toContain(GOOD_SECRET);
    expect(dump).not.toContain(CLIENT_ID);
    expect(dump).not.toContain(PASS);
    expect(Object.keys(JSON.parse(dump)).sort()).toEqual(['blob', 'savedAt']);
  });

  it('snapshot é null quando não há credenciais (cofre criado, nada salvo)', async () => {
    await app.vault.createVault(PASS);
    await expect(app.vault.snapshotCredentials()).resolves.toBeNull();
  });

  it('restoreCredentials(null) remove as credenciais e preserva o cofre', async () => {
    await setupUnlockedVault(app);
    await app.vault.restoreCredentials(null);
    expect(await app.vault.hasStoredCredentials()).toBe(false);
    expect(await app.vault.vaultExists()).toBe(true);
    app.vault.lock();
    await app.vault.unlock(PASS);
    await expect(app.vault.useCredentials(async () => 1)).rejects.toMatchObject({ code: 'no_credentials' });
  });

  it('o snapshot continua válido depois de um ciclo bloquear/desbloquear (é só o blob cifrado)', async () => {
    await setupUnlockedVault(app);
    const snap = await app.vault.snapshotCredentials();
    app.vault.lock();
    await app.vault.unlock(PASS);
    await app.vault.restoreCredentials(snap);
    await expect(currentSecret(app)).resolves.toBe(GOOD_SECRET);
  });
});

describe('vault.snapshotCredentials / restoreCredentials — modo sessão', () => {
  it('restaura o blob em memória e não grava nada no IndexedDB', async () => {
    await app.vault.startEphemeralSession();
    await app.vault.saveCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET });
    const snap = await app.vault.snapshotCredentials();
    expect(snap).not.toBeNull();
    await app.vault.saveCredentials({ clientId: CLIENT_ID, clientSecret: OTHER_SECRET });
    await app.vault.restoreCredentials(snap);
    await expect(currentSecret(app)).resolves.toBe(GOOD_SECRET);
    expect(await app.vault.hasStoredCredentials()).toBe(false);
    expect((await snapshotStorage(app))['pluggy_credentials']).toHaveLength(0);
  });

  it('sem credenciais: snapshot null e restore(null) mantém "sem credenciais"', async () => {
    await app.vault.startEphemeralSession();
    await expect(app.vault.snapshotCredentials()).resolves.toBeNull();
    await app.vault.saveCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET });
    await app.vault.restoreCredentials(null);
    expect(app.vault.hasSessionCredentials()).toBe(false);
  });
});

describe('configureCredentials com a Pluggy recusando as credenciais novas (invalid_credentials)', () => {
  async function withGoodStored(): Promise<void> {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    expect(app.store.state.connection.status).toBe('ok');
  }

  it('Configurações (cofre já aberto, passphrase ""): rejeita, mas o Secret BOM continua salvo e utilizável', async () => {
    await withGoodStored();
    const before = await storedCredentialsRecord(app);

    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: '' })).rejects.toMatchObject({ kind: 'invalid_credentials' });

    await expect(currentSecret(app)).resolves.toBe(GOOD_SECRET);
    expect(await app.vault.hasStoredCredentials()).toBe(true);
    const after = await storedCredentialsRecord(app);
    expect(after!.blob).toEqual(before!.blob);
    expect(after!.savedAt).toBe(before!.savedAt);
    // as credenciais salvas continuam boas: a conexão NÃO passa a "erro" e o app segue aberto
    expect(app.store.state.connection.status).toBe('ok');
    expect(app.store.state.connection.lastError).toBeNull();
    expect(app.store.state.connection.hasCredentials).toBe(true);
    expect(app.store.state.mode).toBe('real');
    expect(app.vault.isUnlocked()).toBe(true);
  });

  it('depois da recusa, "Testar conexão" ainda autentica com as credenciais antigas (nada de relogin)', async () => {
    await withGoodStored();
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: '' })).rejects.toBeDefined();
    await app.actions.testConnection();
    expect(app.store.state.connection.status).toBe('ok');
    expect(pluggy.calls.filter((c) => c.path === '/auth').at(-1)!.secret).toBe(GOOD_SECRET);
  });

  it('trocar por credenciais válidas diferentes continua funcionando (o novo Secret é salvo)', async () => {
    await withGoodStored();
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: OTHER_SECRET, passphrase: '' });
    await expect(currentSecret(app)).resolves.toBe(OTHER_SECRET);
    expect(app.store.state.connection.status).toBe('ok');
  });

  it('caminho do onboarding com o app trancado (senha local informada): recusa também preserva as credenciais boas', async () => {
    await withGoodStored();
    app.actions.lockApp('manual');
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: PASS })).rejects.toMatchObject({ kind: 'invalid_credentials' });
    expect(await app.vault.hasStoredCredentials()).toBe(true);
    await app.actions.unlockVault(PASS);
    await expect(currentSecret(app)).resolves.toBe(GOOD_SECRET);
  });

  it('1º cadastro (sem credenciais prévias): como sempre, NÃO fica nada salvo e a conexão é marcada com erro', async () => {
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: PASS })).rejects.toMatchObject({ kind: 'invalid_credentials' });
    expect(await app.vault.hasStoredCredentials()).toBe(false);
    expect(app.store.state.connection.status).toBe('error');
    expect(app.store.state.connection.lastError).toBeTruthy();
  });

  it('modo sessão: a sessão nova não tem credenciais prévias — recusa remove e marca erro (como hoje)', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: null })).rejects.toMatchObject({ kind: 'invalid_credentials' });
    expect(app.vault.hasSessionCredentials()).toBe(false);
    expect(app.store.state.connection.status).toBe('error');
  });

  it('o erro mostrado ao usuário continua sendo o da Pluggy (título/mensagem de credenciais inválidas)', async () => {
    await withGoodStored();
    const err = await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(app.errors.PluggyError);
    expect(err.title).toBe('Credenciais inválidas');
  });
});

describe('configureCredentials com erro que NÃO é invalid_credentials: nada é restaurado nem apagado', () => {
  it.each(['network', 'server-503'] as const)('%s: as credenciais novas ficam salvas (comportamento atual), nada é apagado', async (behavior) => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    pluggy.behavior = behavior;
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: OTHER_SECRET, passphrase: '' })).rejects.toBeDefined();
    expect(await app.vault.hasStoredCredentials()).toBe(true);
    await expect(currentSecret(app)).resolves.toBe(OTHER_SECRET);
    expect(app.vault.isUnlocked()).toBe(true);
    expect(app.store.state.mode).toBe('real');
  });
});

describe('restauração que falha (IndexedDB recusa gravar): avisa, não apaga nada e relança o erro ORIGINAL da Pluggy', () => {
  it('idbPut lançando na restauração → notify warn, nada removido, erro = invalid_credentials', async () => {
    const backing: Backing = new Map();
    let armed = false;
    let credentialWrites = 0;
    vi.stubGlobal(
      'indexedDB',
      fakeIndexedDb(['ok'], backing, {
        put: (store, record) => {
          if (!armed || store !== 'pluggy_credentials' || record.id !== 'credentials') return;
          credentialWrites++;
          if (credentialWrites === 2) throw new Error('QuotaExceededError');
        },
      }),
    );
    app = await freshApp();
    const seen: Array<{ kind: string; title: string }> = [];
    app.notify.onNotify((n) => seen.push(n));
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    armed = true; // 1ª gravação (Secret novo) passa; 2ª (restauração) falha

    const err = await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: '' }).catch((e) => e);

    expect(err).toBeInstanceOf(app.errors.PluggyError);
    expect(err.kind).toBe('invalid_credentials');
    const warn = seen.find((n) => n.kind === 'warn' && n.title === 'Não foi possível restaurar as credenciais anteriores');
    expect(warn, 'aviso de falha na restauração').toBeDefined();
    // nada foi apagado: o registro de credenciais continua lá (com o que a última gravação bem-sucedida deixou)
    expect(backing.get('pluggy_credentials')?.has('credentials')).toBe(true);
    expect(await app.vault.hasStoredCredentials()).toBe(true);
    expect(backing.get('pluggy_credentials')?.has('vault')).toBe(true);
    expect(app.vault.isUnlocked()).toBe(true);
  });
});
