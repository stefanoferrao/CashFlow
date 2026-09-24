/**
 * Estrutura da aplicação: sidebar (desktop), trilho de ícones (tablet), menu inferior fixo (mobile),
 * cabeçalho com status de sincronização, atualizar, tema e menu do usuário.
 */
import { APP_CONFIG } from '../config/app.config';
import * as actions from '../state/actions';
import { store, type AppState } from '../state/store';
import type { ThemePref } from '../storage/preferences';
import { formatRelative } from '../utils/format';
import { $, delegate, html, render, type SafeHtml } from './dom';
import { icon, logoMark } from './icons';
import { openModal } from './modal';
import { installState, onInstallStateChange, promptInstall } from '../pwa';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  section: string;
  /** Rótulo curto para o menu inferior. */
  short?: string;
}

export const NAV: NavItem[] = [
  { path: 'dashboard', label: 'Dashboard', short: 'Início', icon: 'dashboard', section: 'Visão geral' },
  { path: 'contas', label: 'Contas', icon: 'wallet', section: 'Dinheiro' },
  { path: 'cartoes', label: 'Cartões', icon: 'card', section: 'Dinheiro' },
  { path: 'faturas', label: 'Faturas', icon: 'receipt', section: 'Dinheiro' },
  { path: 'transacoes', label: 'Transações', short: 'Extrato', icon: 'list', section: 'Dinheiro' },
  { path: 'investimentos', label: 'Investimentos', icon: 'trending', section: 'Dinheiro' },
  { path: 'fluxo', label: 'Fluxo de Caixa', icon: 'flow', section: 'Planejamento' },
  { path: 'analises', label: 'Análises', icon: 'bulb', section: 'Planejamento' },
  { path: 'configuracoes', label: 'Configurações', icon: 'settings', section: 'Sistema' },
];

export const BOTTOM_NAV = ['dashboard', 'contas', 'cartoes', 'transacoes'];

export const PAGE_TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV.map((n) => [n.path, n.label])),
  privacidade: 'Privacidade e segurança',
  novidades: 'Notas de Atualização',
};

function sidebar(active: string, st: AppState): SafeHtml {
  const sections: Record<string, NavItem[]> = {};
  for (const n of NAV) (sections[n.section] ??= []).push(n);
  const demo = st.mode === 'demo';
  return html`<aside class="sidebar" aria-label="Navegação principal">
    <a class="brand" href="#/dashboard" aria-label="${APP_CONFIG.name} — início">
      <span class="brand__mark">${logoMark()}</span><span class="brand__name">${APP_CONFIG.name}</span>
    </a>
    <nav>
      ${Object.entries(sections).map(
        ([section, items]) => html`<div class="nav__section">${section}</div>
          <ul class="nav">
            ${items.map(
              (n) => html`<li>
                <a class="nav__link ${n.path === active ? 'is-active' : ''}" href="#/${n.path}" data-nav="${n.path}" ${n.path === active ? html`aria-current="page"` : ''} data-tip-rail="${n.label}">
                  ${icon(n.icon)}<span class="nav__label">${n.label}</span>
                </a>
              </li>`,
            )}
          </ul>`,
      )}
    </nav>
    <div class="sidebar__footer">
      <a class="nav__link ${active === 'novidades' ? 'is-active' : ''}" href="#/novidades" data-nav="novidades" data-tip-rail="Notas de Atualização · v${APP_CONFIG.version}">${icon('gift')}<span class="nav__label">Novidades <span class="nav__version">v${APP_CONFIG.version}</span></span></a>
      <a class="nav__link ${active === 'privacidade' ? 'is-active' : ''}" href="#/privacidade" data-nav="privacidade" data-tip-rail="Privacidade">${icon('shield')}<span class="nav__label">Privacidade</span></a>
      <div class="conn-pill" title="${demo ? 'Modo demonstração' : st.connection.vaultMode === 'session' ? 'Sessão sem persistência' : 'Credenciais cifradas neste navegador'}">
        <span class="inst-logo" style="width:28px;height:28px">${icon(demo ? 'sparkle' : st.connection.status === 'error' ? 'alert' : 'lock')}</span>
        <span class="conn-pill__text">
          <strong>${demo ? 'Demonstração' : st.connection.hasCredentials ? 'Pluggy conectada' : 'Pluggy não configurada'}</strong>
          <span class="muted">${demo ? 'Dados fictícios' : st.connection.vaultMode === 'session' ? 'Somente nesta sessão' : 'Cofre local ativo'}</span>
        </span>
      </div>
    </div>
  </aside>`;
}

