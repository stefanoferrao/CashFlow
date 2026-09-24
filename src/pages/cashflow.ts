/**
 * Fluxo de Caixa — entradas, saídas, saldo líquido e taxa de poupança por período (mês, trimestre, ano, todo o período);
 * gastos por categoria; saldo projetado (7/15/30/60/90 dias) e lançamentos previstos manuais.
 */
import { barChart, lineChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render } from '../components/dom';
import { icon } from '../components/icons';
import { badge, categoryIcon, categoryLabel, figureValue, infoTip, money, na, segmented } from '../components/ui';
import type { NormalizedTransaction } from '../models/finance';
import type { PageContext } from '../router';
import {
  buildProjectionEvents,
  calculateCashFlow,
  calculateCategoryBreakdown,
  calculatePeriodTotals,
  calculateProjectedBalance,
  calculateSavingsRate,
  resolveCashFlowPeriod,
  type CashFlowPeriod,
  type CashFlowPeriodKind,
  type Granularity,
} from '../services/financialCalculator';
import * as actions from '../state/actions';
import { store } from '../state/store';
import { addDays, todayKey, type DateKey } from '../utils/dates';
import { formatDate, formatMoney, formatMonthKey, formatMonthKeyShort, formatPercent, formatShortDate } from '../utils/format';
import { analytics, canvasFor, chartFrame, commonHandlers, hasAnyData, noDataState, onDataChange, tableToggle } from './shared';

const GRAN_LABEL: Record<Granularity, string> = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' };
const PERIOD_LABEL: Record<CashFlowPeriodKind, string> = { month: 'Mês', quarter: 'Trimestre', year: 'Ano', all: 'Todo o período' };
const Q_MONTHS = ['jan–mar', 'abr–jun', 'jul–set', 'out–dez'];

function periodTitle(p: CashFlowPeriod): string {
  switch (p.kind) {
    case 'month':
      return formatMonthKey(p.start.slice(0, 7));
    case 'quarter':
      return `${p.quarter}º trimestre de ${p.year} (${Q_MONTHS[p.quarter - 1]})`;
    case 'year':
      return String(p.year);
    case 'all':
      return `Todo o período · ${formatMonthKeyShort(p.start.slice(0, 7))} a ${formatMonthKeyShort(p.end.slice(0, 7))}`;
  }
}

function bucketLabel(start: DateKey, g: Granularity): string {
  if (g === 'month') return formatMonthKeyShort(start.slice(0, 7));
  if (g === 'year') return start.slice(0, 4);
  return formatShortDate(start);
}

