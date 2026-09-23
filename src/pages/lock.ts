/**
 * Tela de desbloqueio: a senha local deriva a chave que abre o cofre (credenciais + cache cifrado).
 */
import { delegate, html, render } from '../components/dom';
import { icon } from '../components/icons';
import { confirmDialog } from '../components/modal';
import { VaultError } from '../security/vault';
import * as actions from '../state/actions';
import { screenAside, themeFloat } from './onboarding';

export function mountLock(host: HTMLElement): () => void {
  let error: string | null = null;
  let busy = false;
  let attempts = 0;

  const paint = () => {
    render(
      host,
      html`${themeFloat()}<div class="screen">${screenAside()}
        <main class="screen__main" id="main">
          <form class="screen__panel" data-form="unlock" novalidate>
            <span class="step-label">Cofre local</span>
            <h1 tabindex="-1">Desbloquear o CashFlow</h1>
            <p class="muted">Seus dados e credenciais estão cifrados neste navegador. Digite sua senha local para abri-los.</p>
            <label class="field">
              <span class="field__label">Senha local</span>
              <span class="input-group input-group--action">
                ${icon('lock')}
                <input class="input" type="password" name="passphrase" autocomplete="current-password" required ${error ? html`aria-invalid="true" aria-describedby="unlock-error"` : ''} />
                <button type="button" class="icon-btn icon-btn--sm input-group__action" data-action="reveal" aria-label="Mostrar/ocultar senha">${icon('eye')}</button>
              </span>
            </label>
            ${error ? html`<div class="callout callout--danger" role="alert" id="unlock-error">${icon('alert')}<div>${error}</div></div>` : ''}
            <button type="submit" class="btn btn--primary btn--lg btn--block" ${busy ? 'disabled' : ''}>${icon(busy ? 'refresh' : 'unlock', busy ? 'spin' : '')}${busy ? 'Derivando chave…' : 'Desbloquear'}</button>
            <div class="row-between wrap">
              <button type="button" class="btn btn--ghost btn--sm" data-action="forgot">${icon('help')}Esqueci a senha local</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="demo">${icon('sparkle')}Ver demonstração</button>
            </div>
          </form>
        </main>
      </div>`,
    );
    const input = host.querySelector<HTMLInputElement>('input[name="passphrase"]');
    input?.focus();
  };

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const input = host.querySelector<HTMLInputElement>('input[name="passphrase"]');
    const pass = input?.value ?? '';
    if (!pass) {
      error = 'Digite sua senha local.';
      paint();
      return;
    }
    busy = true;
    error = null;
    paint();
    try {
      await actions.unlockVault(pass);
    } catch (err) {
      attempts++;
      busy = false;
      error = err instanceof VaultError ? err.message : 'Não foi possível desbloquear. Tente novamente.';
      if (attempts >= 3) error += ' Se esqueceu a senha, não há como recuperá-la — apague os dados locais e configure novamente.';
      paint();
    }
  };

  const off = delegate(host, 'click', {
    reveal: () => {
      const input = host.querySelector<HTMLInputElement>('input[name="passphrase"]');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    },
    demo: () => actions.startDemo(),
    'cycle-theme': (el) => {
      actions.setTheme(el.dataset.value as 'light' | 'dark' | 'system');
      paint();
    },
    forgot: async () => {
      const ok = await confirmDialog({
        title: 'Apagar todos os dados locais?',
        message:
          'A senha local não pode ser recuperada — ela é a única forma de abrir o cofre. Apagar os dados remove credenciais, cache financeiro, categorização e layout deste navegador. Seus dados na Pluggy não são afetados.',
        confirmLabel: 'Apagar tudo',
        danger: true,
        requireText: 'APAGAR',
      });
      if (ok) await actions.wipeAllLocalData();
    },
  });
  host.addEventListener('submit', onSubmit);
  paint();
  return () => {
    off();
    host.removeEventListener('submit', onSubmit);
  };
}