function bottomNav(active: string): SafeHtml {
  const items = BOTTOM_NAV.map((p) => NAV.find((n) => n.path === p)!);
  const moreActive = !BOTTOM_NAV.includes(active);
  return html`<nav class="bottom-nav" aria-label="Navegação">
    ${items.map(
      (n) => html`<a class="bottom-nav__item ${n.path === active ? 'is-active' : ''}" href="#/${n.path}" data-nav="${n.path}" ${n.path === active ? html`aria-current="page"` : ''}>
        ${icon(n.icon)}<span>${n.short ?? n.label}</span>
      </a>`,
    )}
    <button type="button" class="bottom-nav__item ${moreActive ? 'is-active' : ''}" data-action="open-more" aria-haspopup="dialog">${icon('grid')}<span>Mais</span></button>
  </nav>`;
}

export function syncStatus(st: AppState): { state: string; text: string } {
  if (st.mode === 'demo') return { state: 'demo', text: 'Dados de demonstração' };
  if (!st.online) return { state: 'offline', text: `Offline · dados locais de ${formatRelative(st.sync.lastSyncAt)}` };
  if (st.sync.status === 'syncing') return { state: 'syncing', text: st.sync.progress ? `Sincronizando · ${st.sync.progress}` : 'Sincronizando…' };
  if (st.sync.status === 'error') return { state: 'error', text: `Erro na sincronização · ${st.sync.errorTitle ?? ''}` };
  if (!st.itemIds.length) return { state: 'stale', text: 'Nenhuma instituição conectada' };
  if (!st.sync.lastSyncAt) return { state: 'stale', text: 'Ainda não sincronizado' };
  const stale = Date.now() - new Date(st.sync.lastSyncAt).getTime() > st.preferences.cacheTtlHours * 3600_000;
  return { state: stale ? 'stale' : 'ok', text: `${stale ? 'Desatualizado · ' : ''}Atualizado ${formatRelative(st.sync.lastSyncAt)}` };
}

const THEME_ICON: Record<ThemePref, string> = { light: 'sun', dark: 'moon', system: 'monitor' };

