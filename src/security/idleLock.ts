/**
 * Bloqueio automático por inatividade — lógica pura, sem depender de window/document reais (tudo é injetável).
 *
 * Regras:
 *  - Qualquer interação com a página (mouse, scroll, toque, teclado, foco, digitação) renova o prazo.
 *  - Voltar para a aba/janela NÃO é interação: só confere se o prazo já venceu e, se venceu, bloqueia na hora
 *    (sem esperar o timer, que o navegador atrasa em aba oculta).
 *  - Atividade nunca "ressuscita" uma sessão já vencida: o primeiro movimento depois do prazo bloqueia em vez de renovar.
 *  - O tempo com a aba oculta conta como inatividade (decisão conservadora).
 */

export const IDLE_CHECK_INTERVAL_MS = 15_000;

/** Eventos de interação observados na janela (fase de captura: `scroll` não sobe pela árvore). */
export const ACTIVITY_EVENTS: readonly string[] = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart', 'touchmove', 'input', 'focusin'];

type Listener = (e?: unknown) => void;

interface EventTargetLike {
  addEventListener(type: string, fn: Listener, options?: unknown): void;
  removeEventListener(type: string, fn: Listener, options?: unknown): void;
}

export interface IdleLockOptions {
  /** Lido a cada verificação: mudar a preferência vale na hora. 0 = nunca bloquear. */
  getMinutes: () => number;
  /** false = nunca bloqueia (ex.: tela de bloqueio, onboarding, demonstração). */
  isEnabled: () => boolean;
  onLock: () => void;
  now?: () => number;
  win?: EventTargetLike;
  doc?: EventTargetLike & { visibilityState: string };
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (id: unknown) => void;
}

export interface IdleLock {
  start(): void;
  stop(): void;
  /** Registra uma interação. Devolve false se o prazo já tinha vencido (e então bloqueia em vez de renovar). */
  touch(): boolean;
  /** Bloqueia se o prazo venceu. Devolve true se bloqueou. Não renova o prazo. */
  check(): boolean;
  lastActivity(): number;
}

export function isIdleExpired(lastActivityMs: number, nowMs: number, minutes: number): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  return nowMs - lastActivityMs > minutes * 60_000;
}

export function createIdleLock(opts: IdleLockOptions): IdleLock {
  const now = opts.now ?? Date.now;
  let last = now();
  let timer: unknown = null;
  let cleanup: (() => void) | null = null;

  const check = (): boolean => {
    if (!opts.isEnabled() || !isIdleExpired(last, now(), opts.getMinutes())) return false;
    opts.onLock();
    // Janela nova: sem isto o timer repetiria o bloqueio enquanto o estado ainda não mudou.
    last = now();
    return true;
  };

  const touch = (): boolean => {
    if (check()) return false;
    last = now();
    return true;
  };

  const stop = (): void => {
    cleanup?.();
    cleanup = null;
    if (timer !== null) (opts.clearIntervalFn ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>)))(timer);
    timer = null;
  };

  const start = (): void => {
    stop();
    last = now();
    const win = opts.win ?? window;
    const doc = opts.doc ?? document;
    const onActivity: Listener = () => void touch();
    const onResume: Listener = () => void check();
    const onVisibility: Listener = () => {
      if (doc.visibilityState === 'visible') check();
    };
    const listenerOptions = { passive: true, capture: true };
    for (const ev of ACTIVITY_EVENTS) win.addEventListener(ev, onActivity, listenerOptions);
    win.addEventListener('focus', onResume);
    win.addEventListener('pageshow', onResume);
    doc.addEventListener('visibilitychange', onVisibility);
    timer = (opts.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms)))(() => void check(), IDLE_CHECK_INTERVAL_MS);
    cleanup = () => {
      for (const ev of ACTIVITY_EVENTS) win.removeEventListener(ev, onActivity, listenerOptions);
      win.removeEventListener('focus', onResume);
      win.removeEventListener('pageshow', onResume);
      doc.removeEventListener('visibilitychange', onVisibility);
    };
  };

  return { start, stop, touch, check, lastActivity: () => last };
}

/** Aviso exibido depois do bloqueio por inatividade. No modo sessão nada foi gravado: as credenciais somem de verdade. */
export function inactivityNotice(wasSession: boolean): { title: string; message: string } {
  return wasSession
    ? {
        title: 'Sessão encerrada',
        message: 'Encerramos a sessão por inatividade. As credenciais foram descartadas porque existiam só na memória desta aba; informe-as de novo para continuar.',
      }
    : { title: 'Sessão bloqueada', message: 'Bloqueamos o app por inatividade. Seus dados continuam cifrados neste navegador.' };
}
