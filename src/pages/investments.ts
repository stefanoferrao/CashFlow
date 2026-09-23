/**
 * Investimentos — patrimônio investido, rentabilidade (quando informada), composição, instituições,
 * evolução (histórico local) e produtos. Totalmente separado do saldo bancário.
 * Sem recomendações de investimento.
 */
import { doughnutChart, lineChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render } from '../components/dom';
import { icon } from '../components/icons';
import { figureValue, infoTip, money, na } from '../components/ui';
import { INVESTMENT_CLASS_LABEL, type NormalizedInvestment } from '../models/finance';
import type { PageContext } from '../router';
import { store } from '../state/store';
import { formatDate, formatMoney, formatNumber, formatPercent, formatShortDate } from '../utils/format';
import { CLASS_COLOR, analytics, canvasFor, chartFrame, commonHandlers, dataTable, hasAnyData, noDataState, onDataChange, tableToggle } from './shared';

const SUBTYPE_LABEL: Record<string, string> = {
  CDB: 'CDB',
  LCI: 'LCI',
  LCA: 'LCA',
  LC: 'LC',
  CRI: 'CRI',
  CRA: 'CRA',
  TREASURY: 'Tesouro Direto',
  DEBENTURES: 'Debêntures',
  CORPORATE_DEBT: 'Dívida corporativa',
  MULTIMARKET_FUND: 'Multimercado',
  FIXED_INCOME_FUND: 'Fundo de renda fixa',
  STOCK_FUND: 'Fundo de ações',
  INVESTMENT_FUND: 'Fundo de investimento',
  ETF_FUND: 'Fundo de ETF',
  OFFSHORE_FUND: 'Fundo offshore',
  FIP_FUND: 'FIP',
  EXCHANGE_FUND: 'Fundo cambial',
  FI_INFRA: 'Fundo de infraestrutura',
  FI_AGRO: 'Fiagro',
  STOCK: 'Ações',
  BDR: 'BDR',
  REAL_ESTATE_FUND: 'Fundo imobiliário',
  DERIVATIVES: 'Derivativos',
  OPTION: 'Opções',
  ETF: 'ETF',
  RETIREMENT: 'Previdência',
  STRUCTURED_NOTE: 'COE',
};

function rateText(i: NormalizedInvestment): string {
  if (i.rate !== null && i.rateType) return `${formatNumber(i.rate)}% ${i.rateType}`;
  if (i.fixedAnnualRate !== null) return `${i.rateType ? `${i.rateType} + ` : ''}${formatNumber(i.fixedAnnualRate)}% a.a.`;
  if (i.rateType) return i.rateType;
  return '—';
}

