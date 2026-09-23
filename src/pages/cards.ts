/**
 * Cartões — limites, utilização, datas e faturas de cada cartão, com visual de cartão moderno.
 */
import { barChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { badge, figureValue, infoTip, meter, money, na, utilizationBadge } from '../components/ui';
import type { NormalizedCard } from '../models/finance';
import type { PageContext } from '../router';
import { calculateFutureCardCharges, cardUtilization } from '../services/financialCalculator';
import { store } from '../state/store';
import { addDays, parseKey } from '../utils/dates';
import { formatDate, formatMoney, formatMonthKey, formatPercent } from '../utils/format';
import { analytics, canvasFor, chartFrame, commonHandlers, hasAnyData, noDataState, onDataChange, tableToggle } from './shared';

function darken(hex: string, amount = 0.45): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#0b0f17';
  const n = parseInt(h, 16);
  const f = (c: number) => Math.round(c * (1 - amount));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

export function creditCardVisual(c: NormalizedCard): SafeHtml {
  const a = c.institutionColor && /^#[0-9a-f]{6}$/i.test(c.institutionColor) ? c.institutionColor : '#1f2937';
  const u = cardUtilization(c);
  return html`<div class="cc" style="--cc-a:${a};--cc-b:${darken(a)}" role="img" aria-label="Cartão ${c.name} final ${c.lastFourDigits ?? 'não informado'}">
    <div class="cc__top">
      <div class="stack-sm" style="gap:2px">
        <span class="cc__brand">${[c.brand, c.level].filter(Boolean).join(' ') || 'Cartão de crédito'}</span>
        <span class="cc__inst">${c.name}</span>
      </div>
      <span class="cc__inst">${c.institution}</span>
    </div>
    <div class="cc__chip" aria-hidden="true"></div>
    <div class="cc__number sensitive">•••• •••• •••• ${c.lastFourDigits ?? '••••'}</div>
    <div class="cc__bottom">
      <div><div class="cc__label">Limite</div><div class="cc__value money">${c.limit !== null ? formatMoney(c.limit, c.currency) : '—'}</div></div>
      <div><div class="cc__label">Disponível</div><div class="cc__value money">${c.availableLimit !== null ? formatMoney(c.availableLimit, c.currency) : '—'}</div></div>
      <div style="text-align:right"><div class="cc__label">Utilizado</div><div class="cc__value">${u !== null ? formatPercent(u) : '—'}</div></div>
    </div>
  </div>`;
}

function detail(label: string, value: SafeHtml | string, tip?: string): SafeHtml {
  return html`<div class="detail"><span>${label}${tip ? html` ${infoTip(tip)}` : ''}</span><strong>${value}</strong></div>`;
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
    const cards = s.dataset.cards;
    const c = a.credit;
    const withLimits = cards.filter((x) => cardUtilization(x) !== null);

    render(
      root,
      html`<div class="page">
        <div class="page-head"><p class="page-head__intro">Limite de cartão não é patrimônio e fatura não é ativo — aqui eles aparecem como compromissos.</p></div>
        ${!cards.length
          ? html`<div class="card">${na('Nenhum cartão de crédito encontrado nas instituições conectadas')}</div>`
          : html`
          <div class="kpi-grid">
            <div class="card"><div class="figure"><span class="figure__label">Limite total</span>${figureValue(c.limit)}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Limite utilizado</span>${figureValue(c.used, 'md')}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Limite disponível</span>${figureValue(c.available, 'md')}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Percentual utilizado</span><div class="figure__value figure__value--md">${formatPercent(c.utilization)}</div>${meter(c.utilization, 'Utilização total dos limites')}</div></div>
          </div>
          ${c.cardsWithoutData ? html`<div class="callout callout--info">${icon('info')}<div>${c.cardsWithoutData} cartão(ões) sem limite informado pela instituição ficam fora dos totais de limite.</div></div>` : ''}

          ${cards.map((card) => {
            const summary = a.bills.find((b) => b.card.id === card.id);
            const proj = summary ? a.billProjections[card.id] : undefined;
            const next = summary ? calculateFutureCardCharges(summary, a.transactions, 1)[0] : undefined;
            const u = cardUtilization(card);
            const bestDay = summary ? parseKey(addDays(summary.cycle.closing, 1)).d : null;
            return html`<article class="card">
              <div class="card-tile">
                ${creditCardVisual(card)}
                <div class="stack">
                  <div class="row-between wrap">
                    <div class="stack-sm" style="gap:2px">
                      <strong style="font-size:18px">${card.name}</strong>
                      <span class="muted" style="font-size:13px">${card.institution} · final ${card.lastFourDigits ?? '—'}${card.holderType === 'ADDITIONAL' ? ' · adicional' : ''}</span>
                    </div>
                    <div class="row wrap">${card.status && card.status !== 'ACTIVE' ? badge(card.status === 'BLOCKED' ? 'Bloqueado' : 'Cancelado', 'bad') : ''}${utilizationBadge(u)}</div>
                  </div>
                  ${meter(u, `Utilização do limite do ${card.name}`, true)}
                  <div class="detail-grid">
                    ${detail('Limite total', money(card.limit, { currency: card.currency }))}
                    ${detail('Limite disponível', money(card.availableLimit, { currency: card.currency }))}
                    ${detail('Limite utilizado', money(card.usedLimit, { currency: card.currency }), 'Limite total − disponível. Inclui parcelas futuras já comprometidas.')}
                    ${detail('Percentual utilizado', u !== null ? formatPercent(u) : 'Não informado')}
                    ${detail('Melhor dia de compra', bestDay ? `Dia ${bestDay}` : 'Não informado', 'Estimado como o dia seguinte ao fechamento da fatura aberta.')}
                    ${detail('Fechamento', summary ? html`${formatDate(summary.cycle.closing)}${summary.cycle.estimated ? html` ${badge('estimado', 'outline')}` : ''}` : 'Não informado')}
                    ${detail('Vencimento', summary ? formatDate(summary.cycle.due) : 'Não informado')}
                    ${detail('Fatura atual', summary ? money(summary.total, { currency: card.currency }) : 'Não disponível', 'Soma das compras e estornos do ciclo aberto, calculada a partir das transações.')}
                    ${detail('Previsão de fechamento', proj ? money(proj.paceForecast, { currency: card.currency }) : '—', 'Lançado + parcelas conhecidas + ritmo médio de gastos até o fechamento.')}
                    ${detail('Próxima fatura (parcelas já conhecidas)', next ? html`${money(next.total, { currency: card.currency })} <span class="muted" style="font-weight:500;font-size:12px">${formatMonthKey(next.month)}</span>` : 'Nenhuma parcela futura')}
                    ${card.minimumPayment !== null ? detail('Pagamento mínimo', money(card.minimumPayment, { currency: card.currency })) : ''}
                    ${detail('Saldo informado pela instituição', money(card.institutionBalance, { currency: card.currency }), 'Valor bruto "balance" da Pluggy. Em conectores Open Finance representa o limite utilizado; em outros, o saldo do mês.')}
                  </div>
                  <div class="row wrap">
                    <a class="btn btn--secondary btn--sm" href="#/faturas?card=${card.id}">${icon('receipt')}Ver fatura e previsão</a>
                    <a class="btn btn--ghost btn--sm" href="#/transacoes?card=${card.id}">${icon('list')}Transações do cartão</a>
                  </div>
                </div>
              </div>
            </article>`;
          })}

          ${withLimits.length >= 2
            ? html`<section class="card">
                <div class="card__head"><div class="card__title card__title--lg">Utilização por cartão</div>${tableToggle('card-util')}</div>
                ${chartFrame('card-util', Math.max(120, withLimits.length * 56), 'Percentual de limite utilizado por cartão', {
                  caption: 'Utilização por cartão',
                  headers: ['Cartão', 'Utilizado', 'Limite', '%'],
                  rows: withLimits.map((x) => [x.name, money(x.usedLimit), money(x.limit), formatPercent(cardUtilization(x))]),
                })}
              </section>`
            : ''}`}
      </div>`,
    );
    animateNumbers(root, (n) => formatMoney(n));
    const canvas = canvasFor(root, 'card-util');
    if (canvas) {
      void mountChart(
        canvas,
        barChart(
          withLimits.map((x) => x.name),
          [{ label: 'Utilizado', data: withLimits.map((x) => cardUtilization(x) ?? 0), colorIndex: 3 }],
          { horizontal: true, yFormat: 'percent' },
        ),
      );
    }
  };

  const off = delegate(root, 'click', commonHandlers);
  const unsub = onDataChange(paint);
  paint();
  return () => {
    off();
    unsub();
  };
}
