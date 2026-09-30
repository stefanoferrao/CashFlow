/**
 * M6 — se existe cofre, o boot abre a tela de bloqueio em vez do demo salvo.
 *
 * Bug (Fase 1, ainda presente): boot() dava precedência a `preferences.mode === 'demo'` sobre o cofre. Quem já tinha credenciais
 * salvas e uma vez clicou em "Ver demonstração" passava a abrir SEMPRE o demo — e achava que as credenciais tinham sumido.
 *
 * Contrato: com cofre → mode 'locked' (nada apagado/alterado no IndexedDB; preferences continuam com mode 'demo');
 * sem cofre + demo salvo → abre o demo como antes. "Ver demonstração" e exitDemo() seguem funcionando.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASS, freshApp, installFakeDom, installFakePluggy, reload, setupUnlockedVault, snapshotStorage, uninstallFakeDom, type App } from './helpers/authHarness';

let app: App;

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  installFakeDom();
  installFakePluggy();
  app = await freshApp();
});

afterEach(() => {
  vi.unstubAllGlobals();
  uninstallFakeDom();
});

const storedPrefs = (a: App) => a.repo.plainRepo.get<{ mode: string | null }>('user_preferences', 'prefs');

/** Usuário com cofre + credenciais que, em algum momento, abriu o demo (preferência 'demo' gravada). Devolve o app "recarregado". */
async function reloadedWithVaultAndDemoPref(): Promise<App> {
  await setupUnlockedVault(app);
  await app.actions.updatePreferences({ mode: 'demo' });
  return reload(app);
}

describe('boot() com cofre e preferência "demo" salva', () => {
  it('abre a tela de BLOQUEIO (não o demo) e sabe que há credenciais salvas', async () => {
    app = await reloadedWithVaultAndDemoPref();
    await app.actions.boot();
    expect(app.store.state.mode).toBe('locked');
    expect(app.store.state.connection.hasCredentials).toBe(true);
    expect(app.vault.isUnlocked()).toBe(false);
  });

  it('não altera NADA no IndexedDB (registros byte-idênticos) e a preferência continua "demo"', async () => {
    app = await reloadedWithVaultAndDemoPref();
    const before = JSON.stringify(await snapshotStorage(app));
    await app.actions.boot();
    expect(JSON.stringify(await snapshotStorage(app))).toBe(before);
    expect((await storedPrefs(app))!.mode).toBe('demo');
  });

  it('desbloquear com a senha certa entra no app real e grava mode "real"', async () => {
    app = await reloadedWithVaultAndDemoPref();
    await app.actions.boot();
    await app.actions.unlockVault(PASS);
    expect(app.store.state.mode).toBe('real');
    expect((await storedPrefs(app))!.mode).toBe('real');
    await expect(app.vault.useCredentials(async (c) => c.clientSecret)).resolves.toBeTruthy();
  });

  it('senha errada mantém a tela de bloqueio e não muda a preferência', async () => {
    app = await reloadedWithVaultAndDemoPref();
    await app.actions.boot();
    await expect(app.actions.unlockVault('senha-errada-123')).rejects.toMatchObject({ code: 'wrong_passphrase' });
    expect(app.store.state.mode).toBe('locked');
    expect((await storedPrefs(app))!.mode).toBe('demo');
  });

  it('"Ver demonstração" na tela de bloqueio ainda abre o demo e exitDemo() volta ao bloqueio sem apagar o cofre', async () => {
    app = await reloadedWithVaultAndDemoPref();
    await app.actions.boot();
    app.actions.startDemo();
    expect(app.store.state.mode).toBe('demo');

    await app.actions.exitDemo();
    expect(app.store.state.mode).toBe('locked');
    expect(await app.vault.vaultExists()).toBe(true);
    expect(await app.vault.hasStoredCredentials()).toBe(true);

    await app.actions.unlockVault(PASS);
    expect(app.store.state.mode).toBe('real');
  });

  it('abrir o demo e recarregar: com cofre, volta para a tela de bloqueio (as credenciais nunca "somem")', async () => {
    app = await reloadedWithVaultAndDemoPref();
    await app.actions.boot();
    app.actions.startDemo();
    await vi.waitFor(async () => expect((await storedPrefs(app))!.mode).toBe('demo'));
    app = await reload(app);
    await app.actions.boot();
    expect(app.store.state.mode).toBe('locked');
    expect(app.store.state.connection.hasCredentials).toBe(true);
  });
});

describe('boot() sem cofre', () => {
  it('preferência "demo" salva e nenhum cofre: continua abrindo o demo (inalterado)', async () => {
    await app.actions.updatePreferences({ mode: 'demo' });
    app = await reload(app);
    await app.actions.boot();
    expect(app.store.state.mode).toBe('demo');
    expect(await app.vault.vaultExists()).toBe(false);
  });

  it('sem cofre e sem preferência: onboarding (inalterado)', async () => {
    await app.actions.boot();
    expect(app.store.state.mode).toBe('onboarding');
  });

  it('cofre sem demo: tela de bloqueio (inalterado)', async () => {
    await setupUnlockedVault(app);
    await app.actions.updatePreferences({ mode: 'real' });
    app = await reload(app);
    await app.actions.boot();
    expect(app.store.state.mode).toBe('locked');
  });
});
