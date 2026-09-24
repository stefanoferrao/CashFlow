/**
 * Faturas abertas de todos os cartões num só bloco: o total somado em destaque, uma barra dividida por
 * cartão e a lista com o valor, o vencimento e a participação de cada um.
 * Usado no Dashboard (card "Fatura atual"), em Cartões e em Faturas.
 */
import { html, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { badge, instLogo } from '../components/ui';
import type { OpenBillsOverview } from '../services/financialCalculator';
import { diffDays, type DateKey } from '../utils/dates';
import { formatDate, formatMoney, formatPercent, formatShortDate } from '../utils/format';
import { logoOf } from './shared';

export interface OpenBillsPanelOptions {
  today: DateKey;
  /** Dashboard: mais compacto e com a lista rolável dentro do card. */
  compact?: boolean;
  /** Linhas viram botões que chamam esta ação (data-action) com o id do cartão. */
  selectAction?: string;
  selected?: string | null;
  /** Linhas viram links para a fatura do cartão. */
  linkRows?: boolean;
  /** Mostra a previsão no ritmo atual (soma). */
  showPace?: boolean;
  /** Título do bloco (omitido no dashboard, onde o card já tem título). */
  title?: string;
  /** Não repete o total (quando ele já aparece em destaque na página). */
  hideTotal?: boolean;
}

const seriesOf = (i: number) => `var(--series-${(i % 8) + 1})`;

export function dueText(due: DateKey | null, today: DateKey): string {
  if (!due) return '';
  const d = diffDays(today, due);
  if (d < 0) return `venceu ${formatShortDate(due)}`;
  if (d === 0) return 'vence hoje';
  if (d === 1) return `vence amanhã (${formatShortDate(due)})`;
  return `vence ${formatShortDate(due)} · em ${d} dias`;
}

export function openBillsPanel(ov: OpenBillsOverview, o: OpenBillsPanelOptions): SafeHtml {
  const colored = ov.rows.filter((r) => r.total !== null && r.card.currency === 'BRL' && r.total > 0);
  const colorIdx = new Map(colored.map((r, i) => [r.card.id, i]));
  const next = ov.nextDue;
  const nextDays = next ? diffDays(o.today, next) : null;

  const row = (r: OpenBillsOverview['rows'][number]): SafeHtml => {
    const name = r.card.label ?? r.card.name;
    const idx = colorIdx.get(r.card.id);
    const swatch = html`<span class="ob-row__swatch" style="background:${idx !== undefined ? seriesOf(idx) : 'var(--chart-track)'}" aria-hidden="true"></span>`;
    const sub =
      r.total === null
        ? html`<span class="ob-row__sub ob-row__sub--warn">${icon('calendar')}Sem fechamento/vencimento</span>`
        : html`<span class="ob-row__sub">${dueText(r.due, o.today)}${r.estimated ? ' · datas estimadas' : ''}${r.card.lastFourDigits ? ` · final ${r.card.lastFourDigits}` : ''}</span>`;
    const value =
      r.total === null
        ? html`<span class="ob-row__value muted">—</span>`
        : html`<span class="ob-row__value"><span class="money num">${formatMoney(r.total, r.card.currency)}</span>${r.card.currency === 'BRL' && ov.total > 0 ? html`<span class="ob-row__pct">${formatPercent(r.share)}</span>` : html`<span class="ob-row__pct">${r.card.currency}</span>`}</span>`;
    const inner = html`${swatch}${instLogo(logoOf(r.card), 'sm')}<span class="ob-row__main"><strong class="truncate">${name}</strong>${sub}</span>${value}`;
    if (r.total === null) {
      return html`<li class="ob-row ob-row--missing">${inner}<button type="button" class="link-btn ob-row__fix" data-action="edit-card-cycle" data-value="${r.card.id}">Definir</button></li>`;
    }
    if (o.selectAction) {
      return html`<li><button type="button" class="ob-row ob-row--btn" data-action="${o.selectAction}" data-value="${r.card.id}" aria-pressed="${String(o.selected === r.card.id)}">${inner}</button></li>`;
    }
    if (o.linkRows) {
      return html`<li><a class="ob-row ob-row--btn" href="#/faturas?card=${encodeURIComponent(r.card.id)}" aria-label="Ver a fatura de ${name}: ${formatMoney(r.total, r.card.currency)}, ${dueText(r.due, o.today)}">${inner}</a></li>`;
    }
    return html`<li class="ob-row">${inner}</li>`;
  };

  const others = Object.entries(ov.others);
  return html`<div class="ob ${o.compact ? 'ob--compact' : ''}">
    ${o.hideTotal
      ? ''
      : html`<div class="ob__head">
      <div class="figure">
        <span class="figure__label">${o.title ?? 'Total das faturas abertas'}</span>
        <div class="${o.compact ? 'figure__value' : 'figure__value figure__value--hero'}"><span class="money" data-count="${ov.total}" data-currency="BRL">${formatMoney(ov.total)}</span></div>
        <div class="figure__meta">
          <span>${ov.withCycle} ${ov.withCycle === 1 ? 'cartão' : 'cartões'}${ov.withoutCycle ? ` · ${ov.withoutCycle} sem datas` : ''}${o.showPace && ov.paceTotal > ov.total ? html` · no ritmo atual <strong class="money">${formatMoney(ov.paceTotal)}</strong>` : ''}</span>
        </div>
      </div>
      ${next ? badge(nextDays !== null && nextDays <= 0 ? 'Vence hoje' : `1º vencimento ${formatShortDate(next)}${nextDays !== null ? ` · ${nextDays} d` : ''}`, nextDays !== null && nextDays <= 5 ? 'warn' : 'neutral', 'calendar') : ''}
    </div>`}
    ${colored.length > 1
      ? html`<div class="dist-stack ob__bar" role="img" aria-label="Divisão do total por cartão: ${colored.map((r) => `${r.card.label ?? r.card.name} ${formatPercent(r.share)}`).join(', ')}">
          ${colored.map((r, i) => html`<span style="flex-grow:${r.total};background:${seriesOf(i)}"></span>`)}
        </div>`
      : ''}
    <ul class="ob__list" aria-label="Fatura atual de cada cartão">${ov.rows.map(row)}</ul>
    ${ov.closedDue.length
      ? html`<div class="ob__closed">${icon('alert')}<span>Fechada${ov.closedDue.length > 1 ? 's' : ''} a pagar (informada pela instituição): <strong class="money">${formatMoney(ov.closedDueTotal)}</strong> · ${ov.closedDue
          .map((c) => `${c.card.label ?? c.card.name} ${formatDate(c.due)}`)
          .join(' · ')}</span></div>`
      : ''}
    ${others.length ? html`<p class="field__hint">Faturas em outras moedas (não somadas): ${others.map(([c, v]) => formatMoney(v, c)).join(' · ')}.</p>` : ''}
  </div>`;
}