function returnOf(i: NormalizedInvestment): number | null {
  if (i.profit !== null && i.originalValue !== null && i.originalValue > 0) return i.profit / i.originalValue;
  return null;
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
    const invs = s.dataset.investments.filter((i) => i.status !== 'TOTAL_WITHDRAWAL').sort((x, y) => y.value - x.value);
    const br = a.investmentBreakdown;
    const ret = a.investmentReturn;
    const byInst = new Map<string, number>();
    for (const i of invs) if (i.currency === 'BRL') byInst.set(i.institution, (byInst.get(i.institution) ?? 0) + i.value);
    const instTotal = [...byInst.values()].reduce((x, y) => x + y, 0);
    const snaps = s.dataset.snapshots.filter((x) => x.investments > 0);
    const others = Object.entries(a.totalInvestments.others);

    render(
      root,
      html`<div class="page">
        <div class="page-head"><p class="page-head__intro">Valores informados pelas instituições via Pluggy. Investimentos são contabilizados separadamente do saldo em contas. Nenhuma recomendação de investimento é feita aqui.</p></div>
        ${!invs.length
          ? html`<div class="card">${na('Nenhum investimento informado pelas instituições conectadas')}</div>`
          : html`
        <div class="kpi-grid">
          <div class="card"><div class="figure"><span class="figure__label">Patrimônio investido ${infoTip('Soma do valor líquido (após impostos e taxas) informado pela instituição.')}</span>${figureValue(a.totalInvestments.base)}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Rentabilidade acumulada ${infoTip('Lucro informado ÷ valor aplicado originalmente, somente dos produtos em que a instituição informa ambos.')}</span>
            ${ret ? html`<div class="figure__value figure__value--md ${ret.rate >= 0 ? 'pos' : 'neg'}">${ret.rate >= 0 ? '+' : '−'}${formatPercent(Math.abs(ret.rate), true)}</div><div class="figure__meta"><span><span class="money">${formatMoney(ret.profit)}</span> sobre <span class="money">${formatMoney(ret.original)}</span> · cobre ${formatPercent(ret.coverage)} da carteira</span></div>` : na()}
          </div></div>
          <div class="card"><div class="figure"><span class="figure__label">Produtos</span><div class="figure__value figure__value--md">${invs.length}</div><div class="figure__meta">${byInst.size} instituição(ões)</div></div></div>
        </div>
        ${others.length ? html`<div class="callout callout--info">${icon('info')}<div>Investimentos em outras moedas (não somados): ${others.map(([c, v]) => formatMoney(v, c)).join(' · ')}.</div></div>` : ''}

        <div class="grid">
          <section class="card col-5">
            <div class="card__head"><div class="card__title card__title--lg">Composição patrimonial</div>${tableToggle('inv-comp')}</div>
            ${chartFrame('inv-comp', 220, 'Composição dos investimentos por classe', {
              caption: 'Composição por classe',
              headers: ['Classe', 'Valor', '%'],
              rows: br.map((b) => [b.label, money(b.value), formatPercent(b.share)]),
            })}
            <div class="dist-list">
              ${br.map(
                (b) => html`<div class="dist-row">
                  <span class="dist-row__label"><span class="swatch" style="background:var(--series-${CLASS_COLOR[b.key]})"></span>${b.label} <span class="muted">(${b.count})</span></span>
                  <span class="dist-row__value">${money(b.value)} <span class="muted">${formatPercent(b.share)}</span></span>
                </div>`,
              )}
            </div>
          </section>
          <section class="card col-7">
            <div class="card__head"><div class="card__title card__title--lg">Evolução do patrimônio investido</div>${snaps.length >= 2 ? tableToggle('inv-evo') : ''}</div>
            ${snaps.length >= 2
              ? chartFrame('inv-evo', 260, 'Evolução do valor investido segundo os registros locais', {
                  caption: 'Evolução dos investimentos',
                  headers: ['Data', 'Investido'],
                  rows: snaps.map((x) => [formatDate(x.date), money(x.investments)]),
                })
              : na('Histórico disponível a partir do primeiro uso: o app registra o valor investido a cada dia sincronizado (a Pluggy não fornece série histórica).')}
            <div class="stack-sm">
              <div class="card__title">Por instituição</div>
              <div class="dist-list">
                ${[...byInst.entries()]
                  .sort((x, y) => y[1] - x[1])
                  .map(
                    ([name, v]) => html`<div class="dist-row">
                      <span class="dist-row__label">${icon('bank')}${name}</span>
                      <span class="dist-row__value">${money(v)} <span class="muted">${formatPercent(instTotal ? v / instTotal : 0)}</span></span>
                      <div class="dist-row__bar"><span style="width:${((instTotal ? v / instTotal : 0) * 100).toFixed(1)}%;background:var(--series-3)"></span></div>
                    </div>`,
                  )}
              </div>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card__title card__title--lg">Produtos</div>
          ${dataTable({
            caption: 'Produtos de investimento',
            headers: ['Produto', 'Classe', 'Instituição', 'Taxa/indexador', 'Vencimento', 'Rentab. informada', 'Valor bruto', 'Valor líquido'],
            numericFrom: 5,
            rows: invs.map((i) => {
              const r = returnOf(i);
              const r12 = i.lastTwelveMonthsRate;
              return [
                html`<strong>${i.name}</strong>`,
                html`${INVESTMENT_CLASS_LABEL[i.investmentClass]}<br /><span class="muted" style="font-size:12px">${i.subtype ? SUBTYPE_LABEL[i.subtype] ?? i.subtype : i.type}</span>`,
                i.institution,
                rateText(i),
                i.dueDate ? formatDate(i.dueDate) : '—',
                r !== null ? html`<span class="${r >= 0 ? 'pos' : 'neg'}">${formatPercent(r, true)}</span>` : r12 !== null ? html`${formatPercent(r12, true)} <span class="muted" style="font-size:11px">12m</span>` : html`<span class="muted" title="Dados não disponíveis pela instituição">—</span>`,
                money(i.grossValue, { currency: i.currency }),
                money(i.value, { currency: i.currency }),
              ];
            }),
          })}
          <p class="field__hint">“—” = dado não disponível pela instituição. Nenhum valor é estimado silenciosamente.</p>
        </section>`}
      </div>`,
    );
    animateNumbers(root, (n) => formatMoney(n));

    const comp = canvasFor(root, 'inv-comp');
    if (comp) void mountChart(comp, doughnutChart(br.map((b) => b.label), br.map((b) => b.value), br.map((b) => CLASS_COLOR[b.key])));
    const evo = canvasFor(root, 'inv-evo');
    if (evo) void mountChart(evo, lineChart(snaps.map((x) => formatShortDate(x.date)), [{ label: 'Investido', data: snaps.map((x) => x.investments), colorIndex: 3, fill: true }], { maxTicksX: 8 }));
  };

  const off = delegate(root, 'click', commonHandlers);
  const unsub = onDataChange(paint);
  paint();
  return () => {
    off();
    unsub();
  };
}
