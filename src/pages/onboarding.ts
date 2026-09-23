/**
 * Primeiro acesso: boas-vindas → configurar Pluggy → conectar instituições → pronto.
 * Permite começar no modo demonstração.
 */
import { delegate, html, render, type SafeHtml } from '../components/dom';
import { icon, logoMark } from '../components/icons';
import { openModal } from '../components/modal';
import { APP_CONFIG } from '../config/app.config';
import { toPluggyError } from '../pluggy/errors';
import { passphraseStrength } from '../security/crypto';
import { validateCredentialFormat } from '../security/vault';
import * as actions from '../state/actions';
import { notify } from '../state/notify';
import { store } from '../state/store';
import { privacyPoints } from './privacy';

type Step = 0 | 1 | 2 | 3;

export function screenAside(): SafeHtml {
  return html`<aside class="screen__aside">
    <span class="brand"><span class="brand__mark">${logoMark()}</span><span class="brand__name">${APP_CONFIG.name}</span></span>
    <div class="stack">
      <p class="screen__headline">Saiba <em>onde está</em> cada real do seu dinheiro.</p>
      <p class="screen__lede">Contas, cartões, faturas e investimentos consolidados — processados somente no seu navegador.</p>
      <div class="preview-stack" aria-hidden="true">
        <div class="preview-card"><span>Contas</span><span class="bar"><i style="width:62%"></i></span></div>
        <div class="preview-card"><span>Investimentos</span><span class="bar"><i style="width:88%"></i></span></div>
        <div class="preview-card"><span>Cartões</span><span class="bar"><i style="width:34%;background:#eb6834"></i></span></div>
      </div>
    </div>
    <p class="row" style="color:#aab0bb;font-size:13px">${icon('shield')}<span>Sem backend próprio. Suas credenciais ficam neste navegador.</span></p>
  </aside>`;
}

export function themeFloat(): SafeHtml {
  const pref = store.state.theme.pref;
  const next = pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light';
  const label = pref === 'light' ? 'Claro' : pref === 'dark' ? 'Escuro' : 'Sistema';
  return html`<button type="button" class="icon-btn icon-btn--outline theme-float" data-action="cycle-theme" data-value="${next}" aria-label="Tema: ${label}. Alternar" data-tip="Tema: ${label}">${icon(pref === 'light' ? 'sun' : pref === 'dark' ? 'moon' : 'monitor')}</button>`;
}

