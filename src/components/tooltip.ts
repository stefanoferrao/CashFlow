/**
 * Dicas flutuantes (tooltips) para qualquer elemento com `data-tip` (e `data-tip-rail` no trilho do tablet).
 *
 * Antes eram pseudo-elementos CSS (::after) presos ao próprio elemento — e eram cortados por cards com
 * `overflow: hidden`, pelo topo da tela ou pela faixa do modo demonstração. Agora existe UMA dica,
 * posicionada com `position: fixed` no <body>: nunca é cortada, escolhe o lado com espaço (cima/baixo,
 * ou direita no trilho) e fica sempre dentro da janela.
 *
 * - Mouse: aparece ao passar o ponteiro. Teclado: ao focar. Toque: tocar no ícone "?" abre/fecha.
 * - Esc, rolagem ou clique fora fecham. O texto é inserido como texto (nunca como HTML).
 */

const MARGIN = 8;
const GAP = 8;
const RAIL_QUERY = '(min-width: 768px) and (max-width: 1099px)';

let tipEl: HTMLDivElement | null = null;
let current: HTMLElement | null = null;
/** Como a dica atual abriu: por clique/toque ela só fecha com outro clique, Esc ou rolagem. */
let openedBy: 'hover' | 'focus' | 'click' = 'hover';
let installed = false;

function ensureEl(): HTMLDivElement {
  if (tipEl && document.body.contains(tipEl)) return tipEl;
  tipEl = document.createElement('div');
  tipEl.id = 'cf-tooltip';
  tipEl.className = 'tooltip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function textFor(el: HTMLElement): string | null {
  const t = el.dataset.tip?.trim();
  if (t) return t;
  const rail = el.dataset.tipRail?.trim();
  if (rail && matchMedia(RAIL_QUERY).matches) return rail;
  return null;
}

/**
 * O elemento é o gatilho da dica aberta? Considera também a repintura da tela: se o elemento original
 * saiu do DOM e o novo tem a mesma dica, é o "mesmo" gatilho (senão o 2º toque reabriria em vez de fechar).
 */
function isCurrent(el: HTMLElement): boolean {
  if (!current) return false;
  if (current === el) return true;
  return !current.isConnected && current.dataset.tip === el.dataset.tip && current.dataset.tipRail === el.dataset.tipRail;
}

/** Passa a dica aberta para o elemento que substituiu o original numa repintura. */
function rebind(el: HTMLElement): void {
  if (!current || current === el) return;
  current = el;
  if (tipEl && !tipEl.hidden) position(el, tipEl);
}

function triggerOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-tip], [data-tip-rail]');
  return el && textFor(el) ? el : null;
}

/** Calcula a posição da dica (exportado para testes). Coordenadas da janela (position: fixed). */
export function placeTooltip(
  anchor: { top: number; left: number; width: number; height: number },
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  prefer: 'top' | 'bottom' | 'right' = 'top',
): { top: number; left: number; side: 'top' | 'bottom' | 'right'; arrow: number } {
  const cx = anchor.left + anchor.width / 2;
  if (prefer === 'right' && anchor.left + anchor.width + GAP + tip.width + MARGIN <= viewport.width) {
    const top = Math.min(Math.max(MARGIN, anchor.top + anchor.height / 2 - tip.height / 2), viewport.height - tip.height - MARGIN);
    return { top, left: anchor.left + anchor.width + GAP, side: 'right', arrow: anchor.top + anchor.height / 2 - top };
  }
  const spaceAbove = anchor.top - GAP - MARGIN;
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - GAP - MARGIN;
  const side: 'top' | 'bottom' =
    prefer === 'bottom'
      ? spaceBelow >= tip.height || spaceBelow >= spaceAbove
        ? 'bottom'
        : 'top'
      : spaceAbove >= tip.height || spaceAbove >= spaceBelow
        ? 'top'
        : 'bottom';
  let top = side === 'top' ? anchor.top - GAP - tip.height : anchor.top + anchor.height + GAP;
  top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, viewport.height - tip.height - MARGIN));
  let left = cx - tip.width / 2;
  left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, viewport.width - tip.width - MARGIN));
  const arrow = Math.min(Math.max(12, cx - left), Math.max(12, tip.width - 12));
  return { top, left, side, arrow };
}

