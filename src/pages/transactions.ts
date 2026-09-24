/**
 * Transações — busca instantânea, filtros, ordenação, paginação e categorização local.
 * Os filtros são renderizados uma vez; só a área de resultados é atualizada (sem perder foco).
 */
import { delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { confirmDialog, openModal } from '../components/modal';
import { badge, categoryIcon, categoryLabel, instLogo, money, stateBlock } from '../components/ui';
import { APP_CONFIG } from '../config/app.config';
import { APP_CATEGORIES, TRANSACTION_KIND_LABEL, type AppCategoryId, type NormalizedTransaction } from '../models/finance';
import type { PageContext } from '../router';
import { DEFAULT_SUBCATEGORIES } from '../services/categories';
import { recurrenceKey } from '../services/recurrence';
import { defaultFilters, filterTransactions, paginate, sortTransactions, summarizeTransactions, type SortKey, type TxFilters } from '../services/transactionQuery';
import * as actions from '../state/actions';
import { store } from '../state/store';
import { debounce } from '../utils/async';
import { formatDate, formatMoney, formatSignedMoney } from '../utils/format';
import { analytics, commonHandlers, hasAnyData, institutionOf, noDataState, onDataChange } from './shared';

const TYPE_OPTIONS: Array<[TxFilters['type'], string]> = [
  ['all', 'Todos'],
  ['in', 'Entradas'],
  ['out', 'Saídas'],
  ['internal', 'Transferências próprias'],
  ['card_payment', 'Pagamento de fatura'],
  ['investment', 'Investimentos'],
  ['pending', 'Pendentes/futuras'],
  ['ignored', 'Ignoradas nos cálculos'],
];

const PERIOD_OPTIONS: Array<[TxFilters['period'], string]> = [
  ['month', 'Este mês'],
  ['prev', 'Mês passado'],
  ['30', 'Últimos 30 dias'],
  ['90', 'Últimos 90 dias'],
  ['365', 'Últimos 12 meses'],
  ['all', 'Tudo (inclui futuras)'],
  ['custom', 'Personalizado'],
];

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;
  const filters: TxFilters = defaultFilters();
  if (ctx.params.get('card')) filters.card = ctx.params.get('card')!;
  if (ctx.params.get('account')) filters.account = ctx.params.get('account')!;
  if (ctx.params.get('category')) filters.category = ctx.params.get('category') as AppCategoryId;
  if (filters.card || filters.account) filters.period = '365';
  let sortKey: SortKey = 'date';
  let sortDir: 'asc' | 'desc' = 'desc';
  let page = 1;
  let pageSize: number = APP_CONFIG.ui.defaultPageSize;

  const accountName = new Map<string, string>();
  const refreshLookups = () => {
    accountName.clear();
    for (const a of store.state.dataset.accounts) accountName.set(a.id, a.name);
    for (const c of store.state.dataset.cards) accountName.set(c.id, c.name);
  };
  const sourceName = (t: NormalizedTransaction) => accountName.get(t.accountId ?? t.cardId ?? '') ?? t.institution;

  const instBadge = (itemId: string, name: string, size: 'xs' | 'sm') => {
    const inst = institutionOf(itemId);
    return instLogo(inst ?? { name, imageUrl: null, primaryColor: null }, size);
  };

  const option = (value: string, label: string, current: string) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;

  const paintShell = () => {
    const s = store.state;
    if (s.mode === 'real' && !hasAnyData(s)) {
      render(root, html`<div class="page"><div class="card">${noDataState(s)}</div></div>`);
      return false;
    }
    refreshLookups();
    const ds = s.dataset;
    const institutions = Array.from(new Set(ds.transactions.map((t) => t.institution))).sort();
    const rulesCount = s.categorization.rules.length;
    render(
      root,
      html`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">Categorias e ajustes feitos aqui ficam somente neste navegador. Transferências próprias, pagamentos de fatura e aplicações não contam como receita ou despesa.</p>
          <button type="button" class="btn btn--secondary btn--sm" data-action="rules">${icon('settings')}Regras de categorização${rulesCount ? ` (${rulesCount})` : ''}</button>
        </div>
        <section class="card stack" aria-label="Filtros">
          <div class="filter-bar">
            <label class="input-group" style="flex:1 1 260px">
              ${icon('search')}
              <span class="sr-only">Buscar transações</span>
              <input class="input" type="search" data-filter="q" placeholder="Buscar por descrição, estabelecimento, categoria…" value="${filters.q}" autocomplete="off" />
            </label>
            <label class="field" style="flex:0 1 220px"><span class="sr-only">Período</span>
              <select class="select" data-filter="period">${PERIOD_OPTIONS.map(([v, l]) => option(v, l, filters.period))}</select>
            </label>
            <button type="button" class="btn btn--ghost btn--sm" data-action="toggle-filters" aria-expanded="false" aria-controls="more-filters">${icon('filter')}Mais filtros</button>
            <button type="button" class="btn btn--ghost btn--sm" data-action="clear-filters">${icon('x')}Limpar</button>
          </div>
          <div class="filters" id="more-filters" data-more-filters ${filters.card || filters.account || filters.category ? '' : 'hidden'}>
            <label class="field" data-custom-range ${filters.period === 'custom' ? '' : 'hidden'}><span class="field__label">De</span><input class="input input--sm" type="date" data-filter="from" value="${filters.from ?? ''}" /></label>
            <label class="field" data-custom-range ${filters.period === 'custom' ? '' : 'hidden'}><span class="field__label">Até</span><input class="input input--sm" type="date" data-filter="to" value="${filters.to ?? ''}" /></label>
            <label class="field"><span class="field__label">Conta</span>
              <select class="select select--sm" data-filter="account">${option('', 'Todas', filters.account)}${ds.accounts.map((a) => option(a.id, `${a.institution} · ${a.name}`, filters.account))}</select></label>
            <label class="field"><span class="field__label">Cartão</span>
              <select class="select select--sm" data-filter="card">${option('', 'Todos', filters.card)}${ds.cards.map((c) => option(c.id, `${c.institution} · ${c.name}`, filters.card))}</select></label>
            <label class="field"><span class="field__label">Instituição</span>
              <select class="select select--sm" data-filter="institution">${option('', 'Todas', filters.institution)}${institutions.map((i) => option(i, i, filters.institution))}</select></label>
            <label class="field"><span class="field__label">Categoria</span>
              <select class="select select--sm" data-filter="category">${option('', 'Todas', filters.category)}${APP_CATEGORIES.map((c) => option(c.id, c.label, filters.category))}</select></label>
            <label class="field"><span class="field__label">Tipo</span>
              <select class="select select--sm" data-filter="type">${TYPE_OPTIONS.map(([v, l]) => option(v, l, filters.type))}</select></label>
            <label class="field"><span class="field__label">Valor mínimo (R$)</span><input class="input input--sm" type="number" inputmode="decimal" min="0" step="0.01" data-filter="min" value="${filters.min ?? ''}" /></label>
            <label class="field"><span class="field__label">Valor máximo (R$)</span><input class="input input--sm" type="number" inputmode="decimal" min="0" step="0.01" data-filter="max" value="${filters.max ?? ''}" /></label>
          </div>
        </section>
        <div data-results></div>
      </div>`,
    );
    return true;
  };

  const sortHeader = (key: SortKey, label: string, cls = '') =>
    html`<th scope="col" class="${cls}" aria-sort="${sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}">
      <button type="button" class="th-sort" data-action="sort" data-value="${key}" data-active="${sortKey === key}">${label}${icon(sortKey === key ? (sortDir === 'asc' ? 'chevronUp' : 'chevronDown') : 'sort')}</button>
    </th>`;

  const txBadges = (t: NormalizedTransaction): SafeHtml =>
    html`${t.installment ? html`<span class="badge">${t.installment.number}/${t.installment.total}</span>` : ''}${t.status === 'pending' ? badge(t.date > analytics().today ? 'Futura' : 'Pendente', 'warn') : ''}${t.ignored ? badge('Ignorada', 'outline') : ''}`;

  const paintResults = () => {
    const box = root.querySelector<HTMLElement>('[data-results]');
    if (!box) return;
    const a = analytics();
    const filtered = filterTransactions(a.transactions, filters, a.today, (t) => `${sourceName(t)} ${categoryLabel(t.category)}`);
    const sorted = sortTransactions(filtered, sortKey, sortDir, categoryLabel);
    const sum = summarizeTransactions(sorted);
    const pg = paginate(sorted, page, pageSize);
    page = pg.page;

    if (!sorted.length) {
      render(box, html`<div class="card">${stateBlock({ kind: 'empty', title: 'Nenhuma transação encontrada', text: 'Ajuste a busca ou os filtros.', action: { label: 'Limpar filtros', action: 'clear-filters', icon: 'x', primary: false }, compact: true })}</div>`);
      return;
    }

    // Lista mobile agrupada por dia
    const groups: Array<{ date: string; items: NormalizedTransaction[] }> = [];
    for (const t of pg.items) {
      const g = groups[groups.length - 1];
      if (g && g.date === t.date && sortKey === 'date') g.items.push(t);
      else groups.push({ date: t.date, items: [t] });
    }

    render(
      box,
      html`<div class="summary-strip" role="status" aria-live="polite" style="margin-bottom:12px">
          <span><strong>${sum.count}</strong> transações</span>
          <span>Entradas <strong class="money pos">${formatMoney(sum.inflow)}</strong></span>
          <span>Saídas <strong class="money neg">${formatMoney(sum.outflow)}</strong></span>
          <span>Resultado <strong class="money">${formatSignedMoney(sum.net)}</strong></span>
          ${sum.otherCurrency ? html`<span>${sum.otherCurrency} em outras moedas (fora das somas)</span>` : ''}
        </div>
        <section class="card card--flush">
          <div class="tx-table-view table-wrap">
            <table class="table">
              <caption class="sr-only">Transações filtradas</caption>
              <thead><tr>
                ${sortHeader('date', 'Data')}
                ${sortHeader('description', 'Descrição')}
                <th scope="col">Conta</th>
                ${sortHeader('category', 'Categoria')}
                <th scope="col">Tipo</th>
                ${sortHeader('amount', 'Valor', 'num')}
              </tr></thead>
              <tbody>
                ${pg.items.map(
                  (t) => html`<tr data-clickable data-action="open-tx" data-value="${t.id}" tabindex="0" aria-label="${t.description}, ${formatSignedMoney(t.amount, t.currency)}">
                    <td class="nowrap num">${formatDate(t.date)}</td>
                    <td><div class="tx-desc">${categoryIcon(t.category)}<div class="tx-desc__text"><strong title="${t.description}">${t.description}</strong><span class="row" style="gap:6px">${t.subcategory ?? t.providerCategory ?? ''}${txBadges(t)}</span></div></div></td>
                    <td><div class="tx-desc">${instBadge(t.itemId, t.institution, 'sm')}<div class="tx-desc__text"><span style="font-size:13px;color:var(--text)">${sourceName(t)}</span><span>${t.institution}</span></div></div></td>
                    <td>${categoryLabel(t.category)}${t.userCategorized ? html` <span class="badge badge--accent" title="Alterada por você">editada</span>` : ''}</td>
                    <td><span class="muted" style="font-size:12px">${TRANSACTION_KIND_LABEL[t.kind]}</span></td>
                    <td class="num">${money(t.amount, { currency: t.currency, signed: true, tone: true })}</td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>
          <div class="tx-list-view">
            ${groups.map(
              (g) => html`<div class="day-head">${formatDate(g.date)}</div>
                <div class="list">${g.items.map(
                  (t) => html`<button type="button" class="list-item" data-action="open-tx" data-value="${t.id}">
                    ${categoryIcon(t.category)}
                    <span class="list-item__main"><span class="list-item__title">${t.description}</span><span class="list-item__sub"><span class="inst-name">${instBadge(t.itemId, t.institution, 'xs')}<span class="inst-name__text">${t.institution} · ${sourceName(t)} · ${categoryLabel(t.category)}</span></span></span></span>
                    <span class="list-item__end">${money(t.amount, { currency: t.currency, signed: true, tone: true })}<span class="row" style="gap:4px">${txBadges(t)}</span></span>
                  </button>`,
                )}</div>`,
            )}
          </div>
          <div class="pagination">
            <span>Página ${pg.page} de ${pg.pages} · ${sorted.length} resultado(s)</span>
            <div class="row">
              <label class="row" style="gap:6px"><span>Por página</span>
                <select class="select select--sm" data-filter="pageSize" style="width:auto">${[25, 50, 100].map((n) => option(String(n), String(n), String(pageSize)))}</select>
              </label>
              <button type="button" class="icon-btn icon-btn--sm icon-btn--outline" data-action="page" data-value="${pg.page - 1}" aria-label="Página anterior" ${pg.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
              <button type="button" class="icon-btn icon-btn--sm icon-btn--outline" data-action="page" data-value="${pg.page + 1}" aria-label="Próxima página" ${pg.page >= pg.pages ? 'disabled' : ''}>${icon('chevronRight')}</button>
            </div>
          </div>
        </section>`,
    );
  };

  const full = () => {
    if (paintShell()) paintResults();
  };

  const readFilter = (el: HTMLInputElement | HTMLSelectElement) => {
    const key = el.dataset.filter!;
    const v = el.value;
    switch (key) {
      case 'q':
        filters.q = v;
        break;
      case 'period':
        filters.period = v as TxFilters['period'];
        root.querySelectorAll<HTMLElement>('[data-custom-range]').forEach((x) => (x.hidden = v !== 'custom'));
        if (v === 'custom') {
          const more = root.querySelector<HTMLElement>('[data-more-filters]');
          if (more) more.hidden = false;
        }
        break;
      case 'from':
        filters.from = v || null;
        break;
      case 'to':
        filters.to = v || null;
        break;
      case 'min':
        filters.min = v === '' ? null : Math.abs(Number(v));
        break;
      case 'max':
        filters.max = v === '' ? null : Math.abs(Number(v));
        break;
      case 'pageSize':
        pageSize = Number(v) || APP_CONFIG.ui.defaultPageSize;
        break;
      case 'account':
      case 'card':
      case 'institution':
      case 'category':
      case 'type':
        (filters as unknown as Record<string, string>)[key] = v;
        break;
    }
    page = 1;
  };

  const debouncedSearch = debounce(() => paintResults(), APP_CONFIG.ui.searchDebounceMs);
  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.filter) return;
    readFilter(el);
    if (el.dataset.filter === 'q' || el.dataset.filter === 'min' || el.dataset.filter === 'max') debouncedSearch();
  };
  const onChange = (e: Event) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (!el.dataset.filter || el.dataset.filter === 'q') return;
    readFilter(el);
    paintResults();
  };
  const onKey = (e: KeyboardEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('tr[data-action="open-tx"]');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openTransaction(row.dataset.value!);
    }
  };
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', onKey);

  const off = delegate(root, 'click', {
    ...commonHandlers,
    sort: (el) => {
      const k = el.dataset.value as SortKey;
      if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {
        sortKey = k;
        sortDir = k === 'description' || k === 'category' ? 'asc' : 'desc';
      }
      paintResults();
    },
    page: (el) => {
      page = Number(el.dataset.value);
      paintResults();
      root.querySelector('[data-results]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    'toggle-filters': (el) => {
      const more = root.querySelector<HTMLElement>('[data-more-filters]');
      if (!more) return;
      more.hidden = !more.hidden;
      el.setAttribute('aria-expanded', String(!more.hidden));
    },
    'clear-filters': () => {
      Object.assign(filters, defaultFilters());
      page = 1;
      full();
    },
    'open-tx': (el) => openTransaction(el.dataset.value!),
    rules: () => openRules(),
  });

  function openTransaction(id: string) {
    const t = analytics().transactions.find((x) => x.id === id);
    if (!t) return;
    const uc = store.state.categorization;
    const subs = Array.from(new Set([...(DEFAULT_SUBCATEGORIES[t.category] ?? []), ...(uc.customSubcategories[t.category] ?? [])]));
    const m = openModal({
      title: 'Transação',
      body: html`
        <div class="row">${categoryIcon(t.category)}<div class="stack-sm" style="gap:2px;min-width:0"><strong>${t.description}</strong><span class="muted" style="font-size:13px">${formatDate(t.date)} · ${t.institution} · ${sourceName(t)}</span></div></div>
        <div class="figure"><div class="figure__value ${t.amount < 0 ? 'neg' : 'pos'}"><span class="money">${formatSignedMoney(t.amount, t.currency)}</span></div></div>
        <div class="kv-list">
          <div class="kv"><span>Tipo</span><strong>${TRANSACTION_KIND_LABEL[t.kind]}</strong></div>
          <div class="kv"><span>Situação</span><strong>${t.status === 'pending' ? 'Pendente/futura' : 'Lançada'}</strong></div>
          ${t.installment ? html`<div class="kv"><span>Parcela</span><strong>${t.installment.number} de ${t.installment.total}</strong></div>` : ''}
          ${t.providerCategory ? html`<div class="kv"><span>Categoria da Pluggy</span><strong>${t.providerCategory}</strong></div>` : ''}
          ${t.merchant ? html`<div class="kv"><span>Estabelecimento</span><strong>${t.merchant}</strong></div>` : ''}
          ${t.paymentMethod ? html`<div class="kv"><span>Meio de pagamento</span><strong>${t.paymentMethod}</strong></div>` : ''}
        </div>
        <div class="divider"></div>
        <form class="stack" data-cat-form>
          <label class="field"><span class="field__label">Categoria</span>
            <select class="select" name="category">${APP_CATEGORIES.map((c) => html`<option value="${c.id}" ${c.id === t.category ? 'selected' : ''}>${c.label}</option>`)}</select></label>
          <label class="field"><span class="field__label">Subcategoria</span>
            <input class="input" name="subcategory" list="subcat-list" value="${t.subcategory ?? ''}" maxlength="40" placeholder="Opcional" autocomplete="off" />
            <datalist id="subcat-list">${subs.map((x) => html`<option value="${x}"></option>`)}</datalist>
            <span class="field__hint">Digite um nome novo para criar uma subcategoria.</span></label>
          <label class="switch"><input type="checkbox" name="ignored" ${t.ignored ? 'checked' : ''} /><span class="switch__track"></span><span>Ignorar nos cálculos (receitas, despesas e fluxo)</span></label>
          <label class="check"><input type="checkbox" name="rule" /> Aplicar também a futuras transações com descrição semelhante (“${recurrenceKey(t.description) || t.description}”)</label>
        </form>`,
      footer: html`${t.userCategorized || uc.overrides[t.id] ? html`<button type="button" class="btn btn--ghost" data-reset>Desfazer ajustes</button>` : ''}
        <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
        <button type="button" class="btn btn--primary" data-save>${icon('check')}Salvar</button>`,
    });
    m.el.querySelector('[data-reset]')?.addEventListener('click', async () => {
      await actions.setTransactionOverride(t.id, null);
      m.close();
    });
    m.el.querySelector('[data-save]')!.addEventListener('click', async () => {
      const f = new FormData(m.el.querySelector<HTMLFormElement>('[data-cat-form]')!);
      const category = f.get('category') as AppCategoryId;
      const sub = String(f.get('subcategory') ?? '').trim() || null;
      const ignored = f.get('ignored') === 'on';
      if (sub) await actions.addCustomSubcategory(category, sub);
      await actions.setTransactionOverride(t.id, { category, subcategory: sub, ignored });
      if (f.get('rule') === 'on') {
        const key = recurrenceKey(t.description) || t.description.slice(0, 30);
        await actions.addCategoryRule({ contains: key, category, subcategory: sub });
      }
      m.close();
    });
  }

  function openRules() {
    const rules = store.state.categorization.rules;
    const m = openModal({
      title: 'Regras de categorização',
      wide: true,
      body: html`<p class="muted">Regras locais: transações cuja descrição contém o texto recebem a categoria escolhida. Ajustes individuais têm prioridade.</p>
        ${rules.length
          ? html`<div class="list">${rules.map(
              (r) => html`<div class="list-item">${categoryIcon(r.category)}<span class="list-item__main"><span class="list-item__title">“${r.contains}”</span><span class="list-item__sub">${categoryLabel(r.category)}${r.subcategory ? ` · ${r.subcategory}` : ''}</span></span>
                <button type="button" class="icon-btn icon-btn--sm" data-remove-rule="${r.id}" aria-label="Remover regra ${r.contains}">${icon('trash')}</button></div>`,
            )}</div>`
          : stateBlock({ kind: 'empty', title: 'Nenhuma regra ainda', text: 'Crie regras ao editar uma transação.', compact: true })}
        <form class="filters" data-rule-form style="align-items:end">
          <label class="field"><span class="field__label">Descrição contém</span><input class="input input--sm" name="contains" required maxlength="60" /></label>
          <label class="field"><span class="field__label">Categoria</span><select class="select select--sm" name="category">${APP_CATEGORIES.map((c) => html`<option value="${c.id}">${c.label}</option>`)}</select></label>
          <label class="field"><span class="field__label">Subcategoria</span><input class="input input--sm" name="subcategory" maxlength="40" /></label>
          <button type="submit" class="btn btn--secondary btn--sm">${icon('plus')}Adicionar regra</button>
        </form>`,
    });
    m.el.querySelectorAll<HTMLElement>('[data-remove-rule]').forEach((b) =>
      b.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Remover regra?', message: 'As transações voltam à categoria original (ajustes individuais são mantidos).', confirmLabel: 'Remover', danger: true });
        if (!ok) return;
        await actions.removeCategoryRule(b.dataset.removeRule!);
        m.close();
        openRules();
      }),
    );
    m.el.querySelector<HTMLFormElement>('[data-rule-form]')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target as HTMLFormElement);
      const contains = String(f.get('contains') ?? '').trim();
      if (!contains) return;
      await actions.addCategoryRule({ contains, category: f.get('category') as AppCategoryId, subcategory: String(f.get('subcategory') ?? '').trim() || null });
      m.close();
      openRules();
    });
  }

  const unsub = onDataChange((s, prev) => {
    if (s.categorization !== prev.categorization && s.dataset === prev.dataset) {
      paintResults();
      const btn = root.querySelector('[data-action="rules"]');
      if (btn) btn.lastChild!.textContent = `Regras de categorização${s.categorization.rules.length ? ` (${s.categorization.rules.length})` : ''}`;
    } else full();
  });
  full();
  return () => {
    off();
    unsub();
    debouncedSearch.cancel();
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('keydown', onKey);
  };
}
