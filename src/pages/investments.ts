/**
 * Investimentos — patrimônio investido, rentabilidade (quando informada), composição, instituições,
 * evolução (histórico local) e produtos. Totalmente separado do saldo bancário.
 * Sem recomendações de investimento.
 */
import { doughnutChart, lineChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { delta, figureValue, infoTip, kv, money, na } from '../components/ui';
import { INVESTMENT_CLASS_LABEL, type NormalizedInvestment } from '../models/finance';
import type { InvestmentBasisSource } from '../services/financialCalculator';
import type { PageContext } from '../router';
import { store } from '../state/store';
import { formatDate, formatMoney, formatNumber, formatPercent, formatShortDate, formatSignedPercent } from '../utils/format';
import { CLASS_COLOR, analytics, canvasFor, chartFrame, commonHandlers, dataTable, hasAnyData, instLabel, noDataState, onDataChange, tableToggle } from './shared';

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

const SOURCE_LABEL: Record<InvestmentBasisSource, { short: string; long: string }> = {
  movements: { short: 'movimentações', long: 'Calculado pelas movimentações do produto (aplicações e resgates desde a primeira aplicação)' },
  original: { short: 'valor aplicado', long: 'Valor aplicado informado pela instituição × valor atual' },
  profit: { short: 'lucro informado', long: 'Lucro informado pela instituição' },
};

function signedMoney(v: number): SafeHtml {
  return html`<span class="money ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${formatMoney(Math.abs(v))}</span>`;
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
    const perf = a.investmentPerformance;
    const byInst = new Map<string, number>();
    const itemOfInst = new Map<string, string>();
    for (const i of invs) {
      if (i.currency !== 'BRL') continue;
      byInst.set(i.institution, (byInst.get(i.institution) ?? 0) + i.value);
      if (!itemOfInst.has(i.institution)) itemOfInst.set(i.institution, i.itemId);
    }
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
          <div class="card"><div class="figure"><span class="figure__label">Patrimônio investido ${infoTip('Soma do valor líquido (após impostos e taxas) informado pela instituição.')}</span>${figureValue(a.totalInvestments.base, 'md')}</div></div>
          <div class="card kpi--accent"><div class="figure"><span class="figure__label">Rendimento acumulado ${infoTip('Rendimento = valor atual (bruto) + o que já foi resgatado − o total aplicado. Calculado produto a produto, só onde o valor aplicado é conhecido: pelas movimentações do produto ou pelo valor aplicado informado pela instituição. Produtos sem essa informação ficam fora da conta (não viram zero).')}</span>
            ${perf.productsCovered && perf.rate !== null
              ? html`<div class="figure__value figure__value--md ${perf.profit >= 0 ? 'pos' : 'neg'}">${signedMoney(perf.profit)}</div>
                <div class="figure__meta">${delta(perf.rate)}<span>sobre <span class="money">${formatMoney(perf.applied)}</span> aplicados</span></div>`
              : html`${na('Valor aplicado não informado pelas instituições')}`}
          </div></div>
          <div class="card"><div class="figure"><span class="figure__label">Aplicado × valor atual ${infoTip('Nos produtos com base de cálculo: total aplicado, o que já voltou para você (resgates, juros, amortizações) e o valor atual bruto. Líquido = rendimento − impostos estimados pela instituição (IR/IOF).')}</span>
            ${perf.productsCovered
              ? html`<div class="kv-list kv-list--tight">
                  ${kv('Aplicado', money(perf.applied))}
                  ${perf.withdrawn > 0 ? kv('Resgatado', money(perf.withdrawn)) : ''}
                  ${kv('Valor atual', money(perf.current))}
                  ${kv('Rendimento líquido', signedMoney(perf.profitNet))}
                </div>`
              : html`<div class="figure__value figure__value--sm muted">—</div>`}
          </div></div>
          <div class="card"><div class="figure"><span class="figure__label">Cobertura do cálculo ${infoTip('Parte da carteira (em valor) cujo rendimento pôde ser calculado com dados confiáveis.')}</span>
            <div class="figure__value figure__value--md">${formatPercent(perf.coverage)}</div>
            <div class="figure__meta"><span>${perf.productsCovered} de ${perf.productsTotal} produtos · ${byInst.size} instituição(ões)</span></div>
          </div></div>
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
                      <span class="dist-row__label">${instLabel(itemOfInst.get(name) ?? '', name, 'sm')}</span>
                      <span class="dist-row__value">${money(v)} <span class="muted">${formatPercent(instTotal ? v / instTotal : 0)}</span></span>
                      <div class="dist-row__bar"><span style="width:${((instTotal ? v / instTotal : 0) * 100).toFixed(1)}%;background:var(--series-3)"></span></div>
                    </div>`,
                  )}
              </div>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm"><div class="card__title card__title--lg">Como o rendimento é calculado</div>
            <span class="muted" style="font-size:13px">Rendimento = valor atual (bruto) + resgates − total aplicado. Líquido = rendimento − impostos que a instituição estima sobre a posição atual (IR/IOF).</span></div>
          </div>
          <div class="basis-grid">
            <div class="basis"><span class="basis__n">${perf.bySource.movements}</span><span><strong>Pelas movimentações</strong><br /><span class="muted">Aplicações e resgates do próprio produto, com o histórico conferido desde a primeira aplicação (quantidade ou data da aplicação).</span></span></div>
            <div class="basis"><span class="basis__n">${perf.bySource.original}</span><span><strong>Pelo valor aplicado</strong><br /><span class="muted">Valor aplicado informado pela instituição comparado ao valor atual.</span></span></div>
            <div class="basis"><span class="basis__n">${perf.bySource.profit}</span><span><strong>Pelo lucro informado</strong><br /><span class="muted">Quando a instituição informa só o lucro acumulado.</span></span></div>
            <div class="basis ${perf.uncovered.length ? 'basis--warn' : ''}"><span class="basis__n">${perf.uncovered.length}</span><span><strong>Sem base confiável</strong><br /><span class="muted">Ficam fora do rendimento (nunca contam como zero).</span></span></div>
          </div>
          ${perf.informed12m ? html`<p class="field__hint">Rentabilidade dos últimos 12 meses informada pelas instituições (fundos): <strong>${formatPercent(perf.informed12m.rate, true)}</strong> em média, cobrindo ${formatPercent(perf.informed12m.coverage)} da carteira.</p>` : ''}
          ${perf.uncovered.length
            ? html`<details class="details"><summary>Produtos sem base de cálculo (${perf.uncovered.length})</summary>
                <ul class="plain-list">${perf.uncovered.map((u) => html`<li><strong>${u.name}</strong> · <span class="money">${formatMoney(u.value)}</span> <span class="muted">— ${u.reason}</span></li>`)}</ul>
              </details>`
            : ''}
        </section>

        <section class="card">
          <div class="card__title card__title--lg">Produtos</div>
          ${dataTable({
            caption: 'Produtos de investimento',
            headers: ['Produto', 'Classe', 'Instituição', 'Taxa · vencimento', 'Aplicado', 'Valor atual (bruto)', 'Rendimento', 'Valor líquido'],
            numericFrom: 4,
            rows: invs.map((i) => {
              const p = perf.perProduct[i.id];
              const miss = perf.uncovered.find((u) => u.id === i.id);
              const r12 = i.lastTwelveMonthsRate;
              return [
                html`<strong>${i.name}</strong>`,
                html`${INVESTMENT_CLASS_LABEL[i.investmentClass]}<br /><span class="muted" style="font-size:12px">${i.subtype ? SUBTYPE_LABEL[i.subtype] ?? i.subtype : i.type}</span>`,
                instLabel(i.itemId, i.institution),
                html`${rateText(i)}${i.dueDate ? html`<br /><span class="muted" style="font-size:12px">vence ${formatDate(i.dueDate)}</span>` : ''}${r12 !== null ? html`<br /><span class="muted" style="font-size:12px">12m: ${formatPercent(r12, true)} (informado)</span>` : ''}`,
                p ? html`${money(p.applied, { currency: i.currency })}${p.withdrawn > 0 ? html`<br /><span class="muted" style="font-size:12px">resgatado ${formatMoney(p.withdrawn)}</span>` : ''}` : html`<span class="muted" data-tip="${miss?.reason ?? 'Dados não disponíveis pela instituição'}">—</span>`,
                money(p ? p.current : i.grossValue ?? i.value, { currency: i.currency }),
                p
                  ? html`${signedMoney(p.profit)}<br /><span class="${p.profit >= 0 ? 'pos' : 'neg'}" style="font-size:12px">${p.rate !== null ? formatSignedPercent(p.rate) : ''}</span> <span class="tag-source" data-tip="${SOURCE_LABEL[p.source].long}">${SOURCE_LABEL[p.source].short}</span>`
                  : html`<span class="muted" data-tip="${miss?.reason ?? 'Dados não disponíveis pela instituição'}">—</span>`,
                money(i.value, { currency: i.currency }),
              ];
            }),
          })}
          <p class="field__hint">“—” = sem base confiável para o cálculo (passe o mouse ou toque para ver o motivo). Nenhum valor é estimado silenciosamente.</p>
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
