/**
 * Contas — saldos bancários por instituição, status das conexões e evolução do saldo.
 */
import { lineChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { confirmDialog } from '../components/modal';
import { badge, figureValue, infoTip, instLogo, money, na, segmented } from '../components/ui';
import { ACCOUNT_TYPE_LABEL, type NormalizedItem } from '../models/finance';
import type { PageContext } from '../router';
import { reconstructBalanceHistory } from '../services/financialCalculator';
import * as actions from '../state/actions';
import { store } from '../state/store';
import { addDays } from '../utils/dates';
import { formatDate, formatDateTime, formatMoney, formatRelative, formatShortDate } from '../utils/format';
import { analytics, canvasFor, chartFrame, commonHandlers, hasAnyData, noDataState, onDataChange, openAddInstitution, tableToggle } from './shared';


export function itemStatusBadge(item: NormalizedItem | null, syncingAll: boolean): SafeHtml {
  if (syncingAll) return badge('Sincronizando', 'info', 'refresh');
  if (!item) return badge('Aguardando sincronização', 'neutral', 'clock');
  switch (item.syncState) {
    case 'syncing':
      return badge('Sincronizando', 'info', 'refresh');
    case 'error':
      return badge('Erro na sincronização', 'bad', 'alert');
    case 'action_required':
      return badge('Reconexão necessária', 'warn', 'alert');
    default:
      return badge(item.lastUpdatedAt ? `Atualizado ${formatRelative(item.lastUpdatedAt)}` : 'Conectado', 'good', 'check');
  }
}

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;
  let days = 90;

  const paint = () => {
    const s = store.state;
    if (s.mode === 'real' && !hasAnyData(s) && !s.itemIds.length) {
      render(root, html`<div class="page"><div class="card">${noDataState(s)}</div></div>`);
      return;
    }
    const a = analytics();
    const ds = s.dataset;
    const demo = s.mode === 'demo';
    const checking = ds.accounts.filter((x) => x.type === 'checking' && x.currency === 'BRL').reduce((t, x) => t + x.balance, 0);
    const savings = ds.accounts.filter((x) => x.type === 'savings' && x.currency === 'BRL').reduce((t, x) => t + x.balance, 0);
    const overdraft = ds.accounts.reduce((t, x) => t + (x.overdraftUsed ?? 0), 0);
    const hist = reconstructBalanceHistory(ds.accounts, a.transactions, addDays(a.today, -days), a.today);

    // Items registrados sem dados ainda também aparecem.
    const itemIds = demo ? ds.items.map((i) => i.id) : Array.from(new Set([...s.itemIds, ...ds.items.map((i) => i.id)]));
    const syncingAll = s.sync.status === 'syncing';
    const unidentified = ds.items.filter((i) => i.institution.identitySource === 'unidentified');

    render(
      root,
      html`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">Somente contas bancárias (corrente e poupança). Investimentos, limites de cartão e faturas ficam nas respectivas páginas.</p>
          ${s.mode === 'real' ? html`<button type="button" class="btn btn--primary btn--sm" data-action="add-institution">${icon('plus')}Adicionar instituição</button>` : ''}
        </div>

        <div class="kpi-grid">
          <div class="card"><div class="figure"><span class="figure__label">Saldo em contas</span>${figureValue(a.totalBalance.base)}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Contas correntes</span>${figureValue(checking, 'md')}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Poupanças</span>${figureValue(savings, 'md')}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Cheque especial utilizado ${infoTip('Informado pela instituição (overdraftUsedLimit). Saldo negativo também é tratado como dívida no patrimônio.')}</span>${figureValue(overdraft, 'md')}</div></div>
        </div>
        ${Object.keys(a.totalBalance.others).length
          ? html`<div class="callout callout--info">${icon('info')}<div>Contas em outras moedas não entram no total em reais: ${Object.entries(a.totalBalance.others).map(([c, v]) => formatMoney(v, c)).join(' · ')}.</div></div>`
          : ''}

        <section class="card">
          <div class="card__head">
            <div class="stack-sm">
              <div class="card__title card__title--lg">Evolução do saldo em contas</div>
              <span class="muted" style="font-size:13px">Reconstruída a partir das transações lançadas (saldo atual − movimentações posteriores).</span>
            </div>
            <div class="row wrap">${segmented('range', [{ value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: '180', label: '180 dias' }], String(days), 'Período')}${tableToggle('acc-hist')}</div>
          </div>
          ${ds.accounts.length
            ? chartFrame('acc-hist', 240, `Saldo total das contas nos últimos ${days} dias`, {
                caption: 'Saldo diário reconstruído',
                headers: ['Data', 'Saldo'],
                rows: hist.filter((_, i) => i % 7 === 0 || i === hist.length - 1).map((h) => [formatDate(h.date), money(h.balance)]),
              })
            : na('Nenhuma conta bancária')}
        </section>

        <section class="section">
          <div class="section__head"><h2 class="section__title">Instituições</h2><span class="muted" style="font-size:13px">${itemIds.length} conectada(s)</span></div>
          ${unidentified.length
            ? html`<div class="callout callout--warn">${icon('info')}<div><strong>${unidentified.length === 1 ? '1 conexão do Meu Pluggy sem banco identificado.' : `${unidentified.length} conexões do Meu Pluggy sem banco identificado.`}</strong> O Meu Pluggy não informa o banco de origem. Use <strong>Personalizar</strong> para dar nome, logo e cor — eles passam a valer em todo o app.</div></div>`
            : ''}
          ${itemIds.map((id) => {
            const item = ds.items.find((i) => i.id === id) ?? null;
            const accounts = ds.accounts.filter((x) => x.itemId === id);
            const cards = ds.cards.filter((x) => x.itemId === id).length;
            const invs = ds.investments.filter((x) => x.itemId === id).length;
            const inst = item?.institution;
            const name = inst?.name ?? 'Instituição (aguardando dados)';
            const src = inst?.identitySource;
            return html`<article class="card card--flush inst-group">
              <div class="inst-group__head">
                <div class="inst-group__title">
                  ${instLogo(inst ?? { name, imageUrl: null, primaryColor: null })}
                  <div class="stack-sm" style="gap:2px;min-width:0">
                    <strong class="truncate">${name}</strong>
                    <span class="muted" style="font-size:12px">${inst?.via ? html`<span class="inst-group__via">via ${inst.via}</span> · ` : ''}${accounts.length} conta(s) · ${cards} cartão(ões) · ${invs} investimento(s)${inst?.isOpenFinance ? ' · Open Finance' : ''}</span>
                    ${src === 'detected' ? html`<span class="muted inline-note">${icon('sparkle')}Banco identificado automaticamente</span>` : ''}
                  </div>
                </div>
                <div class="row wrap">
                  ${src === 'unidentified' ? badge('Banco não identificado', 'warn', 'alert') : ''}
                  ${itemStatusBadge(item, syncingAll)}
                  ${item ? html`<button type="button" class="btn btn--secondary btn--sm" data-action="edit-identity" data-value="${id}">${icon('palette')}Personalizar</button>` : ''}
                  ${demo
                    ? ''
                    : html`<div class="menu-wrap">
                        <button type="button" class="icon-btn icon-btn--sm icon-btn--outline" data-action="item-menu" data-value="${id}" aria-haspopup="menu" aria-label="Ações para ${name}">${icon('more')}</button>
                        <div class="menu" role="menu" data-item-menu="${id}">
                          ${item ? html`<button type="button" class="menu__item" role="menuitem" data-action="edit-identity" data-value="${id}">${icon('palette')}Personalizar nome e aparência</button>` : ''}
                          <button type="button" class="menu__item" role="menuitem" data-action="item-sync" data-value="${id}">${icon('refresh')}Atualizar dados</button>
                          <button type="button" class="menu__item" role="menuitem" data-action="item-refresh" data-value="${id}">${icon('zap')}Solicitar coleta na instituição</button>
                          <button type="button" class="menu__item" role="menuitem" data-action="item-reconnect" data-value="${id}">${icon('plug')}Reconectar</button>
                          <div class="menu__sep"></div>
                          <button type="button" class="menu__item" role="menuitem" data-action="item-remove" data-value="${id}">${icon('trash')}Remover deste navegador</button>
                        </div>
                      </div>`}
                </div>
              </div>
              ${item?.message ? html`<div class="callout ${item.syncState === 'updated' ? 'callout--info' : 'callout--warn'}" style="margin:16px 24px 0">${icon('alert')}<div>${item.message}</div></div>` : ''}
              ${accounts.length
                ? accounts.map(
                    (acc) => html`<div class="account-row">
                      <div class="stack-sm" style="gap:4px;min-width:0">
                        <div class="row" style="gap:6px;min-width:0">
                          <strong class="truncate">${acc.name}</strong>
                          <button type="button" class="icon-btn icon-btn--xs" data-action="edit-identity" data-value="${id}" data-focus="${acc.id}" aria-label="Renomear ${acc.name}" data-tip="Renomear">${icon('pencil')}</button>
                        </div>
                        <div class="account-row__meta">
                          <span>${ACCOUNT_TYPE_LABEL[acc.type]}</span>
                          ${acc.rawName && acc.rawName !== acc.name ? html`<span>Na instituição: ${acc.rawName}</span>` : ''}
                          ${acc.lastDigits ? html`<span class="sensitive">•••• ${acc.lastDigits}</span>` : ''}
                          ${acc.currency !== 'BRL' ? html`<span>${acc.currency}</span>` : ''}
                          ${acc.overdraftLimit ? html`<span>Cheque especial: ${formatMoney(acc.overdraftUsed ?? 0)} de ${formatMoney(acc.overdraftLimit)}</span>` : ''}
                          ${acc.reservedTotal ? html`<span>Saldo reservado (informativo): ${formatMoney(acc.reservedTotal)}</span>` : ''}
                        </div>
                      </div>
                      <div class="account-row__value ${acc.balance < 0 ? 'neg' : ''}">${money(acc.balance, { currency: acc.currency })}</div>
                    </div>`,
                  )
                : html`<div class="account-row"><span class="muted">${item ? 'Nenhuma conta bancária neste item.' : 'Use "Atualizar agora" para baixar os dados.'}</span></div>`}
              <div class="card__foot" style="padding:12px 24px;border-top:1px solid var(--border)">
                <span>${item?.lastUpdatedAt ? `Coleta da Pluggy: ${formatDateTime(item.lastUpdatedAt)}` : 'Sem coleta registrada'}</span>
                <span>${item?.nextAutoSyncAt ? `Próxima coleta automática: ${formatShortDate(item.nextAutoSyncAt.slice(0, 10))}` : item?.consentExpiresAt ? `Consentimento até ${formatShortDate(item.consentExpiresAt.slice(0, 10))}` : ''}</span>
              </div>
            </article>`;
          })}
        </section>
      </div>`,
    );
    animateNumbers(root, (n) => formatMoney(n));
    const canvas = canvasFor(root, 'acc-hist');
    if (canvas) {
      void mountChart(
        canvas,
        lineChart(hist.map((h) => formatShortDate(h.date)), [{ label: 'Saldo em contas', data: hist.map((h) => h.balance), colorIndex: 1, fill: true }], { maxTicksX: 8, zeroLine: true }),
      );
    }
  };

  const closeMenus = () => root.querySelectorAll('[data-item-menu]').forEach((m) => m.removeAttribute('data-open'));
  const off = delegate(root, 'click', {
    ...commonHandlers,
    'add-institution': () => openAddInstitution(),
    range: (el) => {
      days = Number(el.dataset.value);
      paint();
    },
    'item-menu': (el, ev) => {
      ev.stopPropagation();
      const menu = root.querySelector<HTMLElement>(`[data-item-menu="${el.dataset.value}"]`);
      const open = menu?.getAttribute('data-open') === 'true';
      closeMenus();
      if (menu && !open) {
        menu.setAttribute('data-open', 'true');
        menu.querySelector<HTMLElement>('.menu__item')?.focus();
      }
    },
    'item-sync': (el) => {
      closeMenus();
      void actions.syncAll({ onlyItemId: el.dataset.value! });
    },
    'item-refresh': (el) => {
      closeMenus();
      void actions.requestInstitutionRefresh(el.dataset.value!);
    },
    'item-reconnect': (el) => {
      closeMenus();
      void actions.connectInstitution(el.dataset.value!);
    },
    'item-remove': async (el) => {
      closeMenus();
      const ok = await confirmDialog({
        title: 'Remover instituição deste navegador?',
        message: 'Os dados desta instituição serão apagados do cache local. O item continua existindo na Pluggy — para revogar o acesso, remova-o no Dashboard da Pluggy ou no Meu Pluggy.',
        confirmLabel: 'Remover',
        danger: true,
      });
      if (ok) await actions.removeItemLocally(el.dataset.value!);
    },
  });
  const onDoc = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.menu-wrap')) closeMenus();
  };
  document.addEventListener('click', onDoc);
  const unsub = onDataChange(paint);
  const unsubSync = store.subscribe((st, prev) => {
    if (st.sync.status !== prev.sync.status) paint();
  });
  paint();
  return () => {
    off();
    unsub();
    unsubSync();
    document.removeEventListener('click', onDoc);
  };
}
