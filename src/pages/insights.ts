/**
 * Análises — indicadores financeiros, insights baseados SOMENTE nos dados existentes,
 * evolução patrimonial, gastos por categoria e recorrências identificadas.
 * Sem recomendações de investimento.
 */
import { barChart, lineChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { badge, categoryIcon, categoryLabel, delta, infoTip, legend, money, na } from '../components/ui';
import type { PageContext } from '../router';
import { calculateNetWorthHistory, cardDebt } from '../services/financialCalculator';
import { diffDays } from '../utils/dates';
import { store } from '../state/store';
import { formatDate, formatMoney, formatMonthKey, formatMonthKeyShort, formatPercent, formatShortDate } from '../utils/format';
import { analytics, canvasFor, chartFrame, commonHandlers, dataTable, hasAnyData, noDataState, onDataChange, tableToggle } from './shared';

function indicator(label: string, value: SafeHtml | string, meta?: SafeHtml | string, tip?: string): SafeHtml {
  return html`<div class="card"><div class="figure">
    <span class="figure__label">${label}${tip ? html` ${infoTip(tip)}` : ''}</span>
    <div class="figure__value figure__value--md">${value}</div>
    ${meta ? html`<div class="figure__meta">${meta}</div>` : ''}
  </div></div>`;
}

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;

  const paint = () => {
    const s = store.state;
    if (s.mode === 'real' && !hasAnyData(s)) {
      render(root, html`<div class="page"><div class="card">${noDataState(s)}</div></div>`);
      return;
    }
    const a = analytics();
    const ds = s.dataset;
    const debts = ds.cards.filter((c) => c.currency === 'BRL').reduce((t, c) => t + cardDebt(c), 0);
    const economy = a.month.income - a.month.expenses;
    const top = a.categoryMonth[0];
    const g = a.netWorthGrowth30;
    const hist = calculateNetWorthHistory(ds.accounts, a.transactions, ds.snapshots, a.today);
    const subs = a.recurrences;

    render(
      root,
      html`<div class="page">
        <div class="page-head"><p class="page-head__intro">Indicadores do mês de ${formatMonthKey(a.today.slice(0, 7))} (até ${formatShortDate(a.today)}). Tudo aqui é calculado a partir dos seus dados — sem recomendações de investimento.</p></div>

        <div class="kpi-grid">
          ${indicator('Patrimônio líquido', money(a.netWorth.netWorth), undefined, 'Ativos (contas + investimentos) − dívidas (cartões + cheque especial).')}
          ${indicator('Saldo disponível', money(a.totalBalance.base), 'Somente contas bancárias')}
          ${indicator('Investimentos', money(a.totalInvestments.base))}
          ${indicator('Dívidas / faturas', money(debts + a.netWorth.overdraft), html`Faturas abertas: <span class="money">${formatMoney(a.openBillsTotal)}</span>`, 'Limite utilizado dos cartões (inclui parcelas futuras) + cheque especial.')}
          ${indicator('Receita mensal', money(a.month.income), 'Lançada no mês')}
          ${indicator('Despesa mensal', money(a.month.expenses), a.previousMonthToDate.expenses > 0 ? html`${delta((a.month.expenses - a.previousMonthToDate.expenses) / a.previousMonthToDate.expenses, { upIsGood: false })}<span>vs. mesmo período</span>` : undefined)}
          ${indicator('Economia mensal', html`<span class="${economy < 0 ? 'neg' : ''}">${money(economy)}</span>`, 'Receitas − despesas do mês')}
          ${indicator('Taxa de poupança', formatPercent(a.savingsRate), undefined, '(Receitas − despesas) ÷ receitas no mês.')}
          ${indicator('Gasto médio diário', money(a.averageDailyExpense), `Desde ${formatShortDate(`${a.today.slice(0, 7)}-01`)}`)}
          ${indicator('Maior categoria de gasto', top ? html`<span class="row" style="gap:8px">${categoryIcon(top.category)}${categoryLabel(top.category)}</span>` : '—', top ? html`<span class="money">${formatMoney(top.total)}</span> · ${formatPercent(top.share)} das despesas` : 'Sem despesas no mês')}
          ${indicator('Crescimento patrimonial', g ? html`<span class="${g.change < 0 ? 'neg' : 'pos'}"><span class="money">${g.change >= 0 ? '+' : '−'}${formatMoney(Math.abs(g.change))}</span></span>` : '—', g ? html`${delta(g.pct)}<span>desde ${formatDate(g.from)}</span>` : 'Histórico local ainda insuficiente', 'Comparado ao registro local de patrimônio de ~30 dias atrás.')}
        </div>

        <section class="card">
          <div class="card__title card__title--lg">Insights</div>
          ${a.insights.length
            ? html`<div class="auto-grid">${a.insights.map(
                (i) => html`<div class="insight-card" data-tone="${i.tone}">
                  <span class="insight-card__icon">${icon(i.icon)}</span>
                  <div><p>${i.text}</p><p class="insight-card__basis">Base: ${i.basis}</p></div>
                </div>`,
              )}</div>`
            : na('Ainda não há dados suficientes para gerar insights')}
        </section>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm">
              <div class="card__title card__title--lg">Patrimônio ao longo do tempo</div>
              <span class="muted" style="font-size:13px">Somente valores confiáveis: o saldo das contas é reconstruído pelas transações; o patrimônio completo aparece nos dias registrados pelo app.</span>
            </div>
            ${hist.points.length >= 2 ? tableToggle('an-nw') : ''}
          </div>
          <div class="kpi-grid kpi-grid--inline">
            <div class="figure"><span class="figure__label">Patrimônio líquido hoje</span><div class="figure__value figure__value--sm"><span class="money">${formatMoney(a.netWorth.netWorth)}</span></div></div>
            <div class="figure"><span class="figure__label">Variação registrada ${infoTip('Diferença entre o primeiro e o último registro de patrimônio feito pelo app (um por dia sincronizado). Inclui contas, investimentos e dívidas exatamente como as instituições informaram naquele dia.')}</span>
              ${hist.recordedChange
                ? html`<div class="figure__value figure__value--sm ${hist.recordedChange.change < 0 ? 'neg' : 'pos'}"><span class="money">${hist.recordedChange.change >= 0 ? '+' : '−'}${formatMoney(Math.abs(hist.recordedChange.change))}</span></div><span class="muted" style="font-size:12px">desde ${formatDate(hist.recordedChange.from)} · ${hist.recordedCount} registros</span>`
                : html`<div class="figure__value figure__value--sm muted">—</div><span class="muted" style="font-size:12px">${hist.recordedCount === 1 ? '1 registro até agora' : 'Nenhum registro ainda'}</span>`}
            </div>
            <div class="figure"><span class="figure__label">Saldo em contas ${infoTip('Reconstruído de trás para frente: saldo atual − transações posteriores a cada data. Exato a partir da primeira transação disponível de cada instituição.')}</span>
              ${hist.accountsChange
                ? html`<div class="figure__value figure__value--sm ${hist.accountsChange.change < 0 ? 'neg' : 'pos'}"><span class="money">${hist.accountsChange.change >= 0 ? '+' : '−'}${formatMoney(Math.abs(hist.accountsChange.change))}</span></div><span class="muted" style="font-size:12px">desde ${formatDate(hist.accountsChange.from)}</span>`
                : html`<div class="figure__value figure__value--sm muted">—</div><span class="muted" style="font-size:12px">Sem transações suficientes</span>`}
            </div>
          </div>
          ${hist.points.length >= 2
            ? html`${legend([
                { label: 'Patrimônio líquido (registrado)', color: 'var(--series-3)' },
                { label: 'Saldo em contas (reconstruído)', color: 'var(--series-1)' },
              ])}
              ${chartFrame('an-nw', 280, 'Patrimônio líquido registrado e saldo em contas reconstruído ao longo do tempo', {
                caption: 'Patrimônio ao longo do tempo',
                headers: ['Data', 'Patrimônio líquido (registrado)', 'Saldo em contas (reconstruído)', 'Investimentos (registrado)', 'Dívida de cartões (registrado)'],
                rows: hist.points
                  .filter((p, i, arr) => p.netWorth !== null || i % 2 === 0 || i === arr.length - 1)
                  .map((p) => [formatDate(p.date), p.netWorth !== null ? money(p.netWorth) : '—', p.accounts !== null ? money(p.accounts) : '—', p.investments !== null ? money(p.investments) : '—', p.cardDebt !== null ? money(p.cardDebt) : '—']),
              })}`
            : na('Ainda não há dados suficientes: o saldo das contas precisa de transações e o patrimônio completo é registrado a cada dia sincronizado.')}
          <div class="callout callout--info">${icon('info')}<div>
            <strong>Por que investimentos e dívidas não são reconstruídos?</strong> A Pluggy informa só o valor <em>atual</em> de cada investimento e o limite usado <em>hoje</em> no cartão. Estimar o passado deles mostraria um histórico que não aconteceu. Por isso o patrimônio completo aparece apenas nos dias em que o app registrou os valores (um ponto por dia sincronizado)${hist.firstRecorded ? html` — registros desde <strong>${formatDate(hist.firstRecorded)}</strong>` : ''}.
            ${hist.excludedAccounts ? html` ${hist.excludedAccounts} conta(s) sem transações disponíveis ficaram fora da reconstrução do saldo.` : ''}
          </div></div>
        </section>

        <section class="card">
          <div class="card__head"><div class="card__title card__title--lg">Gastos por categoria · mês</div>${a.categoryMonth.length ? tableToggle('an-cat') : ''}</div>
          ${a.categoryMonth.length
            ? chartFrame('an-cat', Math.max(160, a.categoryMonth.length * 36), 'Gastos do mês por categoria', {
                caption: 'Gastos por categoria no mês',
                headers: ['Categoria', 'Total', 'Participação'],
                rows: a.categoryMonth.map((c) => [categoryLabel(c.category), money(c.total), formatPercent(c.share)]),
              })
            : na('Sem despesas no mês')}
        </section>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm"><div class="card__title card__title--lg">Recorrências identificadas</div>
            <span class="muted" style="font-size:13px">Lançamentos com a mesma descrição e valor semelhante em intervalos regulares. São estimativas usadas nas projeções (desative em Fluxo de Caixa).</span></div>
            ${badge('estimativa', 'outline')}
          </div>
          ${subs.length
            ? dataTable({
                caption: 'Recorrências identificadas',
                headers: ['Descrição', 'Categoria', 'Frequência', 'Ocorrências', 'Última', 'Próxima prevista', 'Valor típico'],
                numericFrom: 3,
                rows: subs.map((r) => [
                  r.label,
                  categoryLabel(r.category),
                  r.cadence === 'monthly' ? 'Mensal' : r.cadence === 'biweekly' ? 'Quinzenal' : 'Semanal',
                  String(r.occurrences),
                  formatDate(r.lastDate),
                  formatDate(r.nextDate),
                  money(r.averageAmount, { signed: true, tone: true }),
                ]),
              })
            : na('Nenhuma recorrência identificada com segurança')}
        </section>
      </div>`,
    );
    animateNumbers(root, (n) => formatMoney(n));

    const nw = canvasFor(root, 'an-nw');
    if (nw) {
      const long = hist.points.length > 1 && diffDays(hist.points[0]!.date, hist.points[hist.points.length - 1]!.date) > 300;
      void mountChart(
        nw,
        lineChart(
          hist.points.map((x) => (long ? formatMonthKeyShort(x.date.slice(0, 7)) : formatShortDate(x.date))),
          [
            { label: 'Patrimônio líquido (registrado)', data: hist.points.map((x) => x.netWorth), colorIndex: 3, points: true },
            { label: 'Saldo em contas (reconstruído)', data: hist.points.map((x) => x.accounts), colorIndex: 1, fill: true },
          ],
          { maxTicksX: 8 },
        ),
      );
    }
    const cat = canvasFor(root, 'an-cat');
    if (cat) void mountChart(cat, barChart(a.categoryMonth.map((c) => categoryLabel(c.category)), [{ label: 'Gastos', data: a.categoryMonth.map((c) => c.total), colorIndex: 2 }], { horizontal: true }));
  };

  const off = delegate(root, 'click', commonHandlers);
  const unsub = onDataChange(paint);
  paint();
  return () => {
    off();
    unsub();
  };
}
