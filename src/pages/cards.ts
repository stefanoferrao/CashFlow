/**
 * Cartões — limites, utilização, datas e faturas de cada cartão, com visual de cartão moderno.
 */
import { barChart, mountChart } from '../charts/charts';
import { animateNumbers, delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { type InstLike, badge, figureValue, infoTip, instLogo, meter, money, na, utilizationBadge } from '../components/ui';
import type { NormalizedCard } from '../models/finance';
import { readableTextOn } from '../services/institutions';
import type { PageContext } from '../router';
import { calculateFutureCardCharges, cardUtilization } from '../services/financialCalculator';
import { store } from '../state/store';
import { addDays, parseKey } from '../utils/dates';
import { formatDate, formatMoney, formatMonthKey, formatPercent } from '../utils/format';
import { openBillsPanel } from './billsOverview';
import { analytics, canvasFor, chartFrame, commonHandlers, hasAnyData, institutionOf, logoOf, noDataState, onDataChange, tableToggle } from './shared';

function darken(hex: string, amount = 0.45): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#0b0f17';
  const n = parseInt(h, 16);
  const f = (c: number) => Math.round(c * (1 - amount));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

export function creditCardVisual(c: NormalizedCard, inst?: InstLike | null): SafeHtml {
  const a = c.institutionColor && /^#[0-9a-f]{6}$/i.test(c.institutionColor) ? c.institutionColor : '#1f2937';
  const u = cardUtilization(c);
  const brandLevel = [c.brand, c.level].filter(Boolean).join(' ');
  const showName = c.name.trim().toLowerCase() !== brandLevel.toLowerCase();
  return html`<div class="cc" style="--cc-a:${a};--cc-b:${darken(a)};--cc-fg:${readableTextOn(a)}" role="img" aria-label="Cartão ${c.name} de ${c.institution}, final ${c.lastFourDigits ?? 'não informado'}">
    <div class="cc__top">
      <div class="stack-sm" style="gap:2px;min-width:0">
        <span class="cc__brand">${brandLevel || 'Cartão de crédito'}</span>
        ${showName ? html`<span class="cc__inst">${c.name}</span>` : ''}
      </div>
      <span class="cc__issuer"><span>${c.institution}</span>${inst ? instLogo(inst, 'sm') : ''}</span>
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
            <div class="card kpi--accent"><div class="figure"><span class="figure__label">Próxima fatura (soma) ${infoTip('Soma das faturas abertas (ciclo atual) de todos os cartões. A divisão por cartão está logo abaixo.')}</span>${figureValue(a.openBills.total, 'md')}<div class="figure__meta">${a.openBills.withCycle} ${a.openBills.withCycle === 1 ? 'cartão' : 'cartões'}${a.openBills.nextDue ? ` · 1º vencimento ${formatDate(a.openBills.nextDue)}` : ''}</div></div></div>
            <div class="card"><div class="figure"><span class="figure__label">Limite total</span>${figureValue(c.limit, 'md')}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Limite utilizado · ${formatPercent(c.utilization)}</span>${figureValue(c.used, 'md')}${meter(c.utilization, 'Utilização total dos limites')}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Limite disponível</span>${figureValue(c.available, 'md')}</div></div>
          </div>
          ${c.cardsWithoutData ? html`<div class="callout callout--info">${icon('info')}<div>${c.cardsWithoutData} cartão(ões) sem limite informado pela instituição ficam fora dos totais de limite.</div></div>` : ''}

          <section class="card" aria-labelledby="cards-next-bill">
            <div class="card__head">
              <div class="card__title card__title--lg" id="cards-next-bill">${icon('receipt')}Próxima fatura por cartão</div>
              ${a.openBills.nextDue ? badge(`1º vencimento ${formatDate(a.openBills.nextDue)}`, 'neutral', 'calendar') : ''}
            </div>
            ${openBillsPanel(a.openBills, { today: a.today, linkRows: true, hideTotal: true })}
          </section>

          ${cards.map((card) => {
            const summary = a.bills.find((b) => b.card.id === card.id);
            const proj = summary ? a.billProjections[card.id] : undefined;
            const next = summary ? calculateFutureCardCharges(summary, 1)[0] : undefined;
            const u = cardUtilization(card);
            const bestDay = summary ? parseKey(addDays(summary.cycle.closing, 1)).d : null;
            const inst = institutionOf(card.itemId);
            const logo = logoOf(card);
            const cycleBadge = summary?.cycle.source === 'user' ? html` ${badge('definido por você', 'outline')}` : summary?.cycle.estimated ? html` ${badge('estimado', 'outline')}` : '';
            const userDays = !!(card.manualClosingDay || card.manualDueDay);
            return html`<article class="card">
              <div class="card-tile">
                ${creditCardVisual(card, logo)}
                <div class="stack">
                  <div class="row-between wrap">
                    <div class="row" style="gap:10px;min-width:0">
                      ${instLogo(logo, 'md')}
                      <div class="stack-sm" style="gap:2px;min-width:0">
                        <strong class="truncate" style="font-size:18px">${card.name}</strong>
                        <span class="muted" style="font-size:13px">${card.institution}${inst?.via ? ` (via ${inst.via})` : ''} · final ${card.lastFourDigits ?? '—'}${card.holderType === 'ADDITIONAL' ? ' · adicional' : ''}</span>
                      </div>
                    </div>
                    <div class="row wrap">${card.status && card.status !== 'ACTIVE' ? badge(card.status === 'BLOCKED' ? 'Bloqueado' : 'Cancelado', 'bad') : ''}${utilizationBadge(u)}</div>
                  </div>
                  ${meter(u, `Utilização do limite do ${card.label ?? card.name}`, true)}
                  <div class="detail-grid">
                    ${detail('Limite total', money(card.limit, { currency: card.currency }))}
                    ${detail('Limite disponível', money(card.availableLimit, { currency: card.currency }))}
                    ${detail('Limite utilizado', money(card.usedLimit, { currency: card.currency }), 'Limite total − disponível. Inclui parcelas futuras já comprometidas.')}
                    ${detail('Percentual utilizado', u !== null ? formatPercent(u) : 'Não informado')}
                    ${detail('Melhor dia de compra', bestDay ? `Dia ${bestDay}` : 'Não informado', 'Estimado como o dia seguinte ao fechamento da fatura aberta.')}
                    ${detail('Fechamento', summary ? html`${formatDate(summary.cycle.closing)}${cycleBadge}` : 'Não informado')}
                    ${detail('Vencimento', summary ? html`${formatDate(summary.cycle.due)}${summary.cycle.source === 'user' ? html` ${badge('definido por você', 'outline')}` : ''}` : 'Não informado')}
                    ${detail('Fatura atual', summary ? money(summary.total, { currency: card.currency }) : 'Não disponível', 'Compras e estornos do ciclo aberto + parcelas previstas de compras parceladas. Se a instituição informar um valor maior para esta fatura, vale o dela.')}
                    ${detail('Previsão de fechamento', proj ? money(proj.paceForecast, { currency: card.currency }) : '—', 'Fatura atual + ritmo médio de compras novas até o fechamento.')}
                    ${detail('Fatura seguinte (parcelas já conhecidas)', next ? html`${money(next.total, { currency: card.currency })} <span class="muted" style="font-weight:500;font-size:12px">${formatMonthKey(next.month)}</span>` : 'Nenhuma parcela futura', 'Parcelas já lançadas para o mês seguinte + próximas parcelas de compras parceladas.')}
                    ${card.minimumPayment !== null ? detail('Pagamento mínimo', money(card.minimumPayment, { currency: card.currency })) : ''}
                    ${detail('Saldo informado pela instituição', money(card.institutionBalance, { currency: card.currency }), 'Valor bruto "balance" da Pluggy. Em conectores Open Finance representa o limite utilizado; em outros, o saldo do mês.')}
                  </div>
                  ${!summary
                    ? html`<div class="callout callout--warn">${icon('calendar')}<div>A instituição não informa fechamento e vencimento deste cartão. <button type="button" class="link-btn" data-action="edit-card-cycle" data-value="${card.id}">Definir os dias</button> para calcular a fatura atual e a previsão.</div></div>`
                    : ''}
                  <div class="row wrap">
                    <a class="btn btn--secondary btn--sm" href="#/faturas?card=${card.id}">${icon('receipt')}Ver fatura e previsão</a>
                    <a class="btn btn--ghost btn--sm" href="#/transacoes?card=${card.id}">${icon('list')}Transações do cartão</a>
                    <button type="button" class="btn btn--ghost btn--sm" data-action="edit-card-cycle" data-value="${card.id}">${icon('calendar')}Fechamento e vencimento${userDays ? html` ${badge('seus dias', 'outline')}` : ''}</button>
                    <button type="button" class="btn btn--ghost btn--sm" data-action="edit-identity" data-value="${card.itemId}" data-focus="${card.id}">${icon('palette')}Logo e nome</button>
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
                  rows: withLimits.map((x) => [x.label ?? x.name, money(x.usedLimit), money(x.limit), formatPercent(cardUtilization(x))]),
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
          withLimits.map((x) => x.label ?? x.name),
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
