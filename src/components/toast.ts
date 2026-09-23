import { onNotify, type Notification } from '../state/notify';
import { html, render } from './dom';
import { icon } from './icons';

const ICON: Record<Notification['kind'], string> = { success: 'check', error: 'alert', warn: 'alert', info: 'info' };

export function mountToasts(host: HTMLElement): () => void {
  return onNotify((n) => {
    const el = document.createElement('div');
    el.className = `toast toast--${n.kind}`;
    el.setAttribute('role', n.kind === 'error' ? 'alert' : 'status');
    render(
      el,
      html`${icon(ICON[n.kind])}
        <div class="toast__body">
          <div class="toast__title">${n.title}</div>
          ${n.message ? html`<div>${n.message}</div>` : ''}
        </div>
        <button type="button" aria-label="Fechar notificação">${icon('x')}</button>`,
    );
    const close = () => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 220);
    };
    el.querySelector('button')?.addEventListener('click', close);
    host.appendChild(el);
    while (host.children.length > 4) host.firstElementChild?.remove();
    setTimeout(close, n.kind === 'error' ? 9000 : 5000);
  });
}
