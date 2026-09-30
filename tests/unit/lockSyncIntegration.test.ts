/**
 * Propagação do bloqueio entre abas pelo caminho REAL (actions + cofre + store), com duas "abas" = duas instâncias dos módulos
 * ligadas por um BroadcastChannel falso. Decisão do usuário: só o SINAL de bloqueio atravessa; nenhuma chave trafega e cada aba
 * continua pedindo a própria senha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, GOOD_SECRET, MINUTE, PASS, freshApp, installFakeDom, installFakePluggy, setupUnlockedVault, uninstallFakeDom, type App } from './helpers/authHarness';
import { installFakeBroadcastChannel, settle, type FakeHub } from './helpers/fakeBroadcastChannel';

let hub: FakeHub;

beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
  installFakeDom();
  installFakePluggy();
  hub = installFakeBroadcastChannel();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uninstallFakeDom();
});

/** Uma aba: módulos próprios (cofre/estado), desbloqueada, com a sincronização de bloqueio ligada. */
async function openTab(): Promise<App> {
  const app = await freshApp();
  await setupUnlockedVault(app);
  app.actions.startLockSync();
  return app;
}

async function openSessionTab(): Promise<App> {
  const app = await freshApp();
  await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
  app.actions.startLockSync();
  return app;
}

describe('bloqueio manual propaga para as outras abas', () => {
  it('A bloqueia → B vai para "locked" (cofre fechado), A continua "locked" e só UM sinal foi postado (B não retransmite)', async () => {
    const a = await openTab();
    const b = await openTab();
    expect(b.store.state.mode).toBe('real');
    expect(b.vault.isUnlocked()).toBe(true);

    a.actions.lockApp('manual');
    await settle();

    expect(a.store.state.mode).toBe('locked');
    expect(a.vault.isUnlocked()).toBe(false);
    expect(b.store.state.mode).toBe('locked');
    expect(b.vault.isUnlocked()).toBe(false);
    expect(b.store.state.connection.clientIdHint).toBeNull();
    expect(hub.posted).toEqual([{ type: 'lock' }]);
  });

  it('B mostra o aviso "Cofre bloqueado" (outra aba); A (que bloqueou) não', async () => {
    const a = await openTab();
    const b = await openTab();
    const seenB: Array<{ title: string; message?: string }> = [];
    const seenA: Array<{ title: string }> = [];
    b.notify.onNotify((n) => seenB.push(n));
    a.notify.onNotify((n) => seenA.push(n));

    a.actions.lockApp('manual');
    await settle();

    const n = seenB.find((x) => x.title === 'Cofre bloqueado');
    expect(n).toBeDefined();
    expect(n!.message).toContain('outra aba');
    expect(seenA.find((x) => x.title === 'Cofre bloqueado')).toBeUndefined();
  });

  it('três abas: todas as outras bloqueiam, ninguém retransmite (1 sinal)', async () => {
    const a = await openTab();
    const b = await openTab();
    const c = await openTab();
    b.actions.lockApp('manual');
    await settle();
    expect([a, b, c].map((t) => t.store.state.mode)).toEqual(['locked', 'locked', 'locked']);
    expect(hub.posted).toHaveLength(1);
  });

  it('cada aba continua pedindo a PRÓPRIA senha: senha errada é recusada na aba bloqueada pelo sinal', async () => {
    const a = await openTab();
    const b = await openTab();
    a.actions.lockApp('manual');
    await settle();
    await expect(b.actions.unlockVault('senha-errada-123')).rejects.toMatchObject({ code: 'wrong_passphrase' });
    expect(b.store.state.mode).toBe('locked');
    await b.actions.unlockVault(PASS);
    expect(b.store.state.mode).toBe('real');
    // desbloquear uma aba não destranca as outras
    expect(a.store.state.mode).toBe('locked');
    expect(a.vault.isUnlocked()).toBe(false);
  });

  it('lockApp("peer") direto: bloqueia localmente e NÃO retransmite (sem laço)', async () => {
    const a = await openTab();
    await openTab();
    a.actions.lockApp('peer');
    await settle();
    expect(a.store.state.mode).toBe('locked');
    expect(hub.posted).toHaveLength(0);
  });
});

describe('bloqueio por inatividade NÃO propaga', () => {
  it('lockApp("inactivity") em A: B segue desbloqueada e nada é postado', async () => {
    const a = await openTab();
    const b = await openTab();
    a.actions.lockApp('inactivity');
    await settle();
    expect(a.store.state.mode).toBe('locked');
    expect(b.store.state.mode).toBe('real');
    expect(b.vault.isUnlocked()).toBe(true);
    expect(hub.posted).toHaveLength(0);
  });

  it('o temporizador de inatividade de uma aba esquecida não bloqueia a aba em uso (caminho completo)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const forgotten = await openTab();
    const inUse = await openTab();
    forgotten.actions.startAutoLock();
    inUse.actions.startAutoLock();
    // a aba em uso está com o bloqueio em "nunca" (não trava por conta própria); só a esquecida tem o prazo de 15 min
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    inUse.store.set({ preferences: { ...inUse.store.state.preferences, autoLockMinutes: 0 } }); // "nunca" só nesta aba
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    await settle();
    expect(forgotten.store.state.mode).toBe('locked');
    expect(inUse.store.state.mode).toBe('real');
    expect(hub.posted).toHaveLength(0);
  });
});