export function mountOnboarding(host: HTMLElement): () => void {
  let step: Step = 0;
  let storage: 'passphrase' | 'session' = 'passphrase';
  let busy = false;
  let formError: string | null = null;
  let statusLine: string | null = null;
  const form = { clientId: '', clientSecret: '', pass1: '', pass2: '' };

  const stepsBar = () =>
    html`<div class="steps" aria-hidden="true">${[0, 1, 2, 3].map((i) => html`<span class="${i <= step ? 'is-done' : ''}"></span>`)}</div>`;

  const views: Record<Step, () => SafeHtml> = {
    0: () => html`
      ${stepsBar()}
      <span class="step-label">Bem-vindo</span>
      <h1>Tenha uma visão completa das suas finanças.</h1>
      <ul class="feature-list">
        <li>${icon('pie')}<span>Patrimônio, saldos e investimentos consolidados — sem contar nada duas vezes.</span></li>
        <li>${icon('receipt')}<span>Fatura atual, previsão de fechamento e gastos futuros dos cartões.</span></li>
        <li>${icon('flow')}<span>Fluxo de caixa, saldo projetado e insights baseados só nos seus dados.</span></li>
        <li>${icon('lock')}<span>Credenciais cifradas localmente. Nada é enviado a servidores do CashFlow.</span></li>
      </ul>
      <div class="stack-sm">
        <button type="button" class="btn btn--primary btn--lg btn--block" data-action="next">Começar${icon('chevronRight')}</button>
        <button type="button" class="btn btn--secondary btn--lg btn--block" data-action="demo">${icon('sparkle')}Começar no modo demonstração</button>
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-action="privacy" style="align-self:center">${icon('shield')}Privacidade e segurança</button>`,

    1: () => {
      const strength = passphraseStrength(form.pass1);
      return html`
      ${stepsBar()}
      <span class="step-label">Passo 1 de 3</span>
      <h1>Configure sua conexão Pluggy.</h1>
      <div class="callout callout--good">${icon('lock')}<div><strong>Suas credenciais permanecem neste navegador.</strong> As credenciais são configuradas e armazenadas localmente neste navegador. A plataforma não possui acesso ao seu Client Secret.</div></div>
      <details class="details">
        <summary>Onde encontro o Client ID e o Client Secret?</summary>
        <p class="muted">No <strong>Dashboard da Pluggy</strong> (dashboard.pluggy.ai) → <strong>Aplicações</strong> → sua aplicação. Para uso pessoal gratuito, conecte seus bancos no <strong>Meu Pluggy</strong> e vincule-os à aplicação pelo conector MeuPluggy.</p>
        <p class="muted">Recomendamos criar uma aplicação dedicada ao CashFlow, para poder revogar/rotacionar o Secret sem afetar outros usos.</p>
      </details>
      <form class="stack" data-form="credentials" novalidate autocomplete="off">
        <label class="field">
          <span class="field__label">Client ID</span>
          <input class="input" name="clientId" value="${form.clientId}" placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false" autocapitalize="off" required />
        </label>
        <label class="field">
          <span class="field__label">Client Secret</span>
          <span class="input-group input-group--action">
            ${icon('key')}
            <input class="input" name="clientSecret" type="password" value="${form.clientSecret}" autocomplete="off" spellcheck="false" autocapitalize="off" required />
            <button type="button" class="icon-btn icon-btn--sm input-group__action" data-action="reveal" data-value="clientSecret" aria-label="Mostrar/ocultar Client Secret">${icon('eye')}</button>
          </span>
          <span class="field__hint">Depois de salvo, o Secret nunca mais é exibido.</span>
        </label>
        <fieldset class="radio-cards" style="border:0;padding:0;margin:0">
          <legend class="field__label" style="margin-bottom:8px">Como guardar</legend>
          <label class="radio-card"><input type="radio" name="storage" value="passphrase" ${storage === 'passphrase' ? 'checked' : ''} data-action="storage" />
            <div><strong>Salvar cifrado neste navegador (recomendado)</strong><span>AES-256 com chave derivada de uma senha local que só você conhece.</span></div></label>
          <label class="radio-card"><input type="radio" name="storage" value="session" ${storage === 'session' ? 'checked' : ''} data-action="storage" />
            <div><strong>Usar somente nesta sessão</strong><span>Nada é salvo: ao fechar ou recarregar a aba, credenciais e dados somem.</span></div></label>
        </fieldset>
        ${storage === 'passphrase'
          ? html`<label class="field">
              <span class="field__label">Senha local</span>
              <input class="input" name="pass1" type="password" value="${form.pass1}" autocomplete="new-password" minlength="${APP_CONFIG.security.minPassphraseLength}" />
              <span class="strength" data-score="${strength.score}" aria-live="polite"><i></i><i></i><i></i><i></i><span>${form.pass1 ? strength.label : ''}</span></span>
              <span class="field__hint">Mínimo de ${APP_CONFIG.security.minPassphraseLength} caracteres. Não há como recuperá-la: se esquecer, será preciso apagar os dados locais e configurar de novo.</span>
            </label>
            <label class="field">
              <span class="field__label">Confirme a senha local</span>
              <input class="input" name="pass2" type="password" value="${form.pass2}" autocomplete="new-password" />
            </label>`
          : ''}
        ${formError ? html`<div class="callout callout--danger" role="alert">${icon('alert')}<div>${formError}</div></div>` : ''}
        ${statusLine ? html`<p class="row muted" role="status">${icon('refresh', 'spin')}<span>${statusLine}</span></p>` : ''}
        <div class="row wrap">
          <button type="button" class="btn btn--ghost" data-action="back">${icon('chevronLeft')}Voltar</button>
          <button type="submit" class="btn btn--primary grow" ${busy ? 'disabled' : ''}>${icon('shield')}Testar conexão e salvar</button>
        </div>
      </form>`;
    },

    2: () => {
      const s = store.state;
      return html`
      ${stepsBar()}
      <span class="step-label">Passo 2 de 3</span>
      <h1>Conecte suas instituições.</h1>
      <div class="callout callout--good">${icon('check')}<div><strong>Conexão com a Pluggy funcionando.</strong> Credenciais ${s.connection.vaultMode === 'session' ? 'mantidas só nesta sessão' : 'salvas e cifradas neste navegador'}.</div></div>
      <div class="option-card">
        <div class="row">${icon('plug')}<strong>Pluggy Connect</strong></div>
        <p class="muted">Widget oficial da Pluggy para conectar um banco.</p>
        <label class="check"><input type="checkbox" data-action="sandbox" ${s.preferences.includeSandbox ? 'checked' : ''} /> Incluir conectores de teste (sandbox)</label>
        <button type="button" class="btn btn--primary" data-action="connect" ${busy ? 'disabled' : ''}>${icon('plus')}Abrir Pluggy Connect</button>
      </div>
      <div class="option-card">
        <div class="row">${icon('link')}<strong>Tenho um Item ID (Meu Pluggy)</strong></div>
        <label class="field"><span class="field__label">Item ID</span><input class="input" name="itemId" placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false" /></label>
        <button type="button" class="btn btn--secondary" data-action="add-item" ${busy ? 'disabled' : ''}>${icon('check')}Adicionar Item</button>
      </div>
      ${formError ? html`<div class="callout callout--danger" role="alert">${icon('alert')}<div>${formError}</div></div>` : ''}
      ${statusLine || s.sync.progress ? html`<p class="row muted" role="status">${icon('refresh', 'spin')}<span>${statusLine ?? s.sync.progress}</span></p>` : ''}
      ${s.itemIds.length ? html`<p class="badge badge--good" style="align-self:flex-start">${icon('check')}${s.itemIds.length} instituição(ões) adicionada(s)</p>` : ''}
      <div class="row wrap">
        <button type="button" class="btn ${s.itemIds.length ? 'btn--primary' : 'btn--ghost'} grow" data-action="next">${s.itemIds.length ? 'Continuar' : 'Fazer isso depois'}${icon('chevronRight')}</button>
      </div>`;
    },

    3: () => html`
      ${stepsBar()}
      <span class="step-label">Tudo certo</span>
      <h1>Pronto. Seus dados financeiros estarão organizados em um só lugar.</h1>
      <ul class="feature-list">
        <li>${icon('refresh')}<span>Use "Atualizar agora" para buscar dados novos na Pluggy.</span></li>
        <li>${icon('layout')}<span>Personalize o dashboard: mova, redimensione, oculte e fixe cards.</span></li>
        <li>${icon('lock')}<span>O app bloqueia sozinho após ${store.state.preferences.autoLockMinutes} minutos sem uso.</span></li>
      </ul>
      <button type="button" class="btn btn--primary btn--lg btn--block" data-action="finish">Ir para o Dashboard${icon('chevronRight')}</button>`,
  };

  const paint = () => {
    render(
      host,
      html`${themeFloat()}<div class="screen">${screenAside()}<main class="screen__main" id="main"><div class="screen__panel">${views[step]()}</div></main></div>`,
    );
    const focusTarget = host.querySelector<HTMLElement>(step === 1 ? 'input[name="clientId"]' : 'h1');
    if (focusTarget && step !== 0) {
      if (focusTarget.tagName === 'H1') focusTarget.setAttribute('tabindex', '-1');
      focusTarget.focus({ preventScroll: true });
    }
  };

  const readForm = () => {
    const f = host.querySelector<HTMLFormElement>('[data-form="credentials"]');
    if (!f) return;
    const data = new FormData(f);
    form.clientId = String(data.get('clientId') ?? '').trim();
    form.clientSecret = String(data.get('clientSecret') ?? '').trim();
    form.pass1 = String(data.get('pass1') ?? '');
    form.pass2 = String(data.get('pass2') ?? '');
  };

  const submitCredentials = async () => {
    readForm();
    formError = validateCredentialFormat({ clientId: form.clientId, clientSecret: form.clientSecret });
    if (!formError && storage === 'passphrase') {
      if (form.pass1.length < APP_CONFIG.security.minPassphraseLength) formError = `A senha local precisa ter pelo menos ${APP_CONFIG.security.minPassphraseLength} caracteres.`;
      else if (form.pass1 !== form.pass2) formError = 'As senhas locais não conferem.';
    }
    if (formError) {
      paint();
      return;
    }
    busy = true;
    statusLine = 'Formato válido. Testando autenticação na Pluggy…';
    paint();
    try {
      await actions.configureCredentials(
        { clientId: form.clientId, clientSecret: form.clientSecret, passphrase: storage === 'passphrase' ? form.pass1 : null },
        { enterApp: false },
      );
      // Limpa o Secret e a senha da memória do formulário.
      form.clientSecret = '';
      form.pass1 = '';
      form.pass2 = '';
      step = 2;
      formError = null;
    } catch (e) {
      const err = e instanceof Error && e.name !== 'PluggyError' ? e : toPluggyError(e);
      formError = err.message;
      form.clientSecret = '';
    } finally {
      busy = false;
      statusLine = null;
      paint();
    }
  };

  const off = delegate(host, 'click', {
    next: () => {
      readForm();
      formError = null;
      step = Math.min(3, step + 1) as Step;
      paint();
    },
    back: () => {
      readForm();
      formError = null;
      step = Math.max(0, step - 1) as Step;
      paint();
    },
    demo: () => actions.startDemo(),
    privacy: () =>
      void openModal({
        title: 'Privacidade e segurança',
        wide: true,
        body: privacyPoints(),
      }),
    'cycle-theme': (el) => {
      actions.setTheme(el.dataset.value as 'light' | 'dark' | 'system');
      readForm();
      paint();
    },
    reveal: (el) => {
      const input = host.querySelector<HTMLInputElement>(`input[name="${el.dataset.value}"]`);
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    },
    storage: (el) => {
      readForm();
      storage = (el as HTMLInputElement).value as typeof storage;
      paint();
    },
    connect: async () => {
      formError = null;
      busy = true;
      paint();
      const ok = await actions.connectInstitution();
      busy = false;
      if (ok) notify('success', 'Instituição adicionada');
      paint();
    },
    'add-item': async () => {
      const input = host.querySelector<HTMLInputElement>('input[name="itemId"]');
      formError = null;
      busy = true;
      statusLine = 'Validando o Item na Pluggy…';
      paint();
      try {
        await actions.addItemById(input?.value ?? '');
      } catch (e) {
        formError = e instanceof Error && e.name !== 'PluggyError' ? e.message : toPluggyError(e).message;
      } finally {
        busy = false;
        statusLine = null;
        paint();
      }
    },
    finish: () => actions.enterApp(),
  });
  const offChange = delegate(host, 'change', {
    sandbox: (el) => void actions.updatePreferences({ includeSandbox: (el as HTMLInputElement).checked }),
  });
  const onSubmit = (e: Event) => {
    if ((e.target as HTMLElement).matches('[data-form="credentials"]')) {
      e.preventDefault();
      if (!busy) void submitCredentials();
    }
  };
  const onInput = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'pass1') {
      const s = passphraseStrength(t.value);
      const el = host.querySelector<HTMLElement>('.strength');
      if (el) {
        el.dataset.score = String(s.score);
        el.querySelector('span')!.textContent = t.value ? s.label : '';
      }
    }
  };
  host.addEventListener('submit', onSubmit);
  host.addEventListener('input', onInput);
  const unsub = store.subscribe((s, prev) => {
    if (step === 2 && (s.sync.progress !== prev.sync.progress || s.itemIds !== prev.itemIds)) paint();
  });

  paint();
  return () => {
    off();
    offChange();
    unsub();
    host.removeEventListener('submit', onSubmit);
    host.removeEventListener('input', onInput);
  };
}