/** Data do lançamento mais antigo que entra no fluxo (limite do histórico disponível). */
function firstFlowDate(txs: NormalizedTransaction[]): DateKey | null {
  let min: DateKey | null = null;
  for (const t of txs) if (t.status === 'posted' && (t.kind === 'income' || t.kind === 'expense') && (!min || t.date < min)) min = t.date;
  return min;
}

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;
  let kind: CashFlowPeriodKind = 'month';
  let offset = 0;
  let horizon = 30;

  const paint = () => {
    const s = store.state;
    if (s.mode === 'real' && !hasAnyData(s)) {
      render(root, html`<div class="page"><div class="card">${noDataState(s)}</div></div>`);
      return;
    }
    const a = analytics();
    const dataStart = firstFlowDate(a.transactions);
    const range = resolveCashFlowPeriod(kind, offset, a.today, dataStart);
    const gran = range.granularity;
    const title = periodTitle(range);
    const partialHistory = !!dataStart && range.start < dataStart && kind !== 'all';
    const cf = calculateCashFlow(a.transactions, { granularity: gran, start: range.start, end: range.end });
    // Por dia, a linha mostra o resultado ACUMULADO no período (mais legível que o saldo de cada dia).
    const lineLabel = gran === 'day' ? 'Resultado acumulado' : 'Saldo líquido';
    let acc = 0;
    const lineData = gran === 'day' ? cf.map((b) => (acc = Math.round((acc + b.net) * 100) / 100)) : cf.map((b) => b.net);
    const totals = calculatePeriodTotals(a.transactions, range.start, range.end, false);
    const rate = calculateSavingsRate(totals.income, totals.expenses);
    const cats = calculateCategoryBreakdown(a.transactions, range.start, range.end);
    const events = buildProjectionEvents({
      today: a.today,
      days: horizon,
      transactions: a.transactions,
      billSummaries: a.bills,
      bills: s.dataset.bills,
      recurrences: a.recurrences,
      planned: s.planned,
      includeEstimates: s.preferences.includeEstimates,
    });
    const proj = calculateProjectedBalance(a.totalBalance.base, a.today, horizon, events);

    render(
      root,
      html`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">Receitas e despesas em regime de competência: compras no cartão contam na data da compra; pagamento de fatura, transferências próprias e aplicações não entram.</p>
          ${segmented('period', (Object.keys(PERIOD_LABEL) as CashFlowPeriodKind[]).map((k) => ({ value: k, label: PERIOD_LABEL[k] })), kind, 'Período')}
        </div>

        <div class="period-nav" role="group" aria-label="Navegar entre períodos">
          ${kind !== 'all' ? html`<button type="button" class="icon-btn icon-btn--outline" data-action="period-prev" aria-label="${PERIOD_LABEL[kind]} anterior" data-tip="${PERIOD_LABEL[kind]} anterior" ${range.canPrev ? '' : 'disabled'}>${icon('chevronLeft')}</button>` : ''}
          <div class="period-nav__label">
            <strong>${title}</strong>
            <span class="muted">${formatDate(range.start)} a ${formatDate(range.end)}${range.ongoing && kind !== 'all' ? ' · em andamento' : ''} · agrupado por ${GRAN_LABEL[gran]}</span>
          </div>
          ${kind !== 'all' ? html`<button type="button" class="icon-btn icon-btn--outline" data-action="period-next" aria-label="Próximo ${PERIOD_LABEL[kind].toLowerCase()}" data-tip="Próximo ${PERIOD_LABEL[kind].toLowerCase()}" ${range.canNext ? '' : 'disabled'}>${icon('chevronRight')}</button>` : ''}
          ${offset !== 0 ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="period-today">Voltar ao atual</button>` : ''}
        </div>
        ${partialHistory ? html`<div class="callout callout--info">${icon('info')}<div>Os lançamentos disponíveis começam em ${formatDate(dataStart)} (a Pluggy fornece cerca de 12 meses de histórico). Antes disso, o período aparece sem movimento.</div></div>` : ''}

        <div class="kpi-grid">
          <div class="card"><div class="figure"><span class="figure__label">Entradas</span>${figureValue(totals.income, 'md')}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Saídas</span>${figureValue(totals.expenses, 'md')}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Saldo líquido</span><div class="figure__value figure__value--md ${totals.net < 0 ? 'neg' : ''}"><span class="money">${formatMoney(totals.net)}</span></div></div></div>
          <div class="card"><div class="figure"><span class="figure__label">Taxa de poupança ${infoTip('(Entradas − saídas) ÷ entradas no período.')}</span><div class="figure__value figure__value--md">${formatPercent(rate)}</div></div></div>
        </div>

        <section class="card">
          <div class="card__head"><div class="card__title card__title--lg">Entradas, saídas e saldo líquido · ${title}</div>${tableToggle('cf-main')}</div>
          <div class="chart-legend">
            <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-1)"></span>Entradas</span>
            <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-2)"></span>Saídas</span>
            <span class="chart-legend__item"><span class="chart-legend__key is-line" style="--key:var(--series-3)"></span>${lineLabel}</span>
          </div>
          ${chartFrame('cf-main', 300, `Entradas e saídas por ${GRAN_LABEL[gran]} — ${title}`, {
            caption: 'Fluxo de caixa',
            headers: ['Período', 'Entradas', 'Saídas', 'Saldo líquido', 'Taxa de poupança'],
            rows: cf.map((b) => [bucketLabel(b.start < range.start ? range.start : b.start, gran), money(b.income), money(b.expenses), money(b.net, { signed: true, tone: true }), formatPercent(calculateSavingsRate(b.income, b.expenses))]),
          })}
        </section>

        <section class="card">
          <div class="card__head"><div class="card__title card__title--lg">Gastos por categoria · ${title}</div>${cats.length ? tableToggle('cf-cats') : ''}</div>
          ${cats.length
            ? chartFrame('cf-cats', Math.max(160, cats.length * 38), 'Gastos por categoria', {
                caption: 'Gastos por categoria',
                headers: ['Categoria', 'Total', 'Participação', 'Transações'],
                rows: cats.map((c) => [html`<span class="row">${categoryIcon(c.category)}${categoryLabel(c.category)}</span>`, money(c.total), formatPercent(c.share), String(c.count)]),
              })
            : na('Sem despesas no período')}
        </section>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm">
              <div class="card__title card__title--lg">Saldo projetado</div>
              <span class="muted" style="font-size:13px">Saldo atual das contas + receitas previstas − despesas previstas − faturas (regime de caixa).</span>
            </div>
            <div class="row wrap">
              ${segmented('horizon', [7, 15, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} dias` })), String(horizon), 'Horizonte')}
            </div>
          </div>
          <label class="switch"><input type="checkbox" data-action="estimates" ${s.preferences.includeEstimates ? 'checked' : ''} /><span class="switch__track"></span><span>Incluir recorrências estimadas a partir do histórico</span></label>
          <div class="kpi-grid">
            <div class="figure"><span class="figure__label">Saldo atual</span><div class="figure__value figure__value--sm"><span class="money">${formatMoney(proj.start)}</span></div></div>
            <div class="figure"><span class="figure__label">Receitas previstas</span><div class="figure__value figure__value--sm pos"><span class="money">+${formatMoney(proj.income)}</span></div></div>
            <div class="figure"><span class="figure__label">Despesas previstas</span><div class="figure__value figure__value--sm neg"><span class="money">−${formatMoney(proj.expenses)}</span></div></div>
            <div class="figure"><span class="figure__label">Faturas</span><div class="figure__value figure__value--sm neg"><span class="money">−${formatMoney(proj.bills)}</span></div></div>
            <div class="figure"><span class="figure__label">Saldo estimado em ${formatShortDate(addDays(a.today, horizon))}</span><div class="figure__value figure__value--sm ${proj.end < 0 ? 'neg' : ''}"><span class="money">${formatMoney(proj.end)}</span></div></div>
            <div class="figure"><span class="figure__label">Menor saldo</span><div class="figure__value figure__value--sm ${proj.min < 0 ? 'neg' : ''}"><span class="money">${formatMoney(proj.min)}</span></div><span class="muted" style="font-size:12px">em ${formatDate(proj.minDate)}</span></div>
          </div>
          <div class="row-between"><span class="card__title">Saldo atual → próximos dias</span>${tableToggle('cf-proj')}</div>
          ${chartFrame('cf-proj', 240, `Projeção do saldo nos próximos ${horizon} dias`, {
            caption: 'Saldo projetado',
            headers: ['Data', 'Saldo projetado'],
            rows: proj.series.filter((_, i) => i % Math.max(1, Math.round(horizon / 15)) === 0 || i === proj.series.length - 1).map((p) => [formatDate(p.date), money(p.balance)]),
          })}
          ${proj.min < 0 ? html`<div class="callout callout--warn">${icon('alert')}<div>A projeção indica saldo negativo em ${formatDate(proj.minDate)}. Considere os lançamentos abaixo.</div></div>` : ''}
          <div class="card__title">Eventos considerados (${events.filter((e) => e.date > a.today && e.date <= addDays(a.today, horizon)).length})</div>
          ${events.length
            ? html`<div class="table-wrap"><table class="table"><caption class="sr-only">Eventos da projeção</caption>
                <thead><tr><th>Data</th><th>Descrição</th><th>Origem</th><th class="num">Valor</th></tr></thead>
                <tbody>${events.map(
                  (e) => html`<tr><td class="nowrap num">${formatDate(e.date)}</td><td>${e.label}</td>
                    <td>${e.certainty === 'estimated' ? badge(e.origin === 'recurrence' ? 'Recorrência estimada' : 'Estimado', 'outline') : badge(e.origin === 'bill' ? 'Fatura' : e.origin === 'planned' ? 'Previsto por você' : 'Agendado', e.origin === 'bill' ? 'warn' : 'neutral')}</td>
                    <td class="num">${money(e.amount, { signed: true, tone: true })}</td></tr>`,
                )}</tbody></table></div>`
            : na('Nenhum evento futuro conhecido no horizonte')}
        </section>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm">
              <div class="card__title card__title--lg">Lançamentos previstos</div>
              <span class="muted" style="font-size:13px">Receitas e despesas que você sabe que vão acontecer (ficam somente neste navegador${s.mode === 'demo' ? ' — no modo demonstração, apenas em memória' : ''}).</span>
            </div>
          </div>
          <form class="filters" data-planned-form style="align-items:end">
            <label class="field"><span class="field__label">Descrição</span><input class="input input--sm" name="description" required maxlength="60" /></label>
            <label class="field"><span class="field__label">Tipo</span><select class="select select--sm" name="kind"><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
            <label class="field"><span class="field__label">Valor (R$)</span><input class="input input--sm" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required /></label>
            <label class="field"><span class="field__label">Data</span><input class="input input--sm" name="date" type="date" required value="${addDays(todayKey(), 1)}" /></label>
            <label class="field"><span class="field__label">Repetição</span><select class="select select--sm" name="recurrence"><option value="none">Única</option><option value="monthly">Mensal</option></select></label>
            <button type="submit" class="btn btn--secondary btn--sm">${icon('plus')}Adicionar</button>
          </form>
          ${s.planned.length
            ? html`<div class="list">${s.planned.map(
                (p) => html`<div class="list-item">
                  <span class="cat-icon">${icon(p.amount >= 0 ? 'arrowDown' : 'arrowUp')}</span>
                  <span class="list-item__main"><span class="list-item__title">${p.description}</span><span class="list-item__sub">${formatDate(p.date)}${p.recurrence === 'monthly' ? ' · mensal' : ''}</span></span>
                  <span class="list-item__end">${money(p.amount, { signed: true, tone: true })}</span>
                  <button type="button" class="icon-btn icon-btn--sm" data-action="remove-planned" data-value="${p.id}" aria-label="Remover ${p.description}">${icon('trash')}</button>
                </div>`,
              )}</div>`
            : ''}
        </section>
      </div>`,
    );
    animateNumbers(root, (n) => formatMoney(n));

    const main = canvasFor(root, 'cf-main');
    if (main) {
      void mountChart(
        main,
        barChart(
          cf.map((b) => bucketLabel(b.start < range.start ? range.start : b.start, gran)),
          [
            { label: 'Entradas', data: cf.map((b) => b.income), colorIndex: 1 },
            { label: 'Saídas', data: cf.map((b) => b.expenses), colorIndex: 2 },
            { label: lineLabel, data: lineData, colorIndex: 3, asLine: true },
          ],
          { maxTicksX: gran === 'day' ? 10 : 12 },
        ),
      );
    }
    const catCanvas = canvasFor(root, 'cf-cats');
    if (catCanvas) void mountChart(catCanvas, barChart(cats.map((c) => categoryLabel(c.category)), [{ label: 'Gastos', data: cats.map((c) => c.total), colorIndex: 2 }], { horizontal: true }));
    const projCanvas = canvasFor(root, 'cf-proj');
    if (projCanvas) void mountChart(projCanvas, lineChart(proj.series.map((p) => formatShortDate(p.date)), [{ label: 'Saldo projetado', data: proj.series.map((p) => p.balance), colorIndex: 3, fill: true }], { maxTicksX: 8, zeroLine: true }));
  };

  const off = delegate(root, 'click', {
    ...commonHandlers,
    period: (el) => {
      kind = el.dataset.value as CashFlowPeriodKind;
      offset = 0;
      paint();
    },
    'period-prev': () => {
      offset -= 1;
      paint();
    },
    'period-next': () => {
      offset = Math.min(0, offset + 1);
      paint();
    },
    'period-today': () => {
      offset = 0;
      paint();
    },
    horizon: (el) => {
      horizon = Number(el.dataset.value);
      paint();
    },
    'remove-planned': (el) => void actions.removePlannedEntry(el.dataset.value!),
  });
  const offChange = delegate(root, 'change', {
    estimates: (el) => void actions.updatePreferences({ includeEstimates: (el as HTMLInputElement).checked }),
  });
  const onSubmit = (e: Event) => {
    const form = e.target as HTMLFormElement;
    if (!form.matches('[data-planned-form]')) return;
    e.preventDefault();
    const f = new FormData(form);
    const value = Math.abs(Number(f.get('amount')));
    const description = String(f.get('description') ?? '').trim();
    const date = String(f.get('date') ?? '');
    if (!description || !value || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    void actions.addPlannedEntry({
      description,
      amount: f.get('kind') === 'income' ? value : -value,
      date,
      recurrence: f.get('recurrence') === 'monthly' ? 'monthly' : 'none',
    });
  };
  root.addEventListener('submit', onSubmit);
  const unsub = onDataChange(paint);
  paint();
  return () => {
    off();
    offChange();
    unsub();
    root.removeEventListener('submit', onSubmit);
  };
}
