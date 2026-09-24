/**
 * Orquestração da interface: escolhe a tela conforme o modo (onboarding, bloqueio, app)
 * e monta as páginas no shell. Nenhuma regra de negócio aqui.
 */
import { destroyCharts, rethemeCharts, resizeCharts } from './charts/charts';
import { html, render } from './components/dom';
import { mountShell, type ShellHandle } from './components/shell';
import { mountToasts } from './components/toast';
import { navigate, parseHash, ROUTES, type PageModule } from './router';
import * as actions from './state/actions';
import { notify } from './state/notify';
import { store, type AppMode } from './state/store';
import { debounce } from './utils/async';

let shell: ShellHandle | null = null;
let cleanupPage: (() => void) | null = null;
let cleanupScreen: (() => void) | null = null;
let currentMode: AppMode | null = null;
let routeToken = 0;

async function mountRoute(): Promise<void> {
  if (!shell) return;
  const { path, params } = parseHash();
  const token = ++routeToken;
  shell.setActive(path);
  cleanupPage?.();
  cleanupPage = null;
  destroyCharts();
  const main = shell.main;
  render(main, html`<div class="page"><div class="card">${html`<div class="stack-sm"><span class="skeleton" style="height:18px;width:30%"></span><span class="skeleton" style="height:120px"></span></div>`}</div></div>`);
  let mod: PageModule;
  try {
    mod = await ROUTES[path]!();
  } catch {
    if (token !== routeToken) return;
    render(main, html`<div class="card"><p>Não foi possível carregar esta página. Verifique sua conexão e recarregue.</p></div>`);
    return;
  }
  if (token !== routeToken || !shell) return;
  main.style.animation = 'none';
  void main.offsetHeight;
  main.style.animation = '';
  const cleanup = mod.mount({ root: main, params, navigate });
  cleanupPage = typeof cleanup === 'function' ? cleanup : null;
  window.scrollTo({ top: 0 });
  // Acessibilidade: foco no título da página após navegação.
  if (document.activeElement && document.activeElement !== document.body) {
    document.getElementById('page-title')?.focus({ preventScroll: true });
  }
}

async function renderScreen(mode: AppMode): Promise<void> {
  const app = document.getElementById('app')!;
  cleanupPage?.();
  cleanupPage = null;
  cleanupScreen?.();
  cleanupScreen = null;
  shell?.destroy();
  shell = null;
  destroyCharts();

  if (mode === 'booting') return;
  if (mode === 'onboarding') {
    const m = await import('./pages/onboarding');
    cleanupScreen = m.mountOnboarding(app) ?? null;
    return;
  }
  if (mode === 'locked') {
    const m = await import('./pages/lock');
    cleanupScreen = m.mountLock(app) ?? null;
    return;
  }
  shell = mountShell(app, parseHash().path);
  await mountRoute();
}

export async function startApp(): Promise<void> {
  mountToasts(document.getElementById('toasts')!);

  store.subscribe((s, prev) => {
    if (s.mode !== currentMode) {
      currentMode = s.mode;
      void renderScreen(s.mode);
    }
    if (s.theme.resolved !== prev.theme.resolved) requestAnimationFrame(() => rethemeCharts());
    if (s.preferences.hideValues !== prev.preferences.hideValues) {
      document.documentElement.setAttribute('data-hide-values', String(s.preferences.hideValues));
    }
  });

  window.addEventListener('hashchange', () => {
    if (shell) void mountRoute();
  });
  window.addEventListener('resize', debounce(() => resizeCharts(), 150));
  // Logo de instituição que não carregou (offline, bloqueado): mostra as iniciais. Sem handler inline (CSP).
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (img instanceof HTMLImageElement) img.closest('.inst-logo')?.classList.add('is-broken');
    },
    true,
  );
  window.addEventListener('unhandledrejection', (e) => {
    // Nunca mostrar stack trace: mensagem genérica e amigável.
    e.preventDefault();
    notify('error', 'Algo deu errado', 'A operação não pôde ser concluída. Tente novamente.');
  });

  await actions.boot();
  document.documentElement.setAttribute('data-hide-values', String(store.state.preferences.hideValues));
  actions.startAutoLock();
  if (!location.hash) navigate('dashboard');
}
