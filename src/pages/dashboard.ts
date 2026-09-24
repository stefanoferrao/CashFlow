/**
 * Dashboard — centro da experiência. Cards modulares (GridStack no desktop; fluxo em coluna no tablet/mobile).
 * Personalizar: mover, redimensionar, ocultar/mostrar, fixar e restaurar o padrão. Layout salvo localmente.
 */
import type { GridStack } from 'gridstack';
import { barChart, lineChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { badge, delta, figureValue, kv, meter, money, na, utilizationBadge, infoTip, stateBlock } from '../components/ui';
import type { InvestmentClass } from '../models/finance';
import type { PageContext } from '../router';
import type { Analytics } from '../services/analytics';
import { calculateCashFlow, calculateProjectedBalance, buildProjectionEvents, lastMonths } from '../services/financialCalculator';
import { store } from '../state/store';
import { clearLayout, loadLayout, saveLayout, type DashboardLayout, type WidgetLayout } from '../storage/preferences';
import { addDays, diffDays, monthEnd } from '../utils/dates';
import { formatDate, formatMoney, formatMonthKeyShort, formatPercent, formatShortDate } from '../utils/format';
import { CLASS_COLOR, analytics, canvasFor, chartFrame, commonHandlers, hasAnyData, instLabel, noDataState, onDataChange, openAddInstitution, tableToggle } from './shared';

const LAYOUT_VERSION = 3;
const GRID_MIN_WIDTH = 1100;

interface WidgetDef {
  id: string;
  title: string;
  icon: string;
  layout: { x: number; y: number; w: number; h: number; minW: number; minH: number };
  /** Ocupa duas colunas no layout em fluxo (tablet). */
  wide?: boolean;
  visibleByDefault: boolean;
  render(a: Analytics): SafeHtml;
  after?(el: HTMLElement, a: Analytics): void;
}

// ------------------------------------------------------------------ widgets

const CLASS_ORDER: InvestmentClass[] = ['renda_fixa', 'fundos', 'acoes', 'etfs', 'previdencia', 'outros'];

function sparkline(values: number[]): SafeHtml {
  if (values.length < 2) return html``;
  const w = 240;
  const h = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1]!;
  return html`<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="var(--series-3)" opacity="0.1"></path>
    <path d="${d}" fill="none" stroke="var(--series-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--series-3)" stroke="var(--surface)" stroke-width="2"></circle>
  </svg>`;
}

const cardHead = (title: string, iconName: string, extra?: SafeHtml) =>
  html`<div class="card__head"><div class="card__title">${icon(iconName)}${title}</div>${extra ?? ''}</div>`;

