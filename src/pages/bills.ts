/**
 * Faturas — fatura aberta, previsão da próxima fatura, evolução diária, parcelas futuras e faturas fechadas.
 */
import { lineChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render } from '../components/dom';
import { icon } from '../components/icons';
import { badge, categoryIcon, figureValue, infoTip, money, na, segmented } from '../components/ui';
import type { PageContext } from '../router';
import { calculateFutureCardCharges } from '../services/financialCalculator';
import { store } from '../state/store';
import { formatDate, formatMoney, formatMonthKey, formatShortDate } from '../utils/format';
import { analytics, canvasFor, chartFrame, commonHandlers, dataTable, hasAnyData, noDataState, onDataChange, tableToggle } from './shared';

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;
  let selected = ctx.params.get('card');
  let showAll = false;

  const paint = () => {
    const s = store.state;
    if (s.mode === 'real' && !hasAnyData(s)) {
      render(root, html`<div class="page"><div class="card">${noDataState(s)}</div></div>`);
      return;
    }
    const a = analytics();
    const cards = s.dataset.cards;
    if (!cards.length) {
      render(root, html`<div class="page"><div class="card">${na('Nenhum cartão de crédito encontrado nas instituições conectadas')}</div></div>`);
      return;
    }
    if (!selected || !cards.some((c) => c.id === selected)) selected = cards[0]!.id;
    const card = cards.find((c) => c.id === selected)!;
    const summary = a.bills.find((b) => b.card.id === card.id);
    const proj = summary ? a.billProjections[card.id] : undefined;
    const closed = s.dataset.bills.filter((b) => b.cardId === card.id).sort((x, y) => y.dueDate.localeCompare(x.dueDate));
    const future = summary ? calculateFutureCardCharges(summary, a.transactions, 6) : [];
    const cur = card.currency;

    render(
      root,
      html`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">A fatura aberta não é fornecida pela Pluggy: ela é calculada a partir das transações do ciclo atual. Faturas fechadas vêm da instituição.</p>
          ${cards.length > 1 ? segmented('select-card', cards.map((c) => ({ value: c.id, label: c.name })), card.id, 'Cartão') : ''}
        </div>

        ${!summary || !proj
          ? html`<div class="card">${na('Datas de fechamento/vencimento não informadas pela instituição — não é possível montar o ciclo da fatura.')}</div>`
          : html`
          <section class="card">
            <div class="bill-hero">
              <div class="stack">
                <div class="row-between wrap">
                  <span class="card__title">${icon('receipt')}Previsão da próxima fatura · ${card.name}</span>
                  ${summary.cycle.estimated ? badge('Datas estimadas', 'warn', 'info') : badge(`Vence em ${formatDate(summary.cycle.due)}`, 'neutral', 'calendar')}
                </div>
                ${figureValue(proj.forecast, 'hero', cur)}
                <div class="breakdown">
                  <div class="breakdown__row"><span>Fatura já lançada</span><strong>${money(proj.launched, { currency: cur })}</strong></div>
                  <div class="breakdown__row"><span>Compras futuras (parcelas conhecidas) ${infoTip('Lançamentos com data futura dentro do ciclo atual, como parcelas de compras anteriores.')}</span><strong>${money(proj.future, { currency: cur })}</strong></div>
                  <div class="breakdown__row"><span>Previsão final</span><strong>${money(proj.forecast, { currency: cur })}</strong></div>
                </div>
                <div class="pace" role="note">
                  ${icon('trending')}
                  <div>
                    <span class="muted">Se você continuar gastando neste ritmo…</span>
                    <strong class="money">${formatMoney(proj.paceForecast, cur)}</strong>
                    <span class="muted" style="font-size:12px">Média de ${formatMoney(proj.dailyAverage, cur)}/dia em compras novas × ${proj.daysRemaining} dia(s) até o fechamento. Estimativa, não valor da instituição.</span>
                  </div>
                </div>
                <div class="kv-list">
                  <div class="kv"><span>Ciclo</span><strong>${formatShortDate(summary.cycle.start)} a ${formatShortDate(summary.cycle.closing)}</strong></div>
                  <div class="kv"><span>Fechamento</span><strong>${formatDate(summary.cycle.closing)}</strong></div>
                  <div class="kv"><span>Vencimento</span><strong>${formatDate(summary.cycle.due)}</strong></div>
                </div>
              </div>
              <div class="stack">
                <div class="card__head">
                  <div class="card__title">Evolução diária da fatura</div>
                  ${tableToggle('bill-evo')}
                </div>
                <div class="chart-legend">
                  <span class="chart-legend__item"><span class="chart-legend__key is-line" style="--key:var(--series-2)"></span>Acumulado</span>
                  <span class="chart-legend__item"><span class="chart-legend__key is-dashed" style="--key:var(--series-2)"></span>Projeção no ritmo atual</span>
                </div>
                ${chartFrame('bill-evo', 280, 'Evolução diária do valor acumulado da fatura com projeção até o fechamento', {
                  caption: 'Evolução diária da fatura',
                  headers: ['Dia', 'Acumulado', 'Projeção'],
                  rows: proj.series.filter((_, i) => i % 3 === 0 || i === proj.series.length - 1).map((p) => [formatShortDate(p.date), p.actual !== null ? money(p.actual) : '—', p.projected !== null ? money(p.projected) : '—']),
                })}
              </div>
            </div>
          </section>

          <section class="card card--flush">
            <div class="card__pad" style="padding-bottom:12px"><div class="card__title card__title--lg">Lançamentos do ciclo atual</div></div>
            ${summary.transactions.length
              ? html`<div class="list">${summary.transactions
                  .slice()
                  .reverse()
                  .slice(0, showAll ? undefined : 10)
                  .map(
                    (t) => html`<div class="list-item">
                      ${categoryIcon(t.category)}
                      <div class="list-item__main">
                        <span class="list-item__title">${t.description}</span>
                        <span class="list-item__sub">${formatDate(t.date)}${t.installment ? ` · parcela ${t.installment.number}/${t.installment.total}` : ''}${t.date > a.today ? ' · futuro' : ''}</span>
                      </div>
                      <div class="list-item__end">${money(-t.amount, { currency: cur })}</div>
                    </div>`,
                  )}</div>
                  ${summary.transactions.length > 10
                    ? html`<div class="pagination"><span>${showAll ? summary.transactions.length : 10} de ${summary.transactions.length} lançamentos</span><button type="button" class="btn btn--ghost btn--sm" data-action="toggle-all" aria-expanded="${showAll}">${icon(showAll ? 'chevronUp' : 'chevronDown')}${showAll ? 'Mostrar menos' : 'Mostrar todos'}</button></div>`
                    : ''}`
              : html`<div class="card__pad">${na('Nenhum lançamento no ciclo atual')}</div>`}
          </section>

          <section class="card">
            <div class="card__title card__title--lg">Faturas futuras (parcelas já conhecidas)</div>
            ${future.length
              ? dataTable({
                  caption: 'Faturas futuras',
                  headers: ['Fatura', 'Vencimento estimado', 'Lançamentos', 'Valor conhecido'],
                  rows: future.map((f) => [formatMonthKey(f.month), formatDate(f.due), String(f.count), money(f.total, { currency: cur })]),
                  numericFrom: 2,
                })
              : na('Nenhuma parcela futura conhecida')}
            <p class="field__hint">Valores mínimos: novas compras ainda serão somadas. Datas de vencimento projetadas mês a mês a partir do ciclo atual.</p>
          </section>`}

        <section class="card">
          <div class="card__title card__title--lg">Faturas fechadas</div>
          ${closed.length
            ? dataTable({
                caption: 'Faturas fechadas',
                headers: ['Fechamento', 'Vencimento', 'Situação', 'Total', 'Pago', 'Mínimo', 'Encargos'],
                rows: closed.map((b) => [
                  b.closingDate ? formatDate(b.closingDate) : '—',
                  formatDate(b.dueDate),
                  b.isPaid ? badge('Paga', 'good', 'check') : b.dueDate < a.today ? badge('Em aberto', 'bad', 'alert') : badge('A vencer', 'warn', 'clock'),
                  money(b.totalAmount, { currency: b.currency }),
                  money(b.paidAmount, { currency: b.currency }),
                  money(b.minimumPayment, { currency: b.currency }),
                  money(b.financeCharges, { currency: b.currency }),
                ]),
                numericFrom: 3,
              })
            : na('Faturas fechadas não disponibilizadas pela instituição')}
        </section>
      </div>`,
    );
    animateNumbers(root, (n) => formatMoney(n, cur));
    const canvas = canvasFor(root, 'bill-evo');
    if (canvas && proj) {
      void mountChart(
        canvas,
        lineChart(
          proj.series.map((p) => formatShortDate(p.date)),
          [
            { label: 'Acumulado', data: proj.series.map((p) => p.actual), colorIndex: 2, fill: true },
            { label: 'Projeção', data: proj.series.map((p) => p.projected), colorIndex: 2, projection: true },
          ],
          { beginAtZero: true, maxTicksX: 8 },
        ),
      );
    }
  };

  const off = delegate(root, 'click', {
    ...commonHandlers,
    'select-card': (el) => {
      selected = el.dataset.value ?? null;
      showAll = false;
      paint();
    },
    'toggle-all': () => {
      showAll = !showAll;
      paint();
    },
  });
  const unsub = onDataChange(paint);
  paint();
  return () => {
    off();
    unsub();
  };
}
