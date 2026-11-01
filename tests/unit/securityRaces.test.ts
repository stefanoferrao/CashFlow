/**
 * Bloqueio no meio de operações lentas do cofre e credenciais recusadas no modo sessão.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAD_SECRET, CLIENT_ID, PASS, freshApp, installFakeDom, installFakePluggy, setupUnlockedVault, uninstallFakeDom, type App } from './helpers/authHarness';

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

describe('bloqueio durante operações lentas do cofre', () => {
  it('bloquear durante a troca de senha mantém a chave descartada', async () => {
    await setupUnlockedVault(app);
    const change = app.vault.changePassphrase(PASS, 'Outra-Senha-Local-2026');
    app.actions.lockApp('peer');
    await change;
    expect(app.vault.isUnlocked()).toBe(false);
    await expect(app.vault.useCredentials(async (c) => c.clientSecret)).rejects.toMatchObject({ code: 'locked' });
    // A senha nova já vale.
    await app.vault.unlock('Outra-Senha-Local-2026');
    expect(app.vault.isUnlocked()).toBe(true);
  });

  it('bloquear durante o desbloqueio não deixa o cofre aberto', async () => {
    await setupUnlockedVault(app);
    app.vault.lock();
    const unlocking = app.vault.unlock(PASS);
    app.vault.lock();
    await expect(unlocking).rejects.toMatchObject({ code: 'locked' });
    expect(app.vault.isUnlocked()).toBe(false);
  });
});

describe('credenciais no modo sessão não tocam o cofre do navegador', () => {
  it('credencial recusada no modo sessão não apaga as credenciais cifradas de um cofre existente', async () => {
    await setupUnlockedVault(app);
    app.vault.lock();
    expect(await app.vault.hasStoredCredentials()).toBe(true);
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: BAD_SECRET, passphrase: null })).rejects.toMatchObject({ kind: 'invalid_credentials' });
    expect(await app.vault.vaultExists()).toBe(true);
    expect(await app.vault.hasStoredCredentials()).toBe(true);
  });
});
