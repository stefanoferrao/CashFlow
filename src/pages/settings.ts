/**
 * Configurações — Conta, Pluggy, Segurança, Aparência, Dashboard, Dados locais e Sobre.
 * O Client Secret NUNCA é exibido depois de salvo.
 */
import { delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { confirmDialog, openModal } from '../components/modal';
import { badge, instLogo, na, segmented } from '../components/ui';
import { APP_CONFIG } from '../config/app.config';
import { toPluggyError } from '../pluggy/errors';
import { passphraseStrength } from '../security/crypto';
import { VaultError, validateCredentialFormat } from '../security/vault';
import * as actions from '../state/actions';
import { notify } from '../state/notify';
import { store } from '../state/store';
import { clearLayout, exportVisualConfig, importVisualConfig, type ThemePref } from '../storage/preferences';
import { isPersistent } from '../storage/db';
import { formatDateTime, formatRelative } from '../utils/format';
import { commonHandlers, logoOf, openAddInstitution } from './shared';
import { itemStatusBadge } from './accounts';
import { dayOptions, institutionDatesText } from './identity';
import type { PageContext } from '../router';
import { installState, onInstallStateChange, promptInstall } from '../pwa';

const SECTIONS: Array<[string, string]> = [
  ['conta', 'Conta'],
  ['pluggy', 'Pluggy'],
  ['cartoes', 'Cartões'],
  ['seguranca', 'Segurança'],
  ['aparencia', 'Aparência'],
  ['aplicativo', 'Aplicativo'],
  ['dashboard', 'Dashboard'],
  ['dados', 'Dados locais'],
  ['sobre', 'Sobre'],
];

function row(title: string, text: string | SafeHtml, control: SafeHtml | string): SafeHtml {
  return html`<div class="setting-row"><div class="setting-row__text"><strong>${title}</strong><span>${text}</span></div><div class="row wrap">${control}</div></div>`;
}

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;
  let storageInfo = '';

  const refreshStorageInfo = async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      if (est?.usage !== undefined) storageInfo = `${(est.usage / 1024 / 1024).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB usados neste site${persisted ? ' · armazenamento persistente' : ''}`;
    } catch {
      storageInfo = '';
    }
    paint();
  };

  const paint = () => {
    // Preserva o foco em selects/controles ao repintar (acessibilidade por teclado).
    const active = document.activeElement as HTMLElement | null;
    const focusKey =
      active && root.contains(active) && active.dataset.change
        ? `[data-change="${active.dataset.change}"]${active.dataset.card ? `[data-card="${CSS.escape(active.dataset.card)}"][data-kind="${active.dataset.kind ?? ''}"]` : ''}`
        : null;
    const s = store.state;
    const demo = s.mode === 'demo';
    const c = s.connection;
    const ds = s.dataset;
    const statusText = c.status === 'ok' ? 'Funcionando' : c.status === 'error' ? 'Com erro' : c.hasCredentials ? 'Não testada nesta sessão' : 'Não configurada';
    const statusState = c.status === 'ok' ? 'ok' : c.status === 'error' ? 'error' : 'unknown';

    render(
      root,
      html`<div class="settings-layout">
        <nav class="settings-nav" aria-label="Seções de configuração">${SECTIONS.map(([id, label]) => html`<a href="#/configuracoes" data-action="jump" data-value="${id}">${label}</a>`)}</nav>
        <div class="stack">

          <section class="card settings-section" id="set-conta">
            <div class="card__title card__title--lg">${icon('user')}Conta</div>
            ${row('Modo atual', demo ? 'Demonstração — dados fictícios, nada é salvo.' : c.vaultMode === 'session' ? 'Sessão sem persistência — tudo some ao fechar a aba.' : 'Cofre local cifrado com senha.', demo ? html`<button class="btn btn--primary btn--sm" data-action="exit-demo">${icon('plug')}Sair da demonstração e configurar a Pluggy</button>` : badge(c.vaultMode === 'session' ? 'Sessão' : 'Cofre local', c.vaultMode === 'session' ? 'warn' : 'good', 'lock'))}
            ${demo
              ? ''
              : html`${row(
                  'Bloqueio automático',
                  'Descarta chaves, credenciais e dados da memória após um período sem uso.',
                  html`<select class="select select--sm" data-change="autolock" style="width:auto">${[5, 15, 30, 60, 0].map((m) => html`<option value="${m}" ${s.preferences.autoLockMinutes === m ? 'selected' : ''}>${m ? `${m} minutos` : 'Nunca'}</option>`)}</select>`,
                )}
                ${row('Bloquear agora', 'Exige a senha local para voltar.', html`<button class="btn btn--secondary btn--sm" data-action="lock">${icon('lock')}${c.vaultMode === 'session' ? 'Encerrar sessão' : 'Bloquear'}</button>`)}`}
          </section>

          <section class="card settings-section" id="set-pluggy">
            <div class="card__title card__title--lg">${icon('plug')}Pluggy</div>
            ${demo
              ? html`<p class="muted">No modo demonstração nenhuma credencial é usada.</p>`
              : html`
              <div class="callout callout--good">${icon('lock')}<div>As credenciais são configuradas e armazenadas localmente neste navegador. A plataforma não possui acesso ao seu Client Secret.</div></div>
              ${row('Client ID', c.clientIdHint ? html`<code>${c.clientIdHint}</code>` : 'Não configurado', html`<button class="btn btn--secondary btn--sm" data-action="edit-credentials">${icon('key')}${c.hasCredentials ? 'Trocar credenciais' : 'Configurar credenciais'}</button>`)}
              ${row('Client Secret', c.hasCredentials ? 'Salvo e cifrado — nunca é exibido.' : 'Não configurado', c.hasCredentials ? html`<code>••••••••••••</code>` : '')}
              ${row('Status da conexão', html`<span class="row" style="gap:6px"><span class="status-dot" data-state="${statusState}"></span>${statusText}${c.lastError ? ` — ${c.lastError}` : ''}</span>`, html`<button class="btn btn--ghost btn--sm" data-action="test" ${c.hasCredentials ? '' : 'disabled'}>${icon('refresh')}Testar conexão</button>`)}
              ${row(
                'Modo de conexão',
                html`<strong>Direto</strong>: o navegador chama api.pluggy.ai (CORS verificado). <strong>Proxy local</strong>: só se a Pluggy bloquear CORS — exige rodar o app com <code>npm run dev</code> ou <code>npm run preview</code>; o servidor local apenas repassa as requisições, sem armazenar nada.`,
                segmented('api-mode', [{ value: 'direct', label: 'Direto' }, { value: 'proxy', label: 'Proxy local' }], s.preferences.apiMode, 'Modo de conexão'),
              )}
              ${row('Conectores de teste', 'Mostrar o banco sandbox da Pluggy no Pluggy Connect (usuário user-ok, senha password-ok).', html`<label class="switch"><input type="checkbox" data-change="sandbox" ${s.preferences.includeSandbox ? 'checked' : ''} /><span class="switch__track"></span><span class="sr-only">Incluir sandbox</span></label>`)}
              <div class="setting-row" style="flex-direction:column;align-items:stretch">
                <div class="row-between wrap"><div class="setting-row__text"><strong>Instituições (Items)</strong><span>${s.itemIds.length} registrada(s) neste navegador.</span></div>
                  <button class="btn btn--primary btn--sm" data-action="add-institution" ${c.hasCredentials ? '' : 'disabled'}>${icon('plus')}Adicionar instituição</button></div>
                ${s.itemIds.length
                  ? html`<div class="list">${s.itemIds.map((id) => {
                      const it = ds.items.find((i) => i.id === id) ?? null;
                      return html`<div class="list-item">${it ? instLogo(it.institution) : html`<span class="inst-logo">${icon('bank')}</span>`}
                        <span class="list-item__main"><span class="list-item__title">${it?.institution.name ?? 'Aguardando sincronização'}</span><span class="list-item__sub">${it?.institution.via ? `via ${it.institution.via} · ` : ''}<code>${id.slice(0, 8)}…${id.slice(-4)}</code></span></span>
                        ${(ds.duplicates ?? []).some((d) => d.itemId === id) ? badge('Repetida', 'warn', 'alert') : ''}
                        ${itemStatusBadge(it, s.sync.status === 'syncing')}
                        ${it ? html`<button class="icon-btn icon-btn--sm" data-action="edit-identity" data-value="${id}" aria-label="Personalizar ${it.institution.name}" data-tip="Personalizar">${icon('palette')}</button>` : ''}
                        <button class="icon-btn icon-btn--sm" data-action="remove-item" data-value="${id}" aria-label="Remover ${it?.institution.name ?? id} deste navegador">${icon('trash')}</button></div>`;
                    })}</div>`
                  : ''}
              </div>`}
          </section>

          <section class="card settings-section" id="set-cartoes">
            <div class="card__title card__title--lg">${icon('card')}Cartões de crédito</div>
            <p class="muted" style="font-size:13px;margin-top:8px">Defina os dias de fechamento e vencimento quando a instituição não informa ou informa datas que não batem com a sua fatura. Os dias definidos aqui têm prioridade e valem na fatura atual, nas próximas faturas, no melhor dia de compra e no saldo projetado.</p>
            ${ds.cards.length
              ? ds.cards.map((card) => {
                  const both = !!(card.closingDate && card.dueDate);
                  return html`<div class="setting-row">
                    <div class="setting-row__text">
                      <strong class="inst-name">${instLogo(logoOf(card), 'xs')}<span class="inst-name__text">${card.label ?? card.name}${card.lastFourDigits ? ` · final ${card.lastFourDigits}` : ''}</span></strong>
                      <span>${institutionDatesText(card)}</span>
                    </div>
                    <div class="row wrap">
                      <label class="field"><span class="field__label">Fechamento</span><select class="select select--sm" data-change="card-cycle" data-card="${card.id}" data-kind="closing" aria-label="Dia de fechamento — ${card.label ?? card.name}">${dayOptions(card.manualClosingDay, both ? 'Da instituição' : 'Não definido')}</select></label>
                      <label class="field"><span class="field__label">Vencimento</span><select class="select select--sm" data-change="card-cycle" data-card="${card.id}" data-kind="due" aria-label="Dia de vencimento — ${card.label ?? card.name}">${dayOptions(card.manualDueDay, both ? 'Da instituição' : 'Não definido')}</select></label>
                    </div>
                  </div>`;
                })
              : na('Nenhum cartão de crédito nas instituições conectadas.')}
          </section>

          <section class="card settings-section" id="set-seguranca">
            <div class="card__title card__title--lg">${icon('shield')}Segurança</div>
            ${!demo && c.vaultMode === 'passphrase' ? row('Alterar senha local', `PBKDF2-SHA256 com ${APP_CONFIG.security.pbkdf2Iterations.toLocaleString('pt-BR')} iterações protege a chave de dados.`, html`<button class="btn btn--secondary btn--sm" data-action="change-pass">${icon('key')}Alterar senha</button>`) : ''}
            ${!demo ? row('Remover credenciais', 'Remove Client ID e Client Secret deste navegador. O cache financeiro cifrado é mantido.', html`<button class="btn btn--danger btn--sm" data-action="remove-credentials" ${c.hasCredentials ? '' : 'disabled'}>${icon('trash')}Remover credenciais</button>`) : ''}
            ${row('Exportar configuração visual', 'Tema, preferências de exibição e layout do dashboard (sem dados financeiros e sem credenciais).', html`<button class="btn btn--secondary btn--sm" data-action="export">${icon('download')}Exportar</button>`)}
            ${row('Restaurar configuração', 'Importa um arquivo exportado anteriormente.', html`<label class="btn btn--secondary btn--sm">${icon('upload')}Importar<input type="file" accept="application/json,.json" data-change="import" hidden /></label>`)}
            ${row('Apagar todos os dados locais', 'Remove credenciais, cache financeiro, categorização, layout e preferências deste navegador. Não afeta seus dados na Pluggy.', html`<button class="btn btn--danger-solid btn--sm" data-action="wipe">${icon('trash')}Apagar tudo</button>`)}
          </section>

          <section class="card settings-section" id="set-aparencia">
            <div class="card__title card__title--lg">${icon('palette')}Aparência</div>
            ${row('Tema', 'Claro, escuro ou seguir o sistema.', segmented('theme', [{ value: 'light', label: '☀️ Claro' }, { value: 'dark', label: '🌙 Escuro' }, { value: 'system', label: 'Sistema' }], s.theme.pref, 'Tema'))}
            ${row('Ocultar valores', 'Desfoca valores monetários na tela (útil em locais públicos).', html`<label class="switch"><input type="checkbox" data-change="hide-values" ${s.preferences.hideValues ? 'checked' : ''} /><span class="switch__track"></span><span class="sr-only">Ocultar valores</span></label>`)}
            ${row('Incluir estimativas', 'Usar recorrências detectadas no histórico em receitas/despesas previstas e no saldo projetado.', html`<label class="switch"><input type="checkbox" data-change="estimates" ${s.preferences.includeEstimates ? 'checked' : ''} /><span class="switch__track"></span><span class="sr-only">Incluir estimativas</span></label>`)}
          </section>

          <section class="card settings-section" id="set-aplicativo">
            <div class="card__title card__title--lg">${icon('phone')}Aplicativo</div>
            ${(() => {
              const st = installState();
              if (st === 'installed') return row('CashFlow instalado', 'Você está usando o aplicativo. Ele abre em janela própria, sem barra do navegador.', badge('Instalado', 'good', 'check'));
              if (st === 'available')
                return row('Instalar o CashFlow', 'Instale como aplicativo no celular ou no computador: ícone na tela inicial, janela própria e abertura mesmo sem internet.', html`<button type="button" class="btn btn--primary btn--sm" data-action="install-app">${icon('phone')}Instalar aplicativo</button>`);
              if (st === 'ios')
                return row(
                  'Instalar no iPhone ou iPad',
                  html`No <strong>Safari</strong>, toque em <span class="inline-note">${icon('share')}<strong>Compartilhar</strong></span> e depois em <strong>Adicionar à Tela de Início</strong>. O CashFlow passa a abrir como aplicativo.`,
                  '',
                );
              return row('Instalar o CashFlow', 'Abra este endereço no Chrome ou Edge (Android, Windows, macOS, Linux) ou no Safari (iPhone/iPad) para instalar como aplicativo. O endereço precisa ser https (ou localhost).', '');
            })()}
            ${row('Funciona sem internet', 'Depois da primeira abertura, o app abre mesmo offline e mostra os dados já baixados (cifrados neste aparelho). Sincronizar com a Pluggy exige internet.', badge(s.online ? 'Online' : 'Offline', s.online ? 'good' : 'warn'))}
            ${row('Privacidade', 'O modo aplicativo guarda só os arquivos do CashFlow e os logos das instituições. Credenciais e dados financeiros continuam apenas no cofre cifrado deste aparelho.', '')}
          </section>

          <section class="card settings-section" id="set-dashboard">
            <div class="card__title card__title--lg">${icon('layout')}Dashboard</div>
            ${row('Personalizar', 'Mova, redimensione, oculte, mostre e fixe cards.', html`<a class="btn btn--secondary btn--sm" href="#/dashboard">${icon('layout')}Abrir dashboard</a>`)}
            ${row('Restaurar layout padrão', 'Volta posições, tamanhos e visibilidade originais.', html`<button class="btn btn--ghost btn--sm" data-action="reset-layout">${icon('refresh')}Restaurar</button>`)}
          </section>

          <section class="card settings-section" id="set-dados">
            <div class="card__title card__title--lg">${icon('database')}Dados locais</div>
            ${row(
              'Armazenamento',
              demo
                ? 'Modo demonstração: nada é gravado — os dados fictícios existem só na memória desta aba.'
                : !isPersistent()
                  ? 'IndexedDB indisponível — dados apenas em memória nesta aba.'
                  : c.persistent
                    ? html`IndexedDB deste navegador, cifrado com AES-GCM. ${storageInfo}`
                    : 'Sessão sem persistência: dados financeiros só em memória; nada é gravado no IndexedDB.',
              badge(c.persistent && !demo ? 'Persistente' : 'Somente memória', c.persistent && !demo ? 'good' : 'warn'),
            )}
            ${row('Última atualização', s.sync.lastSyncAt ? `${formatDateTime(s.sync.lastSyncAt)} (${formatRelative(s.sync.lastSyncAt)})` : 'Nunca', html`<button class="btn btn--secondary btn--sm" data-action="sync-now">${icon('refresh')}Atualizar agora</button>`)}
            ${row(
              'Validade do cache',
              'Depois desse tempo, o app baixa os dados novamente ao ser desbloqueado.',
              html`<select class="select select--sm" data-change="ttl" style="width:auto">${[1, 6, 12, 24].map((h) => html`<option value="${h}" ${s.preferences.cacheTtlHours === h ? 'selected' : ''}>${h} hora${h > 1 ? 's' : ''}</option>`)}</select>`,
            )}
            ${row('Conteúdo', `${ds.accounts.length} contas · ${ds.cards.length} cartões · ${ds.transactions.length} transações · ${ds.investments.length} investimentos · ${ds.snapshots.length} registros de patrimônio`, !demo ? html`<button class="btn btn--ghost btn--sm" data-action="clear-cache">${icon('trash')}Limpar cache financeiro</button>` : '')}
          </section>

          <section class="card settings-section" id="set-sobre">
            <div class="card__title card__title--lg">${icon('info')}Sobre</div>
            ${row(`${APP_CONFIG.name} ${APP_CONFIG.version}`, 'Aplicação 100% frontend sobre a API da Pluggy. Sem backend próprio, sem analytics, sem telemetria.', html`<a class="btn btn--secondary btn--sm" href="#/novidades">${icon('gift')}Notas de Atualização</a><a class="btn btn--ghost btn--sm" href="#/privacidade">${icon('shield')}Privacidade</a>`)}
            ${row('Bibliotecas', html`Chart.js 4.5.1 (MIT) · GridStack 13.3.0 (MIT) · DM Sans (OFL) · Vite (MIT, apenas build) · Ícones de instituições: <a href="https://github.com/henriquezolini/react-bancos" target="_blank" rel="noopener noreferrer">react-bancos</a> (MIT). Os logos são marcas de seus titulares, usados só para identificar as instituições.`, '')}
            ${row('Documentação da Pluggy', html`<a href="https://docs.pluggy.ai/pt/docs/overview" target="_blank" rel="noopener noreferrer">docs.pluggy.ai</a> · <a href="https://meu.pluggy.ai" target="_blank" rel="noopener noreferrer">meu.pluggy.ai</a>`, '')}
            ${row('Modo de depuração', 'Registra no console deste navegador informações técnicas REDIGIDAS (sem segredos, tokens ou documentos).', html`<label class="switch"><input type="checkbox" data-change="debug" ${s.preferences.debug ? 'checked' : ''} /><span class="switch__track"></span><span class="sr-only">Modo de depuração</span></label>`)}
          </section>
        </div>
      </div>`,
    );
    if (focusKey) root.querySelector<HTMLElement>(focusKey)?.focus();
  };

  const openCredentials = () => {
    const c = store.state.connection;
    const m = openModal({
      title: c.hasCredentials ? 'Trocar credenciais da Pluggy' : 'Configurar credenciais da Pluggy',
      body: html`<div class="callout callout--good">${icon('lock')}<div>Suas credenciais permanecem neste navegador, cifradas. A plataforma não possui acesso ao seu Client Secret.</div></div>
        <form class="stack" data-cred-form autocomplete="off" novalidate>
          <label class="field"><span class="field__label">Client ID</span><input class="input" name="clientId" autocomplete="off" spellcheck="false" placeholder="00000000-0000-0000-0000-000000000000" /></label>
          <label class="field"><span class="field__label">Client Secret</span><input class="input" name="clientSecret" type="password" autocomplete="off" spellcheck="false" /></label>
          <p class="field__error" data-err hidden></p>
          <p class="row muted" data-status hidden>${icon('refresh', 'spin')}<span>Testando autenticação…</span></p>
        </form>`,
      footer: html`<button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button><button type="button" class="btn btn--primary" data-save>${icon('shield')}Testar e salvar</button>`,
    });
    const err = m.el.querySelector<HTMLElement>('[data-err]')!;
    const status = m.el.querySelector<HTMLElement>('[data-status]')!;
    const save = m.el.querySelector<HTMLButtonElement>('[data-save]')!;
    const submit = async () => {
      const f = new FormData(m.el.querySelector<HTMLFormElement>('[data-cred-form]')!);
      const clientId = String(f.get('clientId') ?? '').trim();
      const clientSecret = String(f.get('clientSecret') ?? '').trim();
      const fmt = validateCredentialFormat({ clientId, clientSecret });
      err.hidden = true;
      if (fmt) {
        err.textContent = fmt;
        err.hidden = false;
        return;
      }
      save.disabled = true;
      status.hidden = false;
      try {
        await actions.configureCredentials({ clientId, clientSecret, passphrase: store.state.connection.vaultMode === 'session' ? null : '' });
        m.close();
        notify('success', 'Credenciais salvas', 'Autenticação na Pluggy funcionando.');
      } catch (e) {
        err.textContent = e instanceof Error && e.name !== 'PluggyError' ? e.message : toPluggyError(e).message;
        err.hidden = false;
      } finally {
        save.disabled = false;
        status.hidden = true;
      }
    };
    save.addEventListener('click', () => void submit());
    m.el.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      void submit();
    });
  };

  const openChangePassphrase = () => {
    const m = openModal({
      title: 'Alterar senha local',
      body: html`<form class="stack" data-pass-form novalidate>
        <label class="field"><span class="field__label">Senha atual</span><input class="input" type="password" name="current" autocomplete="current-password" /></label>
        <label class="field"><span class="field__label">Nova senha</span><input class="input" type="password" name="next" autocomplete="new-password" /><span class="strength" data-score="0"><i></i><i></i><i></i><i></i><span></span></span></label>
        <label class="field"><span class="field__label">Confirmar nova senha</span><input class="input" type="password" name="confirm" autocomplete="new-password" /></label>
        <p class="field__error" data-err hidden></p>
      </form>`,
      footer: html`<button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button><button type="button" class="btn btn--primary" data-save>Alterar senha</button>`,
    });
    const form = m.el.querySelector<HTMLFormElement>('[data-pass-form]')!;
    form.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name !== 'next') return;
      const st = passphraseStrength(t.value);
      const el = form.querySelector<HTMLElement>('.strength')!;
      el.dataset.score = String(st.score);
      el.querySelector('span')!.textContent = t.value ? st.label : '';
    });
    const err = m.el.querySelector<HTMLElement>('[data-err]')!;
    m.el.querySelector('[data-save]')!.addEventListener('click', async () => {
      const f = new FormData(form);
      const next = String(f.get('next') ?? '');
      if (next !== String(f.get('confirm') ?? '')) {
        err.textContent = 'As senhas não conferem.';
        err.hidden = false;
        return;
      }
      try {
        await actions.changePassphrase(String(f.get('current') ?? ''), next);
        m.close();
      } catch (e) {
        err.textContent = e instanceof VaultError ? e.message : 'Não foi possível alterar a senha.';
        err.hidden = false;
      }
    });
  };

  const off = delegate(root, 'click', {
    ...commonHandlers,
    jump: (el, ev) => {
      ev.preventDefault();
      document.getElementById(`set-${el.dataset.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'exit-demo': () => void actions.exitDemo(),
    lock: () => actions.lockApp('manual'),
    'edit-credentials': () => openCredentials(),
    test: () => void actions.testConnection(),
    'api-mode': (el) => {
      void actions.updatePreferences({ apiMode: el.dataset.value === 'proxy' ? 'proxy' : 'direct' });
      notify('info', 'Modo de conexão alterado', el.dataset.value === 'proxy' ? 'As chamadas passarão pelo servidor local (/pluggy-api).' : 'As chamadas irão direto para api.pluggy.ai.');
    },
    'add-institution': () => openAddInstitution(),
    'remove-item': async (el) => {
      const ok = await confirmDialog({ title: 'Remover instituição deste navegador?', message: 'Os dados locais desta instituição serão apagados. O item continua existindo na Pluggy.', confirmLabel: 'Remover', danger: true });
      if (ok) await actions.removeItemLocally(el.dataset.value!);
    },
    'change-pass': () => openChangePassphrase(),
    'install-app': async () => {
      await promptInstall();
      paint();
    },
    'remove-credentials': async () => {
      const ok = await confirmDialog({ title: 'Remover credenciais?', message: 'Client ID e Client Secret serão apagados deste navegador. Para sincronizar de novo será preciso informá-los novamente.', confirmLabel: 'Remover credenciais', danger: true });
      if (ok) await actions.removeCredentials();
    },
    export: async () => {
      const json = await exportVisualConfig();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashflow-config-visual-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('success', 'Configuração exportada', 'O arquivo não contém dados financeiros nem credenciais.');
    },
    wipe: async () => {
      const ok = await confirmDialog({
        title: 'Apagar todos os dados locais?',
        message: 'Credenciais, cache financeiro cifrado, categorização, lançamentos previstos, layout e preferências serão removidos deste navegador. Esta ação não pode ser desfeita. Seus dados na Pluggy não são afetados.',
        confirmLabel: 'Apagar tudo',
        danger: true,
        requireText: 'APAGAR',
      });
      if (ok) {
        await actions.wipeAllLocalData();
        notify('success', 'Dados locais apagados');
      }
    },
    theme: (el) => {
      actions.setTheme(el.dataset.value as ThemePref);
      paint();
    },
    'reset-layout': async () => {
      await clearLayout();
      notify('success', 'Layout restaurado');
    },
    'clear-cache': async () => {
      const ok = await confirmDialog({ title: 'Limpar cache financeiro?', message: 'Os dados baixados da Pluggy serão apagados deste navegador (credenciais, Items registrados, categorização, lançamentos previstos e personalizações são mantidos).', confirmLabel: 'Limpar cache', danger: true });
      if (ok) await actions.clearFinancialCache();
    },
  });

  const offChange = delegate(root, 'change', {
    autolock: (el) => void actions.updatePreferences({ autoLockMinutes: Number((el as HTMLSelectElement).value) }),
    sandbox: (el) => void actions.updatePreferences({ includeSandbox: (el as HTMLInputElement).checked }),
    'hide-values': (el) => void actions.updatePreferences({ hideValues: (el as HTMLInputElement).checked }),
    estimates: (el) => void actions.updatePreferences({ includeEstimates: (el as HTMLInputElement).checked }),
    debug: (el) => void actions.updatePreferences({ debug: (el as HTMLInputElement).checked }),
    ttl: (el) => void actions.updatePreferences({ cacheTtlHours: Number((el as HTMLSelectElement).value) }),
    'card-cycle': async (el) => {
      const cardId = el.dataset.card!;
      const read = (kind: string) => {
        const v = root.querySelector<HTMLSelectElement>(`[data-change="card-cycle"][data-card="${CSS.escape(cardId)}"][data-kind="${kind}"]`)?.value;
        return v ? Number(v) : null;
      };
      await actions.setCardCycle(cardId, { closingDay: read('closing'), dueDay: read('due') });
      notify('success', 'Datas do cartão salvas', 'Fatura atual, previsão e saldo projetado foram recalculados.');
    },
    import: async (el) => {
      const input = el as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (file.size > 200_000) {
        notify('error', 'Arquivo grande demais', 'A configuração visual tem poucos KB.');
        return;
      }
      try {
        await importVisualConfig(await file.text());
        actions.setTheme((localStorage.getItem('cashflow.theme') as ThemePref) ?? 'system');
        await actions.reloadPreferences();
        notify('success', 'Configuração restaurada');
      } catch (e) {
        notify('error', 'Não foi possível importar', e instanceof Error ? e.message : 'Arquivo inválido.');
      }
    },
  });

  const unsub = store.subscribe((s, prev) => {
    if (s.connection !== prev.connection || s.preferences !== prev.preferences || s.itemIds !== prev.itemIds || s.sync !== prev.sync || s.dataVersion !== prev.dataVersion || s.online !== prev.online) paint();
  });
  const offInstall = onInstallStateChange(paint);
  paint();
  const section = ctx.params.get('secao');
  if (section) requestAnimationFrame(() => document.getElementById(`set-${section}`)?.scrollIntoView({ block: 'start' }));
  void refreshStorageInfo();
  return () => {
    off();
    offChange();
    unsub();
    offInstall();
  };
}
