/**
 * Tela de carregamento da sincronização ("Atualizar agora", no computador e no celular, e a atualização que roda ao
 * entrar no app): cobre a tela inteira, no mesmo visual "flat" da abertura do app (components/splash.ts), e mostra a etapa atual.
 *
 * Só aparece nas atualizações de todas as instituições (`sync.blocking`). Não pisca em atualizações instantâneas
 * (espera um instante antes de aparecer), não some rápido demais e tem uma saída — "Continuar em segundo plano" ou
 * Esc — para quando a Pluggy demora (a atualização continua e o status segue no topo da tela).
 */
import { store, type AppState } from '../state/store';
import { logoMark } from './icons';

/** Só mostra se a atualização passar disso: evita um clarão quando ela termina quase na hora. */
const SHOW_DELAY_MS = 150;
/** Depois de aparecer, fica ao menos isso: evita "pisca-pisca" quando ela termina logo em seguida. */
const MIN_VISIBLE_MS = 600;
/** Igual a --t-slow (tokens.css): duração do fade de saída. */
const FADE_MS = 320;
/** Áreas que ficam inertes (sem foco nem clique) enquanto a tela de carregamento está aberta. */
const BLOCKED_IDS = ['app', 'modal-root'];

const wanted = (s: AppState): boolean => (s.mode === 'real' || s.mode === 'demo') && s.sync.status === 'syncing' && s.sync.blocking;

function build(demo: boolean): HTMLElement {
  const root = document.createElement('div');
  root.className = 'splash splash--sync';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-busy', 'true');
  root.setAttribute('aria-label', 'Atualizando seus dados');
  root.innerHTML = `
    <div class="splash__center">
      <div class="splash__mark" aria-hidden="true">${logoMark().value}</div>
      <div class="splash__name">Atualizando seus dados</div>
      <div class="splash__bar" aria-hidden="true"></div>
      <p class="splash__hint" aria-live="off" data-sync-hint></p>
      <button type="button" class="btn btn--ghost btn--sm" data-sync-dismiss>Continuar em segundo plano</button>
    </div>
    <p class="splash__foot">${demo ? 'Atualizando os dados de demonstração.' : 'Buscando as novidades na Pluggy. Isso pode levar alguns instantes.'}</p>`;
  return root;
}

/** Liga a tela de carregamento ao estado do app. Devolve a função que desliga. */
export function mountSyncOverlay(): () => void {
  let el: HTMLElement | null = null;
  let showTimer: number | undefined;
  let hideTimer: number | undefined;
  let shownAt = 0;
  /** A pessoa escolheu "Continuar em segundo plano" nesta atualização. */
  let dismissed = false;
  let restoreFocus: HTMLElement | null = null;

  const setBlocked = (on: boolean) => {
    for (const id of BLOCKED_IDS) {
      const node = document.getElementById(id);
      if (node) node.inert = on;
    }
  };

  const updateHint = (s: AppState) => {
    const hint = el?.querySelector('[data-sync-hint]');
    if (hint) hint.textContent = s.sync.progress ?? 'Preparando…';
  };

  const leave = () => {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    const node = el;
    if (!node) return;
    el = null;
    setBlocked(false);
    node.classList.add('is-leaving');
    window.setTimeout(() => node.remove(), FADE_MS + 100);
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    restoreFocus = null;
  };

  const dismiss = () => {
    dismissed = true;
    leave();
  };

  const show = (s: AppState) => {
    restoreFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    el = build(s.mode === 'demo');
    document.body.appendChild(el);
    setBlocked(true);
    shownAt = performance.now();
    updateHint(s);
    el.querySelector<HTMLButtonElement>('[data-sync-dismiss]')!.addEventListener('click', dismiss);
    el.querySelector<HTMLButtonElement>('[data-sync-dismiss]')!.focus({ preventScroll: true });
  };

  const update = (s: AppState) => {
    if (!wanted(s)) {
      // Terminou (ou falhou): a próxima atualização volta a poder mostrar a tela.
      dismissed = false;
      window.clearTimeout(showTimer);
      showTimer = undefined;
      if (el && hideTimer === undefined) hideTimer = window.setTimeout(leave, Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt)));
      return;
    }
    // Outra atualização começou enquanto a tela ia sair: ela continua.
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    if (el) return updateHint(s);
    if (dismissed || showTimer !== undefined) return;
    showTimer = window.setTimeout(() => {
      showTimer = undefined;
      if (!el && !dismissed && wanted(store.state)) show(store.state);
    }, SHOW_DELAY_MS);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && el) dismiss();
  };
  document.addEventListener('keydown', onKey);
  const unsubscribe = store.subscribe((s) => update(s));
  update(store.state);

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    window.clearTimeout(showTimer);
    leave();
  };
}