function topbar(title: string, st: AppState): SafeHtml {
  const s = syncStatus(st);
  const syncing = st.sync.status === 'syncing';
  return html`<header class="topbar">
    <div class="row" style="min-width:0">
      <a class="brand__mark topbar__brand" href="#/dashboard" aria-label="Início">${logoMark()}</a>
      <div class="topbar__title">
        <h1 id="page-title" tabindex="-1">${title}</h1>
        <span class="sync-status" data-state="${s.state}" data-sync-status aria-live="polite"><span class="dot" aria-hidden="true"></span><span class="truncate">${s.text}</span></span>
      </div>
    </div>
    <div class="topbar__actions">
      <button type="button" class="btn btn--secondary btn--sm hide-mobile ${syncing ? 'is-loading' : ''}" data-action="sync" ${syncing ? 'disabled' : ''}>
        ${icon('refresh', syncing ? 'spin' : '')}<span>Atualizar agora</span>
      </button>
      <button type="button" class="icon-btn ${syncing ? 'is-spinning' : ''} show-mobile-only" data-action="sync" aria-label="Atualizar agora" ${syncing ? 'disabled' : ''}>${icon('refresh')}</button>
      <button type="button" class="icon-btn" data-action="toggle-values" aria-pressed="${st.preferences.hideValues ? 'true' : 'false'}" aria-label="${st.preferences.hideValues ? 'Mostrar valores' : 'Ocultar valores'}" data-tip="${st.preferences.hideValues ? 'Mostrar valores' : 'Ocultar valores'}">
        ${icon(st.preferences.hideValues ? 'eyeOff' : 'eye')}
      </button>
      <div class="menu-wrap">
        <button type="button" class="icon-btn" data-action="menu" data-menu="theme" aria-haspopup="menu" aria-expanded="false" aria-label="Tema: ${st.theme.pref === 'system' ? 'Sistema' : st.theme.pref === 'dark' ? 'Escuro' : 'Claro'}" data-tip="Tema: ${st.theme.pref === 'system' ? 'Sistema' : st.theme.pref === 'dark' ? 'Escuro' : 'Claro'}">${icon(THEME_ICON[st.theme.pref])}</button>
        <div class="menu" role="menu" data-menu-panel="theme">
          <div class="menu__label">Tema</div>
          ${(['light', 'dark', 'system'] as ThemePref[]).map(
            (p) => html`<button type="button" class="menu__item" role="menuitemradio" aria-checked="${st.theme.pref === p ? 'true' : 'false'}" data-action="theme" data-value="${p}">
              ${icon(THEME_ICON[p])}${p === 'light' ? 'Claro' : p === 'dark' ? 'Escuro' : 'Sistema'}
            </button>`,
          )}
        </div>
      </div>
      <div class="menu-wrap">
        <button type="button" class="icon-btn icon-btn--outline" data-action="menu" data-menu="user" aria-haspopup="menu" aria-expanded="false" aria-label="Menu do usuário" data-tip="Menu e configurações">${icon('user')}</button>
        <div class="menu" role="menu" data-menu-panel="user">
          <div class="menu__label">${st.mode === 'demo' ? 'Modo demonstração' : 'Sua sessão'}</div>
          <a class="menu__item" role="menuitem" href="#/configuracoes">${icon('settings')}Configurações</a>
          <a class="menu__item" role="menuitem" href="#/privacidade">${icon('shield')}Privacidade e segurança</a>
          <a class="menu__item" role="menuitem" href="#/novidades">${icon('gift')}Notas de Atualização <span class="menu__meta">v${APP_CONFIG.version}</span></a>
          ${installState() === 'available' ? html`<button type="button" class="menu__item" role="menuitem" data-action="install-app">${icon('phone')}Instalar aplicativo</button>` : ''}
          <div class="menu__sep"></div>
          ${st.mode === 'demo'
            ? html`<button type="button" class="menu__item" role="menuitem" data-action="exit-demo">${icon('logout')}Sair da demonstração</button>`
            : html`<button type="button" class="menu__item" role="menuitem" data-action="lock">${icon('lock')}${st.connection.vaultMode === 'session' ? 'Encerrar sessão' : 'Bloquear agora'}</button>`}
        </div>
      </div>
    </div>
  </header>`;
}

export interface ShellHandle {
  main: HTMLElement;
  setActive(path: string): void;
  destroy(): void;
}

