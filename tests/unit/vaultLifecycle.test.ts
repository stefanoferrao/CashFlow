/**
 * Ciclo de vida do cofre: bloquear/desbloquear, modo senha (persistente) × modo sessão, persistência entre recarregamentos
 * e garantia de que nada sensível vai para o armazenamento em texto puro (SECURITY.md §1–2).
 *
 * "Recarregar" = módulos novos (DEK e credenciais de sessão somem) mantendo só o que foi gravado no IndexedDB.
 * Só bancos em memória: nenhum teste toca o IndexedDB do usuário.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, GOOD_SECRET, PASS, freshApp, installFakeDom, installFakePluggy, reload, setupUnlockedVault, snapshotStorage, uninstallFakeDom, type App } from './helpers/authHarness';

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

describe('modo senha: bloquear / desbloquear', () => {
  it('bloquear descarta a chave: credenciais e registros cifrados ficam inacessíveis', async () => {
    await setupUnlockedVault(app);
    const blob = await app.vault.sealRecord('accounts:x', { saldo: 10 });
    app.vault.lock();
    expect(app.vault.isUnlocked()).toBe(false);
    expect(app.vault.getVaultMode()).toBeNull();
    await expect(app.vault.useCredentials(async () => 1)).rejects.toMatchObject({ code: 'locked' });
    await expect(app.vault.sealRecord('accounts:x', 1)).rejects.toMatchObject({ code: 'locked' });
    await expect(app.vault.openRecord('accounts:x', blob)).rejects.toMatchObject({ code: 'locked' });
  });

  it('bloquear NÃO apaga nada: o cofre e as credenciais cifradas continuam armazenados', async () => {
    await setupUnlockedVault(app);
    app.vault.lock();
    expect(await app.vault.vaultExists()).toBe(true);
    expect(await app.vault.hasStoredCredentials()).toBe(true);
  });

  it('senha certa reabre o MESMO cofre: credenciais intactas e registros antigos ainda decifram (3 ciclos)', async () => {
    await setupUnlockedVault(app);
    const blob = await app.vault.sealRecord('accounts:x', { saldo: 10 });
    for (let i = 0; i < 3; i++) {
      app.vault.lock();
      await app.vault.unlock(PASS);
      expect(app.vault.isUnlocked()).toBe(true);
      expect(app.vault.getVaultMode()).toBe('passphrase');
      await expect(app.vault.useCredentials(async (c) => c)).resolves.toEqual({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET });
      await expect(app.vault.openRecord('accounts:x', blob)).resolves.toEqual({ saldo: 10 });
    }
  });

  it('senha errada é recusada, segue bloqueado e NÃO apaga nem altera nada (5 tentativas)', async () => {
    await setupUnlockedVault(app);
    const before = JSON.stringify(await snapshotStorage(app));
    app.vault.lock();
    for (let i = 0; i < 5; i++) {
      await expect(app.vault.unlock('senha-errada-' + i)).rejects.toMatchObject({ code: 'wrong_passphrase' });
      expect(app.vault.isUnlocked()).toBe(false);
    }
    expect(JSON.stringify(await snapshotStorage(app))).toBe(before);
    await app.vault.unlock(PASS);
    await expect(app.vault.useCredentials(async (c) => c.clientSecret)).resolves.toBe(GOOD_SECRET);
  });

  it('trocar a senha local mantém as credenciais e os dados; a senha antiga deixa de funcionar', async () => {
    await setupUnlockedVault(app);
    const blob = await app.vault.sealRecord('accounts:x', { saldo: 10 });
    await app.vault.changePassphrase(PASS, 'Outra-Senha-Local-2027');
    app.vault.lock();
    await expect(app.vault.unlock(PASS)).rejects.toMatchObject({ code: 'wrong_passphrase' });
    await app.vault.unlock('Outra-Senha-Local-2027');
    await expect(app.vault.useCredentials(async (c) => c.clientSecret)).resolves.toBe(GOOD_SECRET);
    await expect(app.vault.openRecord('accounts:x', blob)).resolves.toEqual({ saldo: 10 });
  });

  it('remover credenciais preserva o cofre (e só as credenciais)', async () => {
    await setupUnlockedVault(app);
    await app.vault.removeCredentials();
    expect(await app.vault.hasStoredCredentials()).toBe(false);
    expect(await app.vault.vaultExists()).toBe(true);
    app.vault.lock();
    await app.vault.unlock(PASS);
    await expect(app.vault.useCredentials(async () => 1)).rejects.toMatchObject({ code: 'no_credentials' });
  });
});

describe('persistência entre recarregamentos (modo senha)', () => {
  it('depois de recarregar: cofre trancado por desenho, mas nada foi perdido — a senha local basta (sem redigitar Client ID/Secret)', async () => {
    await setupUnlockedVault(app);
    app = await reload(app);
    expect(app.vault.isUnlocked()).toBe(false);
    expect(await app.vault.vaultExists()).toBe(true);
    expect(await app.vault.hasStoredCredentials()).toBe(true);

    await app.vault.unlock(PASS);
    await expect(app.vault.useCredentials(async (c) => c)).resolves.toEqual({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET });
  });

  it('boot() depois de recarregar abre a tela de desbloqueio (não o onboarding) e sabe que há credenciais salvas', async () => {
    await setupUnlockedVault(app);
    await app.actions.updatePreferences({ mode: 'real' });
    app = await reload(app);
    await app.actions.boot();
    expect(app.store.state.mode).toBe('locked');
    expect(app.store.state.connection.hasCredentials).toBe(true);
  });

  it('unlockVault() depois de recarregar leva ao app com as credenciais, sem pedir Client ID/Secret', async () => {
    await setupUnlockedVault(app);
    await app.actions.updatePreferences({ mode: 'real' });
    app = await reload(app);
    await app.actions.boot();
    await app.actions.unlockVault(PASS);
    expect(app.store.state.mode).toBe('real');
    expect(app.store.state.connection.hasCredentials).toBe(true);
    expect(app.store.state.connection.vaultMode).toBe('passphrase');
  });

  it('senha errada no unlockVault() mantém a tela de desbloqueio e as credenciais salvas', async () => {
    await setupUnlockedVault(app);
    await app.actions.updatePreferences({ mode: 'real' });
    app = await reload(app);
    await app.actions.boot();
    await expect(app.actions.unlockVault('senha-errada-123')).rejects.toMatchObject({ code: 'wrong_passphrase' });
    expect(app.store.state.mode).toBe('locked');
    expect(await app.vault.hasStoredCredentials()).toBe(true);
  });
});

describe('modo sessão ("Usar somente nesta sessão")', () => {
  it('não grava NADA: nem cofre, nem credenciais, nem dados', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
    expect(app.vault.getVaultMode()).toBe('session');
    expect(app.vault.hasSessionCredentials()).toBe(true);
    expect(await app.vault.vaultExists()).toBe(false);
    expect(await app.vault.hasStoredCredentials()).toBe(false);
    const stored = await snapshotStorage(app);
    const secureStores = Object.entries(stored).filter(([name]) => name !== 'user_preferences');
    for (const [name, records] of secureStores) expect(records, `store ${name}`).toHaveLength(0);
    expect(app.vault.canPersistData()).toBe(false);
  });

  it('as credenciais existem só na memória: depois de recarregar não há nada para desbloquear (por desenho)', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
    app = await reload(app);
    expect(app.vault.isUnlocked()).toBe(false);
    expect(await app.vault.vaultExists()).toBe(false);
    expect(await app.vault.hasStoredCredentials()).toBe(false);
  });

  it('bloquear (manual) descarta a sessão e volta ao onboarding', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
    app.actions.lockApp('manual');
    expect(app.store.state.mode).toBe('onboarding');
    expect(app.vault.hasSessionCredentials()).toBe(false);
    expect(app.vault.isUnlocked()).toBe(false);
  });

  it('modo sessão não deixa rastro de credenciais mesmo depois de bloquear', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
    app.actions.lockApp('manual');
    const dump = JSON.stringify(await snapshotStorage(app));
    expect(dump).not.toContain(GOOD_SECRET);
    expect(dump).not.toContain(CLIENT_ID);
  });
});

describe('modo senha grava, mas nunca em texto puro (SECURITY.md)', () => {
  it('Client ID, Client Secret e senha local não aparecem em nenhum registro armazenado', async () => {
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    expect(app.vault.getVaultMode()).toBe('passphrase');
    const stored = await snapshotStorage(app);
    expect(stored['pluggy_credentials']!.map((r) => r.id).sort()).toEqual(['credentials', 'vault']);
    const dump = JSON.stringify(stored);
    expect(dump).not.toContain(GOOD_SECRET);
    expect(dump).not.toContain(CLIENT_ID);
    expect(dump).not.toContain(PASS);
    expect(dump).not.toContain('apiKey');
    expect(JSON.stringify([(globalThis as { localStorage?: unknown }).localStorage, (globalThis as { sessionStorage?: unknown }).sessionStorage])).not.toContain(GOOD_SECRET);
  });

  it('o registro do cofre tem só material de derivação/embrulho (KDF PBKDF2-SHA256 ≥ 600 mil iterações, salt, DEK embrulhada) — nenhuma chave em claro', async () => {
    await setupUnlockedVault(app);
    const meta = (await snapshotStorage(app))['pluggy_credentials']!.find((r) => r.id === 'vault') as {
      kdf: { name: string; hash: string; iterations: number; salt: string };
      wrappedDek: string;
      wrapIv: string;
      [k: string]: unknown;
    };
    expect(meta.kdf.name).toBe('PBKDF2');
    expect(meta.kdf.hash).toBe('SHA-256');
    expect(meta.kdf.iterations).toBeGreaterThanOrEqual(600_000);
    expect(meta.kdf.salt.length).toBeGreaterThanOrEqual(22); // 16 bytes em base64
    expect(meta.wrappedDek.length).toBeGreaterThan(40); // 32 bytes + tag GCM, embrulhados
    expect(Object.keys(meta).sort()).toEqual(['createdAt', 'id', 'kdf', 'version', 'wrapIv', 'wrappedDek']);
  });

  it('cada gravação usa IV novo (mesmo conteúdo → blobs diferentes) e o AAD amarra o registro ao seu lugar', async () => {
    await setupUnlockedVault(app);
    const a = await app.vault.sealRecord('accounts:1', { v: 1 });
    const b = await app.vault.sealRecord('accounts:1', { v: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    await expect(app.vault.openRecord('accounts:2', a)).rejects.toBeDefined();
    await expect(app.vault.openRecord('accounts:1', a)).resolves.toEqual({ v: 1 });
  });
});