function position(el: HTMLElement, tip: HTMLDivElement): void {
  const r = el.getBoundingClientRect();
  // Trilho: à direita. Barra superior (e quem pedir data-tip-side="bottom"): abaixo, para não cobrir
  // a faixa do modo demonstração nem sair da tela. Demais: acima (com troca automática se faltar espaço).
  const prefer =
    !el.dataset.tip && el.dataset.tipRail ? 'right' : el.dataset.tipSide === 'bottom' || el.closest('.topbar') ? 'bottom' : 'top';
  const p = placeTooltip(
    { top: r.top, left: r.left, width: r.width, height: r.height },
    { width: tip.offsetWidth, height: tip.offsetHeight },
    { width: document.documentElement.clientWidth, height: window.innerHeight },
    prefer,
  );
  tip.style.top = `${Math.round(p.top)}px`;
  tip.style.left = `${Math.round(p.left)}px`;
  tip.dataset.side = p.side;
  tip.style.setProperty('--arrow', `${Math.round(p.arrow)}px`);
}

export function showTooltip(el: HTMLElement, by: 'hover' | 'focus' | 'click' = 'hover'): void {
  const text = textFor(el);
  if (!text) return;
  openedBy = by;
  const tip = ensureEl();
  current = el;
  tip.textContent = text;
  tip.hidden = false;
  tip.dataset.open = 'false';
  // Mede já no lugar final (sem piscar) e só então mostra.
  tip.style.top = '0px';
  tip.style.left = '0px';
  position(el, tip);
  tip.dataset.open = 'true';
  if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-describedby')) {
    el.setAttribute('aria-describedby', tip.id);
    el.dataset.tipDescribed = 'true';
  }
}

export function hideTooltip(): void {
  if (current?.dataset.tipDescribed) {
    current.removeAttribute('aria-describedby');
    delete current.dataset.tipDescribed;
  }
  current = null;
  if (tipEl) {
    tipEl.hidden = true;
    tipEl.dataset.open = 'false';
  }
}

/** Instala os ouvintes globais uma única vez (chamado ao iniciar o app). */
export function installTooltips(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = triggerOf(e.target);
    if (!el) return;
    if (isCurrent(el)) rebind(el);
    else showTooltip(el, 'hover');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse' || !current || openedBy === 'click') return;
    const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (to && current.contains(to)) return;
    if (document.activeElement === current && current.matches(':focus-visible')) return;
    hideTooltip();
  });
  document.addEventListener('focusin', (e) => {
    const el = triggerOf(e.target);
    if (el && (el as Element).matches(':focus-visible')) showTooltip(el, 'focus');
  });
  document.addEventListener('focusout', () => {
    if (openedBy !== 'click') hideTooltip();
  });
  // Toque: o ícone "?" abre/fecha a dica (em telas de toque não existe "passar o mouse").
  document.addEventListener(
    'click',
    (e) => {
      const el = triggerOf(e.target);
      if (el?.classList.contains('info-tip')) {
        e.preventDefault();
        // Clique no "?": abre (ou fixa a que abriu ao passar o mouse); o segundo clique fecha.
        if (isCurrent(el) && openedBy === 'click') hideTooltip();
        else showTooltip(el, 'click');
        return;
      }
      // Qualquer outro clique (inclusive no próprio botão com dica, que costuma repintar) fecha a dica.
      if (current) hideTooltip();
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) hideTooltip();
  });
  window.addEventListener('scroll', () => current && hideTooltip(), { passive: true, capture: true });
  window.addEventListener('resize', () => current && hideTooltip());
  // Elemento removido do DOM (repintura) com a dica aberta.
  window.addEventListener('hashchange', () => hideTooltip());
}
