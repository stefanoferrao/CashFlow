/**
 * Roteador por hash (#/rota) — funciona em qualquer hospedagem estática e em file-less previews.
 * Páginas são carregadas sob demanda (code splitting).
 */
export interface PageContext {
  root: HTMLElement;
  params: URLSearchParams;
  navigate(path: string): void;
}

export interface PageModule {
  mount(ctx: PageContext): void | (() => void);
}

type Loader = () => Promise<PageModule>;

export const ROUTES: Record<string, Loader> = {
  dashboard: () => import('./pages/dashboard'),
  contas: () => import('./pages/accounts'),
  cartoes: () => import('./pages/cards'),
  faturas: () => import('./pages/bills'),
  transacoes: () => import('./pages/transactions'),
  investimentos: () => import('./pages/investments'),
  fluxo: () => import('./pages/cashflow'),
  analises: () => import('./pages/insights'),
  configuracoes: () => import('./pages/settings'),
  privacidade: () => import('./pages/privacy'),
  novidades: () => import('./pages/releases'),
};

export function parseHash(hash = location.hash): { path: string; params: URLSearchParams } {
  const clean = hash.replace(/^#\/?/, '');
  const [p = '', q = ''] = clean.split('?');
  const path = p && ROUTES[p] ? p : 'dashboard';
  return { path, params: new URLSearchParams(q) };
}

export function navigate(path: string): void {
  const target = `#/${path}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}