describe('abas que não estão no app real ignoram o sinal', () => {
  it.each(['demo', 'locked', 'onboarding', 'booting'] as const)('aba em "%s" não muda de estado', async (mode) => {
    const a = await openTab();
    const b = await openTab();
    b.store.set({ mode });
    a.actions.lockApp('manual');
    await settle();
    expect(b.store.state.mode).toBe(mode);
  });

  it('aba em demo não mostra aviso nem é "bloqueada"', async () => {
    const a = await openTab();
    const b = await openTab();
    b.store.set({ mode: 'demo' });
    const seen: Array<{ title: string }> = [];
    b.notify.onNotify((n) => seen.push(n));
    a.actions.lockApp('manual');
    await settle();
    expect(seen.find((x) => x.title === 'Cofre bloqueado')).toBeUndefined();
  });
});

describe('modo sessão', () => {
  it('sinal recebido encerra a sessão: vai a "onboarding" e as credenciais (só em memória) somem', async () => {
    const a = await openTab();
    const s = await openSessionTab();
    expect(s.vault.getVaultMode()).toBe('session');
    expect(s.vault.hasSessionCredentials()).toBe(true);

    a.actions.lockApp('manual');
    await settle();
    expect(s.store.state.mode).toBe('onboarding');
    expect(s.vault.hasSessionCredentials()).toBe(false);
    expect(s.vault.isUnlocked()).toBe(false);
  });

  it('"Encerrar sessão" (bloqueio manual) numa aba de sessão também bloqueia as outras', async () => {
    const a = await openTab();
    const s = await openSessionTab();
    s.actions.lockApp('manual');
    await settle();
    expect(s.store.state.mode).toBe('onboarding');
    expect(a.store.state.mode).toBe('locked');
    expect(hub.posted).toEqual([{ type: 'lock' }]);
  });
});

describe('nada trafega além de { type: "lock" }', () => {
  it('unlock/lock/configureCredentials: tudo que o canal viu é exatamente { type: "lock" } — nunca chave, senha ou Secret', async () => {
    const a = await freshApp();
    a.actions.startLockSync();
    await a.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: PASS });
    a.actions.lockApp('manual');
    await a.actions.unlockVault(PASS);
    await a.actions.changePassphrase(PASS, 'Outra-Senha-Local-2027');
    a.actions.lockApp('manual');
    await a.actions.unlockVault('Outra-Senha-Local-2027');
    a.actions.lockApp('inactivity');
    await settle();

    expect(hub.posted).toEqual([{ type: 'lock' }, { type: 'lock' }]);
    const wire = JSON.stringify(hub.posted);
    for (const secret of [GOOD_SECRET, CLIENT_ID, PASS, 'Outra-Senha-Local-2027']) expect(wire).not.toContain(secret);
    for (const m of hub.posted) {
      expect(m).not.toBeInstanceOf(CryptoKey);
      expect(Object.keys(m as object)).toEqual(['type']);
    }
  });
});

describe('ligar / desligar a sincronização', () => {
  it('startLockSync()/stopLockSync() são idempotentes: um só canal e um só listener por aba', async () => {
    const a = await freshApp();
    a.actions.startLockSync();
    a.actions.startLockSync();
    a.actions.startLockSync();
    expect(hub.openCount('cashflow.lock')).toBe(1);
    expect(hub.listenerCount()).toBe(1);
    a.actions.stopLockSync();
    a.actions.stopLockSync();
    expect(hub.openCount()).toBe(0);
  });

  it('depois de stopLockSync() a aba não reage ao sinal nem o emite', async () => {
    const a = await openTab();
    const b = await openTab();
    b.actions.stopLockSync();
    a.actions.lockApp('manual');
    await settle();
    expect(b.store.state.mode).toBe('real');
    b.actions.lockApp('manual');
    await settle();
    expect(hub.posted).toHaveLength(1); // só o de A
  });

  it('sinal malformado de outra origem de código na mesma origem é ignorado', async () => {
    const b = await openTab();
    const intruder = new hub.Channel('cashflow.lock');
    for (const junk of [{ type: 'key' }, { type: 'lock', key: 'x' }, 'lock', null, ['lock']]) intruder.postMessage(junk);
    await settle();
    expect(b.store.state.mode).toBe('real');
    expect(b.vault.isUnlocked()).toBe(true);
  });
});

describe('sem BroadcastChannel no navegador', () => {
  it('startLockSync() não lança e lockApp("manual") continua bloqueando normalmente', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const a = await freshApp();
    await setupUnlockedVault(a);
    expect(() => a.actions.startLockSync()).not.toThrow();
    expect(() => a.actions.lockApp('manual')).not.toThrow();
    expect(a.store.state.mode).toBe('locked');
    expect(a.vault.isUnlocked()).toBe(false);
    expect(() => a.actions.stopLockSync()).not.toThrow();
  });
});