const WIDGETS: WidgetDef[] = [
  {
    id: 'patrimonio',
    title: 'Patrimônio',
    icon: 'pie',
    layout: { x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    visibleByDefault: true,
    render: (a) => {
      const nw = a.netWorth;
      const g = a.netWorthGrowth30;
      const snaps = store.state.dataset.snapshots.slice(-26).map((s) => s.netWorth);
      return html`${cardHead('Patrimônio líquido', 'pie', infoTip('Contas (saldo positivo) + investimentos − dívidas de cartão e cheque especial. Limite de cartão não é patrimônio.'))}
        <div class="figure">
          ${figureValue(nw.netWorth, 'hero')}
          <div class="figure__meta">
            ${g ? html`${delta(g.pct)}<span>${g.change >= 0 ? '+' : '−'}${formatMoney(Math.abs(g.change))} desde ${formatShortDate(g.from)}</span>` : html`<span>Histórico em construção — o app registra um ponto por dia sincronizado.</span>`}
          </div>
        </div>
        ${sparkline(snaps)}
        <div class="kv-list">
          ${kv('Ativos (contas + investimentos)', money(nw.assets))}
          ${kv('Dívidas (cartões e cheque especial)', money(nw.liabilities))}
        </div>
        ${nw.excludedCurrencies.length ? html`<p class="field__hint">Contas em ${nw.excludedCurrencies.join(', ')} não entram no total (sem conversão de câmbio).</p>` : ''}`;
    },
  },
  {
    id: 'saldo',
    title: 'Saldo em contas',
    icon: 'wallet',
    layout: { x: 4, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    visibleByDefault: true,
    render: (a) => {
      const accounts = store.state.dataset.accounts;
      const byInst = new Map<string, number>();
      const itemOfInst = new Map<string, string>();
      for (const acc of accounts) {
        if (acc.currency !== 'BRL') continue;
        byInst.set(acc.institution, (byInst.get(acc.institution) ?? 0) + acc.balance);
        if (!itemOfInst.has(acc.institution)) itemOfInst.set(acc.institution, acc.itemId);
      }
      const others = Object.entries(a.totalBalance.others);
      return html`${cardHead('Saldo em contas', 'wallet', infoTip('Somente contas bancárias. Não inclui investimentos, limite de cartão nem valor de fatura.'))}
        <div class="figure">${figureValue(a.totalBalance.base)}<div class="figure__meta">${accounts.length} ${accounts.length === 1 ? 'conta' : 'contas'} bancárias</div></div>
        <div class="kv-list">
          ${[...byInst.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([name, v]) => kv(instLabel(itemOfInst.get(name) ?? '', name), money(v)))}
          ${others.map(([cur, v]) => kv(`Em ${cur} (não somado)`, money(v, { currency: cur })))}
        </div>
        ${accounts.length ? '' : na('Nenhuma conta bancária encontrada')}
        <div class="card__foot"><a href="#/contas">Ver contas</a>${icon('chevronRight')}</div>`;
    },
  },
  {
    id: 'investimentos',
    title: 'Investimentos',
    icon: 'trending',
    layout: { x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    visibleByDefault: true,
    render: (a) => {
      const b = a.investmentBreakdown;
      const r = a.investmentReturn;
      return html`${cardHead('Investimentos', 'trending', infoTip('Valor líquido informado pela instituição, separado do saldo em contas.'))}
        <div class="figure">${figureValue(a.totalInvestments.base)}
          <div class="figure__meta">${r ? html`${delta(r.rate)}<span>rentabilidade informada${r.coverage < 1 ? ` (${formatPercent(r.coverage)} da carteira)` : ''}</span>` : html`<span>Rentabilidade não informada pela instituição</span>`}</div>
        </div>
        ${b.length
          ? html`<div class="dist-list dist-list--compact">${CLASS_ORDER.map((k) => b.find((x) => x.key === k))
              .filter((x): x is NonNullable<typeof x> => !!x)
              .map(
                (x) => html`<div class="dist-row">
                  <span class="dist-row__label"><span class="swatch" style="background:var(--series-${CLASS_COLOR[x.key]})"></span>${x.label}</span>
                  <span class="dist-row__value">${money(x.value)} <span class="muted">${formatPercent(x.share)}</span></span>
                </div>`,
              )}</div>`
          : na('Nenhum investimento informado')}`;
    },
  },
  {
    id: 'fluxo',
    title: 'Fluxo de caixa',
    icon: 'flow',
    layout: { x: 0, y: 5, w: 7, h: 6, minW: 5, minH: 4 },
    wide: true,
    visibleByDefault: true,
    render: (a) => {
      const months = lastMonths(a.today, 6);
      const cf = calculateCashFlow(a.transactions, { granularity: 'month', start: `${months[0]}-01`, end: a.today });
      return html`${cardHead('Receitas × despesas', 'flow', tableToggle('dash-flow'))}
        <div class="chart-legend">
          <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-1)"></span>Entradas</span>
          <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-2)"></span>Saídas</span>
          <span class="chart-legend__item"><span class="chart-legend__key is-line" style="--key:var(--series-3)"></span>Saldo líquido</span>
          <span class="chart-legend__note">Últimos 6 meses · sem transferências próprias, faturas e aplicações</span>
        </div>
        ${chartFrame('dash-flow', 220, 'Gráfico de receitas e despesas dos últimos 6 meses', {
          caption: 'Receitas e despesas por mês',
          headers: ['Mês', 'Entradas', 'Saídas', 'Saldo'],
          rows: cf.map((b) => [formatMonthKeyShort(b.start.slice(0, 7)), money(b.income), money(b.expenses), money(b.net, { signed: true, tone: true })]),
        })}`;
    },
    after: (el, a) => {
      const months = lastMonths(a.today, 6);
      const cf = calculateCashFlow(a.transactions, { granularity: 'month', start: `${months[0]}-01`, end: a.today });
      const canvas = canvasFor(el, 'dash-flow');
      if (!canvas) return;
      void mountChart(
        canvas,
        barChart(
          cf.map((b) => formatMonthKeyShort(b.start.slice(0, 7))),
          [
            { label: 'Entradas', data: cf.map((b) => b.income), colorIndex: 1 },
            { label: 'Saídas', data: cf.map((b) => b.expenses), colorIndex: 2 },
            { label: 'Saldo líquido', data: cf.map((b) => b.net), colorIndex: 3, asLine: true },
          ],
        ),
      );
    },
  },
  {
    id: 'distribuicao',
    title: 'Para onde está indo meu dinheiro?',
    icon: 'grid',
    layout: { x: 7, y: 5, w: 5, h: 6, minW: 4, minH: 5 },
    wide: false,
    visibleByDefault: true,
    render: (a) => {
      const al = a.allocation;
      const nw = a.netWorth;
      if (!al.slices.length) return html`${cardHead('Para onde está indo meu dinheiro?', 'grid')}${na('Sem saldos ou investimentos para distribuir')}`;
      return html`${cardHead('Para onde está indo meu dinheiro?', 'grid', infoTip('Cada recurso aparece uma única vez: contas (saldo positivo) e investimentos por classe. Cartões são compromissos, não patrimônio.'))}
        <div class="row-between wrap"><span class="muted">Total de ativos</span><strong class="figure__value--sm">${money(al.total)}</strong></div>
        <div class="dist-stack" role="img" aria-label="Distribuição dos ativos">
          ${al.slices.map((s) => html`<span style="flex-grow:${s.value};background:var(--series-${CLASS_COLOR[s.key]})" title="${s.label}: ${formatPercent(s.share)}"></span>`)}
        </div>
        <div class="dist-list">
          ${al.slices.map(
            (s) => html`<div class="dist-row">
              <span class="dist-row__label"><span class="swatch" style="background:var(--series-${CLASS_COLOR[s.key]})"></span>${s.group === 'contas' ? 'Contas' : `Investimentos · ${s.label}`}</span>
              <span class="dist-row__value">${money(s.value)} <span class="muted">${formatPercent(s.share)}</span></span>
              <div class="dist-row__bar"><span style="width:${(s.share * 100).toFixed(1)}%;background:var(--series-${CLASS_COLOR[s.key]})"></span></div>
            </div>`,
          )}
        </div>
        <div class="card__foot">
          <span>Compromissos em cartões</span><strong class="neg">${money(nw.cardDebt)}</strong>
        </div>`;
    },
  },
  {
    id: 'fatura',
    title: 'Fatura atual',
    icon: 'receipt',
    layout: { x: 0, y: 11, w: 6, h: 4, minW: 4, minH: 3 },
    visibleByDefault: true,
    render: (a) => {
      const next = [...a.bills].sort((x, y) => x.cycle.due.localeCompare(y.cycle.due))[0];
      if (!next) {
        const hasCards = store.state.dataset.cards.length > 0;
        return html`${cardHead('Fatura atual', 'receipt')}${na(hasCards ? 'Datas de fechamento não informadas pela instituição' : 'Nenhum cartão de crédito conectado')}
          ${hasCards ? html`<div class="card__foot"><a href="#/configuracoes?secao=cartoes">Definir fechamento e vencimento</a>${icon('chevronRight')}</div>` : ''}`;
      }
      const p = a.billProjections[next.card.id]!;
      const days = diffDays(a.today, next.cycle.due);
      return html`${cardHead(`Fatura atual · ${next.card.label ?? next.card.name}`, 'receipt', next.cycle.estimated ? badge('Datas estimadas', 'warn', 'info') : badge(days <= 0 ? 'Vence hoje' : `Vence em ${days} d`, days <= 5 ? 'warn' : 'neutral', 'calendar'))}
        <div class="split">
          <div class="figure">
            <span class="figure__label">Valor acumulado</span>
            ${figureValue(next.total, 'display')}
            <div class="figure__meta"><span>Previsão de fechamento</span><strong class="money">${formatMoney(p.paceForecast)}</strong></div>
          </div>
          <div class="kv-list">
            ${kv('Fechamento', formatDate(next.cycle.closing))}
            ${kv('Vencimento', formatDate(next.cycle.due))}
            ${kv('Lançamentos futuros', money(next.future))}
          </div>
        </div>
        ${a.bills.length > 1 ? html`<p class="field__hint">Total em faturas abertas (${a.bills.length} cartões): <strong class="money">${formatMoney(a.openBillsTotal)}</strong></p>` : ''}
        <div class="card__foot"><a href="#/faturas">Previsão detalhada</a>${icon('chevronRight')}</div>`;
    },
  },
  {
    id: 'cartoes',
    title: 'Cartões',
    icon: 'card',
    layout: { x: 6, y: 11, w: 6, h: 4, minW: 4, minH: 3 },
    visibleByDefault: true,
    render: (a) => {
      const c = a.credit;
      const cards = store.state.dataset.cards;
      if (!cards.length) return html`${cardHead('Cartões', 'card')}${na('Nenhum cartão de crédito conectado')}`;
      return html`${cardHead('Limites dos cartões', 'card', utilizationBadge(c.utilization))}
        <div class="split">
          <div class="figure"><span class="figure__label">Limite disponível</span>${figureValue(c.available, 'display')}</div>
          <div class="kv-list">
            ${kv('Limite total', money(c.limit))}
            ${kv('Limite utilizado', money(c.used))}
            ${kv('Percentual utilizado', formatPercent(c.utilization))}
          </div>
        </div>
        ${meter(c.utilization, 'Utilização do limite total', true)}
        ${c.cardsWithoutData ? html`<p class="field__hint">${c.cardsWithoutData} cartão(ões) sem limite informado pela instituição.</p>` : ''}
        <div class="card__foot"><a href="#/cartoes">Ver cartões</a>${icon('chevronRight')}</div>`;
    },
  },
  {
    id: 'receitas',
    title: 'Receitas',
    icon: 'arrowDown',
    layout: { x: 0, y: 15, w: 4, h: 4, minW: 3, minH: 3 },
    visibleByDefault: true,
    render: (a) => {
      const o = a.outlook;
      return html`${cardHead('Receitas do mês', 'arrowDown')}
        <div class="figure">${figureValue(o.realizedIncome, 'display')}<div class="figure__meta">recebidas até ${formatShortDate(a.today)}</div></div>
        <div class="kv-list">
          ${kv(html`Previstas até ${formatShortDate(monthEnd(a.today))} ${o.expectedIncome > 0 ? badge('estimativa', 'outline') : ''}`, money(o.expectedIncome))}
          ${kv('Total esperado no mês', money(o.realizedIncome + o.expectedIncome))}
          ${kv('Mesmo período do mês anterior', money(a.previousMonthToDate.income))}
        </div>`;
    },
  },
  {
    id: 'despesas',
    title: 'Despesas',
    icon: 'arrowUp',
    layout: { x: 4, y: 15, w: 4, h: 4, minW: 3, minH: 3 },
    visibleByDefault: true,
    render: (a) => {
      const o = a.outlook;
      const prev = a.previousMonthToDate.expenses;
      const change = prev > 0 ? (o.realizedExpenses - prev) / prev : null;
      return html`${cardHead('Despesas do mês', 'arrowUp')}
        <div class="figure">${figureValue(o.realizedExpenses, 'display')}<div class="figure__meta">${change !== null ? html`${delta(change, { upIsGood: false })}<span>vs. mesmo período do mês anterior</span>` : html`<span>realizadas até ${formatShortDate(a.today)}</span>`}</div></div>
        <div class="kv-list">
          ${kv(html`Previstas até ${formatShortDate(monthEnd(a.today))} ${o.expectedExpenses > 0 ? badge('estimativa', 'outline') : ''}`, money(o.expectedExpenses))}
          ${kv('Total esperado no mês', money(o.realizedExpenses + o.expectedExpenses))}
          ${kv('Gasto médio por dia', money(a.averageDailyExpense))}
        </div>`;
    },
  },
  {
    id: 'proximos',
    title: 'Próximos gastos',
    icon: 'calendar',
    layout: { x: 8, y: 15, w: 4, h: 4, minW: 3, minH: 3 },
    visibleByDefault: true,
    render: (a) => {
      const list = a.upcoming.slice(0, 4);
      return html`${cardHead('Próximos gastos · 30 dias', 'calendar')}
        ${list.length
          ? html`<ul class="mini-list">
              ${list.map(
                (e) => html`<li>
                  <span class="mini-list__date">${formatShortDate(e.date)}</span>
                  <span class="mini-list__label truncate" title="${e.label}">${e.label}${e.certainty === 'estimated' ? html` <span class="badge badge--outline">estimativa</span>` : ''}</span>
                  <span class="mini-list__value">${money(e.amount)}</span>
                </li>`,
              )}
            </ul>`
          : na('Nenhuma despesa futura conhecida')}
        <div class="card__foot"><a href="#/fluxo">Ver projeção</a>${icon('chevronRight')}</div>`;
    },
  },
  {
    id: 'projecao',
    title: 'Saldo projetado',
    icon: 'target',
    layout: { x: 0, y: 19, w: 8, h: 5, minW: 5, minH: 4 },
    wide: true,
    visibleByDefault: false,
    render: (a) => {
      const proj = projection(a);
      return html`${cardHead('Saldo projetado · 30 dias', 'target', tableToggle('dash-proj'))}
        <div class="row-between wrap">
          <div class="figure"><span class="figure__label">Estimado em ${formatDate(addDays(a.today, 30))}</span>${figureValue(proj.end, 'md')}</div>
          <div class="figure"><span class="figure__label">Menor saldo no período</span><div class="figure__value figure__value--sm ${proj.min < 0 ? 'neg' : ''}"><span class="money">${formatMoney(proj.min)}</span></div></div>
        </div>
        ${chartFrame('dash-proj', 150, 'Projeção do saldo em contas para os próximos 30 dias', {
          caption: 'Saldo projetado',
          headers: ['Data', 'Saldo'],
          rows: proj.series.filter((_, i) => i % 5 === 0).map((p) => [formatDate(p.date), money(p.balance)]),
        })}`;
    },
    after: (el, a) => {
      const proj = projection(a);
      const canvas = canvasFor(el, 'dash-proj');
      if (canvas) void mountChart(canvas, lineChart(proj.series.map((p) => formatShortDate(p.date)), [{ label: 'Saldo projetado', data: proj.series.map((p) => p.balance), colorIndex: 3, fill: true }], { maxTicksX: 6, zeroLine: true }));
    },
  },
  {
    id: 'insights',
    title: 'Insights',
    icon: 'bulb',
    layout: { x: 8, y: 19, w: 4, h: 5, minW: 3, minH: 4 },
    visibleByDefault: false,
    render: (a) =>
      html`${cardHead('Insights', 'bulb')}
        ${a.insights.length
          ? html`<ul class="insight-list">${a.insights.slice(0, 3).map((i) => html`<li class="insight insight--${i.tone}">${icon(i.icon)}<span>${i.text}</span></li>`)}</ul>`
          : na('Ainda não há dados suficientes')}
        <div class="card__foot"><a href="#/analises">Ver análises</a>${icon('chevronRight')}</div>`,
  },
];

function projection(a: Analytics) {
  const events = buildProjectionEvents({
    today: a.today,
    days: 30,
    transactions: a.transactions,
    billSummaries: a.bills,
    bills: store.state.dataset.bills,
    recurrences: a.recurrences,
    planned: store.state.planned,
    includeEstimates: store.state.preferences.includeEstimates,
  });
  return calculateProjectedBalance(a.totalBalance.base, a.today, 30, events);
}

const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function defaultLayout(): DashboardLayout {
  return {
    version: LAYOUT_VERSION,
    widgets: WIDGETS.map((w) => ({ id: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, visible: w.visibleByDefault, pinned: false })),
    mobileOrder: WIDGETS.map((w) => w.id),
  };
}

function normalizeLayout(saved: DashboardLayout | null): DashboardLayout {
  const def = defaultLayout();
  if (!saved || saved.version !== LAYOUT_VERSION) return def;
  const byId = new Map(saved.widgets.map((w) => [w.id, w]));
  const widgets = def.widgets.map((d) => ({ ...d, ...(byId.get(d.id) ?? {}) }));
  const order = (saved.mobileOrder ?? []).filter((id) => WIDGET_BY_ID.has(id));
  for (const w of WIDGETS) if (!order.includes(w.id)) order.push(w.id);
  return { version: LAYOUT_VERSION, widgets, mobileOrder: order };
}

// ------------------------------------------------------------------ página

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;
  let layout: DashboardLayout = defaultLayout();
  let editing = false;
  let grid: GridStack | null = null;
  let disposed = false;
  const mq = matchMedia(`(min-width: ${GRID_MIN_WIDTH}px)`);

  const useGrid = () => mq.matches;

  const widgetContent = (def: WidgetDef, a: Analytics) => html`<div class="card card--fill dash-card" data-widget="${def.id}">${def.render(a)}</div>`;

  const renderPage = async () => {
    if (disposed) return;
    grid?.destroy(false);
    grid = null;
    const s = store.state;
    const a = analytics();

    if (s.mode === 'real' && !hasAnyData(s)) {
      render(root, html`<div class="page"><div class="card">${noDataState(s)}</div></div>`);
      return;
    }

    const visible = layout.widgets.filter((w) => w.visible && WIDGET_BY_ID.has(w.id));
    const head = html`<div class="page-head">
      <p class="page-head__intro">Visão consolidada de contas, cartões e investimentos${s.dataset.fetchedAt ? html` · dados de ${formatDate(s.dataset.fetchedAt.slice(0, 10))}` : ''}.</p>
      <div class="row wrap">
        ${s.mode === 'real' ? html`<button type="button" class="btn btn--secondary btn--sm" data-action="add-institution">${icon('plus')}Adicionar instituição</button>` : ''}
        <button type="button" class="btn ${editing ? 'btn--primary' : 'btn--secondary'} btn--sm" data-action="customize" aria-pressed="${editing}">${icon(editing ? 'check' : 'layout')}${editing ? 'Concluir' : 'Personalizar'}</button>
      </div>
    </div>`;

    const panel = editing
      ? html`<section class="card customize-panel" aria-label="Personalizar dashboard">
          <div class="row-between wrap">
            <div class="stack-sm">
              <strong>Personalizar dashboard</strong>
              <span class="muted">${useGrid() ? 'Arraste os cards pela borda superior e redimensione pelo canto. Cards fixados não se movem.' : 'Mostre, oculte e reordene os cards.'}</span>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" data-action="reset-layout">${icon('refresh')}Restaurar padrão</button>
          </div>
          <ul class="customize-list">
            ${(useGrid() ? layout.widgets.map((w) => w.id) : layout.mobileOrder ?? []).map((id, idx, arr) => {
              const w = layout.widgets.find((x) => x.id === id)!;
              const def = WIDGET_BY_ID.get(id)!;
              return html`<li class="customize-item">
                <label class="check"><input type="checkbox" data-action="toggle-widget" data-value="${id}" ${w.visible ? 'checked' : ''} />${def.title}</label>
                <span class="row">
                  ${useGrid()
                    ? html`<button type="button" class="icon-btn icon-btn--sm" data-action="pin-widget" data-value="${id}" aria-pressed="${w.pinned}" aria-label="${w.pinned ? 'Desafixar' : 'Fixar'} ${def.title}" data-tip="${w.pinned ? 'Desafixar' : 'Fixar posição'}" ${w.visible ? '' : 'disabled'}>${icon('pin')}</button>`
                    : html`<button type="button" class="icon-btn icon-btn--sm" data-action="move-up" data-value="${id}" aria-label="Mover ${def.title} para cima" ${idx === 0 ? 'disabled' : ''}>${icon('chevronUp')}</button>
                        <button type="button" class="icon-btn icon-btn--sm" data-action="move-down" data-value="${id}" aria-label="Mover ${def.title} para baixo" ${idx === arr.length - 1 ? 'disabled' : ''}>${icon('chevronDown')}</button>`}
                </span>
              </li>`;
            })}
          </ul>
        </section>`
      : '';

    let body: SafeHtml;
    if (useGrid()) {
      body = html`<div class="grid-stack dash-grid ${editing ? 'is-editing' : ''}">
        ${visible.map((w) => {
          const def = WIDGET_BY_ID.get(w.id)!;
          return html`<div class="grid-stack-item ${w.pinned ? 'is-pinned' : ''}" gs-id="${w.id}" gs-x="${w.x}" gs-y="${w.y}" gs-w="${w.w}" gs-h="${w.h}" gs-min-w="${def.layout.minW}" gs-min-h="${def.layout.minH}" ${w.pinned ? html`gs-locked="true" gs-no-move="true" gs-no-resize="true"` : ''}>
            <div class="grid-stack-item-content">${widgetContent(def, a)}</div>
          </div>`;
        })}
      </div>`;
    } else {
      const order = (layout.mobileOrder ?? []).filter((id) => visible.some((v) => v.id === id));
      body = html`<div class="dash-flow">${order.map((id) => {
        const def = WIDGET_BY_ID.get(id)!;
        return html`<div class="dash-flow__item ${def.wide ? 'is-wide' : ''}">${widgetContent(def, a)}</div>`;
      })}</div>`;
    }

    render(root, html`<div class="page">${head}${panel}${visible.length ? body : html`<div class="card">${stateBlock({ kind: 'empty', title: 'Todos os cards estão ocultos', text: 'Use "Personalizar" para mostrar os cards.', compact: true })}</div>`}</div>`);
    animateNumbers(root, (n) => formatMoney(n));

    for (const w of visible) {
      const def = WIDGET_BY_ID.get(w.id)!;
      const el = root.querySelector<HTMLElement>(`[data-widget="${w.id}"]`);
      if (el && def.after) def.after(el, a);
    }

    if (useGrid()) {
      const { GridStack } = await import('gridstack');
      if (disposed) return;
      const gridEl = root.querySelector<HTMLElement>('.grid-stack');
      if (!gridEl) return;
      const g = GridStack.init(
        {
          column: 12,
          cellHeight: 76,
          margin: 8,
          float: false,
          animate: true,
          staticGrid: !editing,
          handle: '.card__head',
          resizable: { handles: 'se' },
        },
        gridEl,
      );
      if (!g) return;
      grid = g;
      g.on('change', () => {
        const saved = g.save(false) as Array<{ id?: string; x?: number; y?: number; w?: number; h?: number }>;
        layout = {
          ...layout,
          widgets: layout.widgets.map((w) => {
            const n = saved.find((s2) => s2.id === w.id);
            return n ? { ...w, x: n.x ?? w.x, y: n.y ?? w.y, w: n.w ?? w.w, h: n.h ?? w.h } : w;
          }),
        };
        void saveLayout(layout);
      });
      g.on('resizestop', () => {
        // Gráficos se ajustam ao novo tamanho do card.
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      });
    }
  };

  const persist = async () => {
    await saveLayout(layout);
    await renderPage();
  };

  const updateWidget = (id: string, patch: Partial<WidgetLayout>) => {
    layout = { ...layout, widgets: layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) };
  };

  const off = delegate(root, 'click', {
    ...commonHandlers,
    'add-institution': () => openAddInstitution(),
    customize: () => {
      editing = !editing;
      void renderPage();
    },
    'reset-layout': async () => {
      layout = defaultLayout();
      await clearLayout();
      await renderPage();
    },
    'pin-widget': (el) => {
      const id = el.dataset.value!;
      const w = layout.widgets.find((x) => x.id === id);
      if (w) {
        updateWidget(id, { pinned: !w.pinned });
        void persist();
      }
    },
    'move-up': (el) => moveMobile(el.dataset.value!, -1),
    'move-down': (el) => moveMobile(el.dataset.value!, 1),
  });
  const offChange = delegate(root, 'change', {
    'toggle-widget': (el) => {
      const id = el.dataset.value!;
      const input = el as HTMLInputElement;
      const w = layout.widgets.find((x) => x.id === id);
      if (!w) return;
      // Ao voltar a exibir, posiciona no fim do grid (o GridStack compacta).
      updateWidget(id, input.checked ? { visible: true, y: 1000 } : { visible: false });
      void persist();
    },
  });

  function moveMobile(id: string, dir: -1 | 1) {
    const order = [...(layout.mobileOrder ?? [])];
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    layout = { ...layout, mobileOrder: order };
    void persist().then(() => root.querySelector<HTMLElement>(`[data-action="${dir < 0 ? 'move-up' : 'move-down'}"][data-value="${id}"]`)?.focus());
  }

  const onMq = () => void renderPage();
  mq.addEventListener('change', onMq);
  const unsub = onDataChange(() => void renderPage());

  void (async () => {
    layout = normalizeLayout(await loadLayout());
    await renderPage();
  })();

  return () => {
    disposed = true;
    off();
    offChange();
    unsub();
    mq.removeEventListener('change', onMq);
    grid?.destroy(false);
    grid = null;
  };
}

/** Exposto para testes. */
export const DASHBOARD_WIDGETS = WIDGETS.map((w) => ({ id: w.id, title: w.title }));
