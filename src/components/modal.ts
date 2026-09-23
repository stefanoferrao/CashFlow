/**
 * Modal acessível (focus trap, Esc, retorno de foco). No mobile vira bottom sheet (CSS).
 */
import { html, render, type SafeHtml } from './dom';
import { icon } from './icons';

export interface ModalHandle {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal(opts: {
  title: string;
  body: SafeHtml;
  footer?: SafeHtml;
  wide?: boolean;
  onClose?: () => void;
  /** Elemento que recebe foco ao abrir (seletor). */
  initialFocus?: string;
}): ModalHandle {
  const root = document.getElementById('modal-root') ?? document.body;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  render(
    backdrop,
    html`<div class="modal ${opts.wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="modal__head">
        <h2 class="modal__title" id="${titleId}">${opts.title}</h2>
        <button type="button" class="icon-btn" data-modal-close aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="modal__body">${opts.body}</div>
      ${opts.footer ? html`<div class="modal__foot">${opts.footer}</div>` : ''}
    </div>`,
  );
  root.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const modal = backdrop.querySelector<HTMLElement>('.modal')!;
  const body = backdrop.querySelector<HTMLElement>('.modal__body')!;

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (!root.querySelector('.modal-backdrop')) document.body.style.overflow = '';
    opts.onClose?.();
    previouslyFocused?.focus?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(backdrop)) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', close));

  requestAnimationFrame(() => {
    const target = (opts.initialFocus && modal.querySelector<HTMLElement>(opts.initialFocus)) || modal.querySelector<HTMLElement>(`${FOCUSABLE}:not([data-modal-close])`) || modal;
    target.focus();
  });

  return { el: modal, body, close };
}

/** Confirmação (ações destrutivas). Resolve true se confirmado. */
export function confirmDialog(opts: { title: string; message: string; confirmLabel: string; danger?: boolean; requireText?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const m = openModal({
      title: opts.title,
      body: html`<p class="muted">${opts.message}</p>
        ${opts.requireText
          ? html`<label class="field"><span class="field__label">Digite <strong>${opts.requireText}</strong> para confirmar</span><input class="input" data-confirm-input autocomplete="off" /></label>`
          : ''}`,
      footer: html`<button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
        <button type="button" class="btn ${opts.danger ? 'btn--danger-solid' : 'btn--primary'}" data-confirm ${opts.requireText ? 'disabled' : ''}>${opts.confirmLabel}</button>`,
      onClose: () => finish(false),
      initialFocus: opts.requireText ? '[data-confirm-input]' : '[data-modal-close]',
    });
    const btn = m.el.querySelector<HTMLButtonElement>('[data-confirm]')!;
    const input = m.el.querySelector<HTMLInputElement>('[data-confirm-input]');
    input?.addEventListener('input', () => {
      btn.disabled = input.value.trim() !== opts.requireText;
    });
    btn.addEventListener('click', () => {
      finish(true);
      m.close();
    });
  });
}
