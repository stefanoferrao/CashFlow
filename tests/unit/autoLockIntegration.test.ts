/**
 * Auto-bloqueio pelo caminho REAL do app: actions.startAutoLock() + cofre + store (só o DOM e o relógio são falsos).
 * Reproduz o relogin frequente: usar o app sem clicar (mover o mouse, rolar, focar campos) bloqueava o cofre aos 15 min,
 * e voltar para a aba deixava os dados à mostra até o próximo tick do timer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_ID,
  GOOD_SECRET,
  MINUTE,
  PASS,
  freshApp,
  installFakeDom,
  installFakePluggy,
  setupUnlockedVault,
  uninstallFakeDom,
  type App,
  type FakeDom,
} from './helpers/authHarness';

let dom: FakeDom;
let app: App;
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
/** Timers congelados (aba oculta / notebook suspenso): só o relógio anda. */
const freeze = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  vi.stubGlobal('navigator', { onLine: true });
  dom = installFakeDom();
  installFakePluggy();
  app = await freshApp();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uninstallFakeDom();
});

async function startUnlocked(): Promise<void> {
  await setupUnlockedVault(app);
  app.actions.startAutoLock();
}

describe('bloqueio por inatividade (caminho real)', () => {
  it('controle: sem nenhuma atividade bloqueia só depois de 15 min e descarta a chave do cofre', async () => {
    await startUnlocked();
    await advance(14 * MINUTE + 45_000);
    expect(app.store.state.mode).toBe('real');
    expect(app.vault.isUnlocked()).toBe(true);

    await advance(MINUTE);
    expect(app.store.state.mode).toBe('locked');
    expect(app.vault.isUnlocked()).toBe(false);
    expect(app.store.state.connection.clientIdHint).toBeNull();
    await expect(app.vault.useCredentials(async () => 'x')).rejects.toMatchObject({ code: 'locked' });
  });

  it.each(['pointermove', 'scroll', 'focusin', 'input', 'touchmove'])('%s a cada minuto mantém desbloqueado por 40 min (regressão do relogin)', async (ev) => {
    await startUnlocked();
    for (let i = 0; i < 40; i++) {
      await advance(MINUTE);
      dom.fire(ev);
    }
    expect(app.store.state.mode).toBe('real');
    expect(app.vault.isUnlocked()).toBe(true);
  });

  it('pointerdown/keydown/wheel/touchstart (já valiam antes) continuam valendo', async () => {
    await startUnlocked();
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
      await advance(10 * MINUTE);
      dom.fire(ev);
    }
    expect(app.store.state.mode).toBe('real');
  });

  it('voltar para a aba depois do prazo bloqueia IMEDIATAMENTE (sem esperar o tick de 15 s)', async () => {
    await startUnlocked();
    dom.setVisibility('hidden');
    freeze(30 * MINUTE);
    expect(app.store.state.mode).toBe('real'); // timers congelados: nada rodou ainda
    dom.setVisibility('visible');
    expect(app.store.state.mode).toBe('locked');
    expect(app.vault.isUnlocked()).toBe(false);
  });

  it('voltar para a aba ANTES do prazo não bloqueia', async () => {
    await startUnlocked();
    dom.setVisibility('hidden');
    await advance(10 * MINUTE);
    dom.setVisibility('visible');
    expect(app.store.state.mode).toBe('real');
  });

  it('clique depois do prazo não "ressuscita" a sessão: bloqueia em vez de renovar', async () => {
    await startUnlocked();
    freeze(16 * MINUTE); // o timer de 15 s ainda não rodou
    dom.fire('pointerdown');
    expect(app.store.state.mode).toBe('locked');
    expect(app.vault.isUnlocked()).toBe(false);
  });

  it('startAutoLock() chamado várias vezes NÃO duplica listeners nem timers', async () => {
    await setupUnlockedVault(app);
    app.actions.startAutoLock();
    const listeners = dom.listenerCount();
    const timers = vi.getTimerCount();
    expect(listeners).toBeGreaterThan(0);
    app.actions.startAutoLock();
    app.actions.startAutoLock();
    expect(dom.listenerCount()).toBe(listeners);
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('"nunca" (0) não bloqueia; trocar a preferência em runtime vale na hora', async () => {
    await startUnlocked();
    app.store.set({ preferences: { ...app.store.state.preferences, autoLockMinutes: 0 } });
    await advance(6 * 60 * MINUTE);
    expect(app.store.state.mode).toBe('real');

    dom.fire('pointerdown'); // o usuário clica no seletor de bloqueio automático...
    app.store.set({ preferences: { ...app.store.state.preferences, autoLockMinutes: 5 } }); // ...e escolhe 5 min
    await advance(4 * MINUTE);
    expect(app.store.state.mode).toBe('real');
    await advance(2 * MINUTE);
    expect(app.store.state.mode).toBe('locked');
  });

  it('modo demonstração nunca bloqueia (não há cofre a proteger)', async () => {
    await startUnlocked();
    app.store.set({ mode: 'demo' });
    await advance(3 * 60 * MINUTE);
    expect(app.store.state.mode).toBe('demo');
  });
});

describe('ciclo bloquear → desbloquear por inatividade', () => {
  it('as credenciais continuam lá, desbloquear abre uma janela nova e não rebloqueia de imediato', async () => {
    await startUnlocked();
    await advance(16 * MINUTE);
    expect(app.store.state.mode).toBe('locked');

    await advance(10 * MINUTE); // ficou na tela de desbloqueio
    dom.fire('keydown');
    await app.actions.unlockVault(PASS);
    expect(app.store.state.mode).toBe('real');
    expect(app.store.state.connection.hasCredentials).toBe(true);

    await advance(14 * MINUTE);
    expect(app.store.state.mode).toBe('real');
    await advance(2 * MINUTE);
    expect(app.store.state.mode).toBe('locked');
  });

  it('desbloquear sem nenhum evento de teclado/mouse (preenchimento automático) também não rebloqueia na hora', async () => {
    await startUnlocked();
    await advance(16 * MINUTE);
    expect(app.store.state.mode).toBe('locked');

    await advance(10 * MINUTE);
    await app.actions.unlockVault(PASS);
    await advance(MINUTE);
    expect(app.store.state.mode).toBe('real');
  });
});

describe('aviso ao bloquear por inatividade', () => {
  it('cofre com senha: "dados continuam cifrados"', async () => {
    const seen: Array<{ title: string; message?: string }> = [];
    app.notify.onNotify((n) => seen.push(n));
    await startUnlocked();
    await advance(16 * MINUTE);
    const n = seen.find((x) => x.title.startsWith('Sessão'));
    expect(n?.title).toBe('Sessão bloqueada');
    expect(n?.message).toContain('cifrados');
  });

  it('modo sessão: encerra a sessão e avisa que as credenciais foram descartadas (não promete dados cifrados)', async () => {
    const seen: Array<{ title: string; message?: string }> = [];
    app.notify.onNotify((n) => seen.push(n));
    await app.actions.configureCredentials({ clientId: CLIENT_ID, clientSecret: GOOD_SECRET, passphrase: null });
    expect(app.vault.getVaultMode()).toBe('session');
    app.actions.startAutoLock();

    await advance(16 * MINUTE);
    expect(app.store.state.mode).toBe('onboarding');
    expect(app.vault.hasSessionCredentials()).toBe(false);
    const n = seen.find((x) => x.title.startsWith('Sessão'));
    expect(n?.title).toBe('Sessão encerrada');
    expect(n?.message).not.toContain('continuam cifrados');
    expect(n?.message).toContain('descartad');
    expect(n?.message).toContain('memória');
  });

  it('bloqueio manual não mostra o aviso de inatividade', async () => {
    const seen: Array<{ title: string }> = [];
    app.notify.onNotify((n) => seen.push(n));
    await startUnlocked();
    app.actions.lockApp('manual');
    expect(app.store.state.mode).toBe('locked');
    expect(seen.filter((x) => x.title.startsWith('Sessão'))).toHaveLength(0);
  });
});