export function mountShell(host: HTMLElement, initialPath: string): ShellHandle {
  let active = initialPath;

  const paint = () => {
    const st = store.state;
    const title = PAGE_TITLES[active] ?? 'CashFlow';
    render(
      host,
      html`<div class="app" data-mode="${st.mode}">
        ${sidebar(active, st)}
        <div class="main-col">
          ${st.mode === 'demo'
            ? html`<div class="demo-banner" role="note"><strong>MODO DEMONSTRAÇÃO</strong><span>Dados fictícios — nada aqui é real nem é salvo.</span><button type="button" data-action="exit-demo">Sair da demonstração</button></div>`
            : ''}
          ${!st.online && st.mode === 'real' ? html`<div class="offline-banner" role="status">Você está offline. Exibindo os dados salvos neste navegador.</div>` : ''}
          <div data-topbar>${topbar(title, st)}</div>
          <main id="main" class="content" tabindex="-1"></main>
        </div>
        ${bottomNav(active)}
      </div>`,
    );
  };

  paint();
  let main = $('#main', host)!;

  const repaintChrome = () => {
    // Atualiza sidebar/topbar/menu inferior preservando o <main> (página montada).
    const st = store.state;
    const title = PAGE_TITLES[active] ?? 'CashFlow';
    const tb = $('[data-topbar]', host);
    if (tb) render(tb, topbar(title, st));
    const sb = $('.sidebar', host);
    if (sb) sb.outerHTML = sidebar(active, st).value;
    const bn = $('.bottom-nav', host);
    if (bn) bn.outerHTML = bottomNav(active).value;
  };

  const closeMenus = () => {
    host.querySelectorAll<HTMLElement>('[data-menu-panel]').forEach((m) => m.removeAttribute('data-open'));
    host.querySelectorAll<HTMLElement>('[data-action="menu"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  };

  const offClick = delegate(host, 'click', {
    sync: () => void actions.syncAll(),
    'toggle-values': () => void actions.updatePreferences({ hideValues: !store.state.preferences.hideValues }),
    theme: (el) => {
      actions.setTheme(el.dataset.value as ThemePref);
      closeMenus();
    },
    menu: (el, ev) => {
      ev.stopPropagation();
      const panel = host.querySelector<HTMLElement>(`[data-menu-panel="${el.dataset.menu}"]`);
      const open = panel?.getAttribute('data-open') === 'true';
      closeMenus();
      if (panel && !open) {
        panel.setAttribute('data-open', 'true');
        el.setAttribute('aria-expanded', 'true');
        panel.querySelector<HTMLElement>('.menu__item')?.focus();
      }
    },
    lock: () => actions.lockApp('manual'),
    'install-app': () => {
      closeMenus();
      void promptInstall();
    },
    'exit-demo': () => void actions.exitDemo(),
    'open-more': () => openMoreSheet(active),
  });
  const onDocClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.menu-wrap')) closeMenus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeMenus();
  };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  const onScroll = () => $('.topbar', host)?.classList.toggle('is-scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });

  const unsub = store.subscribe((s, prev) => {
    if (
      s.sync !== prev.sync ||
      s.theme !== prev.theme ||
      s.preferences !== prev.preferences ||
      s.connection !== prev.connection ||
      s.online !== prev.online ||
      s.itemIds !== prev.itemIds
    ) {
      if (s.online !== prev.online) {
        const pageEl = main;
        paint();
        const newMain = $('#main', host)!;
        newMain.replaceWith(pageEl);
        main = pageEl;
      } else {
        repaintChrome();
      }
    }
  });

  const offInstall = onInstallStateChange(repaintChrome);

  // Atualiza "Atualizado há X minutos"
  const tick = setInterval(() => {
    const el = $('[data-sync-status]', host);
    if (!el) return;
    const s = syncStatus(store.state);
    el.dataset.state = s.state;
    const span = el.querySelector('.truncate');
    if (span) span.textContent = s.text;
  }, 30_000);

  return {
    get main() {
      return main;
    },
    setActive(path: string) {
      active = path;
      repaintChrome();
      document.title = `${PAGE_TITLES[path] ?? 'CashFlow'} · ${APP_CONFIG.name}`;
    },
    destroy() {
      offClick();
      unsub();
      offInstall();
      clearInterval(tick);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    },
  };
}

function openMoreSheet(active: string): void {
  const extra = NAV.filter((n) => !BOTTOM_NAV.includes(n.path));
  const st = store.state;
  const m = openModal({
    title: 'Mais',
    body: html`<nav aria-label="Mais seções">
      <ul class="nav">
        ${extra.map(
          (n) => html`<li><a class="nav__link ${n.path === active ? 'is-active' : ''}" href="#/${n.path}" data-close>${icon(n.icon)}<span>${n.label}</span></a></li>`,
        )}
        <li><a class="nav__link ${active === 'privacidade' ? 'is-active' : ''}" href="#/privacidade" data-close>${icon('shield')}<span>Privacidade e segurança</span></a></li>
        <li><a class="nav__link ${active === 'novidades' ? 'is-active' : ''}" href="#/novidades" data-close>${icon('gift')}<span>Notas de Atualização · v${APP_CONFIG.version}</span></a></li>
      </ul>
    </nav>
    <div class="divider"></div>
    ${installState() === 'available'
      ? html`<button type="button" class="btn btn--primary btn--block" data-install style="margin-bottom:8px">${icon('phone')}Instalar aplicativo</button>`
      : installState() === 'ios'
        ? html`<a class="btn btn--secondary btn--block" href="#/configuracoes?secao=aplicativo" data-close style="margin-bottom:8px">${icon('phone')}Instalar no iPhone</a>`
        : ''}
    ${st.mode === 'demo'
      ? html`<button type="button" class="btn btn--secondary btn--block" data-exit-demo>${icon('logout')}Sair da demonstração</button>`
      : html`<button type="button" class="btn btn--secondary btn--block" data-lock>${icon('lock')}${st.connection.vaultMode === 'session' ? 'Encerrar sessão' : 'Bloquear agora'}</button>`}`,
  });
  m.el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => m.close()));
  m.el.querySelector('[data-exit-demo]')?.addEventListener('click', () => {
    m.close();
    void actions.exitDemo();
  });
  m.el.querySelector('[data-install]')?.addEventListener('click', () => {
    m.close();
    void promptInstall();
  });
  m.el.querySelector('[data-lock]')?.addEventListener('click', () => {
    m.close();
    actions.lockApp('manual');
  });
}
