/**
 * actions.unlockVault() e actions.configureCredentials() (modo senha) pedem armazenamento persistente ao navegador,
 * sem esperar a resposta (o prompt do navegador pode demorar ou nunca vir) e sem que uma falha quebre o login.
 * Modo sessão não grava nada → não pede.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, GOOD_SECRET, PASS, freshApp, installFakeDom, installFakePluggy, reload, setupUnlockedVault, uninstallFakeDom, type App } from './helpers/authHarness';

let app: App;
let persist: ReturnType<typeof vi.fn>;

function stubStorage(impl: () => Promise<boolean>): void {
  persist = vi.fn(impl);
  vi.stubGlobal('navigator', { onLine: true, storage: { persisted: async () => false, persist } });
}

beforeEach(async () => {
  installFakeDom();
  installFakePluggy();
  stubStorage(async () => true);
  app = await freshApp();
});

afterEach(() => {
  vi.unstubAllGlobals();
  uninstallFakeDom();
});

async function lockedWithVault(): Promise<void> {
  await setupUnlockedVault(app);
  await app.actions.updatePreferences({ mode: 'real' });
  app = await reload(app);
  await app.actions.boot();
  persist.mockClear();
}

describe('pedido de armazenamento persistente', () => {
  it('unlockVault() com a senha certa pede persistência', async () => {
    await lockedWithVault();
    await app.actions.unlockVault(PASS);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });

  it('unlockVault() com a senha ERRADA não pede nada', async () => {
    await lockedWithVault();
    await expect(app.actions.unlockVault('senha-errada-123')).rejects.toMatchObject({ code: 'wrong_passphrase' });
    await new Promise((r) => setTimeout(r, 20));
    expect(persist).not.toHaveBeenCalled();
  });

  it('configureCredentials() no modo senha pede persistência depois do sucesso', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
  });

  it('configureCredentials() com credenciais inválidas não pede (falhou antes)', async () => {
    await expect(app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: 'segredo-invalido-000000', passphrase: PASS })).rejects.toBeDefined();
    await new Promise((r) => setTimeout(r, 20));
    expect(persist).not.toHaveBeenCalled();
  });

  it('modo sessão não grava nada, então não pede persistência', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(persist).not.toHaveBeenCalled();
  });

  it('é fire-and-forget: persist() que nunca responde não trava o desbloqueio', async () => {
    await lockedWithVault();
    stubStorage(() => new Promise<boolean>(() => undefined));
    await app.actions.unlockVault(PASS);
    expect(app.store.state.mode).toBe('real');
    expect(persist).toHaveBeenCalled();
  });

  it('persist() que falha não quebra o desbloqueio (o vitest reprova o arquivo se sobrar uma rejeição não tratada)', async () => {
    await lockedWithVault();
    stubStorage(async () => {
      throw new Error('SecurityError');
    });
    await app.actions.unlockVault(PASS);
    await new Promise((r) => setTimeout(r, 20));
    expect(app.store.state.mode).toBe('real');
    expect(persist).toHaveBeenCalled();
  });
});
