/**
 * Peças visuais reutilizáveis (sem lógica financeira).
 */
import { type AppCategoryId, CATEGORY_BY_ID, type NormalizedInstitution } from '../models/finance';
import { initialsOf, isHexColor, readableTextOn } from '../services/institutions';
import { formatMoney, formatPercent, formatSignedMoney } from '../utils/format';
import { html, type SafeHtml } from './dom';
import { icon } from './icons';

export function money(value: number | null | undefined, opts: { currency?: string; signed?: boolean; tone?: boolean; count?: boolean; className?: string } = {}): SafeHtml {
  const currency = opts.currency ?? 'BRL';
  if (value === null || value === undefined || Number.isNaN(value)) return html`<span class="money num muted">—</span>`;
  const text = opts.signed ? formatSignedMoney(value, currency) : formatMoney(value, currency);
  const tone = opts.tone ? (value > 0 ? ' pos' : value < 0 ? ' neg' : '') : '';
  const count = opts.count && !opts.signed ? html` data-count="${value}" data-currency="${currency}"` : '';
  return html`<span class="money num${tone} ${opts.className ?? ''}"${count}>${text}</span>`;
}

/** Valor de destaque (proporcional, sem tabular-nums). */
export function figureValue(value: number | null | undefined, size: 'hero' | 'display' | 'md' | 'sm' = 'display', currency = 'BRL'): SafeHtml {
  const cls = size === 'hero' ? 'figure__value figure__value--hero' : size === 'md' ? 'figure__value figure__value--md' : size === 'sm' ? 'figure__value figure__value--sm' : 'figure__value';
  if (value === null || value === undefined || Number.isNaN(value)) return html`<div class="${cls} muted">—</div>`;
  return html`<div class="${cls}"><span class="money" data-count="${value}" data-currency="${currency}">${formatMoney(value, currency)}</span></div>`;
}

export function delta(fraction: number | null | undefined, opts: { upIsGood?: boolean; label?: string } = {}): SafeHtml {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return html``;
  const upIsGood = opts.upIsGood ?? true;
  const flat = Math.abs(fraction) < 0.0005;
  const up = fraction > 0;
  const good = flat ? null : up === upIsGood;
  const cls = flat ? 'delta--flat' : good ? 'delta--up' : 'delta--down';
  const sign = flat ? '' : up ? '+' : '−';
  return html`<span class="delta ${cls}" title="${opts.label ?? ''}">${flat ? '' : icon(up ? 'arrowUpRight' : 'arrowDownRight')}${sign}${formatPercent(Math.abs(fraction), true)}</span>`;
}

export type Tone = 'good' | 'bad' | 'warn' | 'info' | 'accent' | 'neutral' | 'outline';

export function badge(text: string, tone: Tone = 'neutral', iconName?: string): SafeHtml {
  const cls = tone === 'neutral' ? '' : `badge--${tone}`;
  return html`<span class="badge ${cls}">${iconName ? icon(iconName) : ''}${text}</span>`;
}

export function na(text = 'Dados não disponíveis pela instituição'): SafeHtml {
  return html`<span class="na">${icon('info')}${text}</span>`;
}

export function infoTip(text: string): SafeHtml {
  return html`<button type="button" class="info-tip" data-tip="${text}" aria-label="${text}">${icon('help')}</button>`;
}

export interface StateOptions {
  kind: 'empty' | 'error' | 'loading' | 'success' | 'warn' | 'offline';
  title: string;
  text?: string;
  action?: { label: string; action: string; icon?: string; primary?: boolean; data?: string };
  secondary?: { label: string; action: string; icon?: string };
  compact?: boolean;
}

export function stateBlock(o: StateOptions): SafeHtml {
  const iconName = { empty: 'sparkle', error: 'alert', loading: 'refresh', success: 'check', warn: 'alert', offline: 'wifiOff' }[o.kind];
  const cls = o.kind === 'error' ? 'state--error' : o.kind === 'success' ? 'state--success' : o.kind === 'warn' || o.kind === 'offline' ? 'state--warn' : '';
  return html`<div class="state ${cls} ${o.compact ? 'state--compact' : ''}" role="${o.kind === 'error' ? 'alert' : 'status'}">
    <div class="state__icon">${icon(iconName, o.kind === 'loading' ? 'spin' : '')}</div>
    <div class="state__title">${o.title}</div>
    ${o.text ? html`<p class="state__text">${o.text}</p>` : ''}
    ${o.action || o.secondary
      ? html`<div class="row wrap" style="justify-content:center;margin-top:4px">
          ${o.action ? html`<button class="btn ${o.action.primary === false ? 'btn--secondary' : 'btn--primary'}" data-action="${o.action.action}" ${o.action.data ? html`data-value="${o.action.data}"` : ''}>${o.action.icon ? icon(o.action.icon) : ''}${o.action.label}</button>` : ''}
          ${o.secondary ? html`<button class="btn btn--ghost" data-action="${o.secondary.action}">${o.secondary.icon ? icon(o.secondary.icon) : ''}${o.secondary.label}</button>` : ''}
        </div>`
      : ''}
  </div>`;
}

export function skeleton(lines = 3, heights: number[] = []): SafeHtml {
  const items = Array.from({ length: lines }, (_, i) => html`<span class="skeleton" style="height:${heights[i] ?? 14}px;width:${i === 0 ? 45 : 100 - i * 12}%"></span>`);
  return html`<div class="stack-sm" aria-hidden="true">${items}</div>`;
}

export function utilizationLevel(fraction: number | null): 'good' | 'warning' | 'critical' {
  if (fraction === null) return 'good';
  if (fraction >= 0.7) return 'critical';
  if (fraction >= 0.3) return 'warning';
  return 'good';
}

export function meter(fraction: number | null, label: string, large = false): SafeHtml {
  const f = fraction === null ? 0 : Math.max(0, Math.min(1, fraction));
  const level = utilizationLevel(fraction);
  return html`<div class="meter ${large ? 'meter--lg' : ''}" data-level="${level}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f * 100)}" aria-label="${label}">
    <div class="meter__fill" style="width:${(f * 100).toFixed(1)}%"></div>
  </div>`;
}

export function utilizationBadge(fraction: number | null): SafeHtml {
  if (fraction === null) return badge('Sem limite informado', 'neutral', 'info');
  const level = utilizationLevel(fraction);
  const tone: Tone = level === 'critical' ? 'bad' : level === 'warning' ? 'warn' : 'good';
  const text = level === 'critical' ? 'Uso alto' : level === 'warning' ? 'Uso moderado' : 'Uso saudável';
  return badge(`${formatPercent(fraction)} · ${text}`, tone, level === 'good' ? 'check' : 'alert');
}

export function categoryIcon(id: AppCategoryId): SafeHtml {
  const c = CATEGORY_BY_ID[id];
  return html`<span class="cat-icon" style="color:var(--series-${(c.colorIndex % 8) + 1})" aria-hidden="true">${icon(c.icon)}</span>`;
}

export function categoryLabel(id: AppCategoryId): string {
  return CATEGORY_BY_ID[id]?.label ?? 'Outros';
}

export type InstLike = Pick<NormalizedInstitution, 'name' | 'imageUrl' | 'primaryColor'> &
  Partial<Pick<NormalizedInstitution, 'logo' | 'icon' | 'initials' | 'textColor'>>;

/**
 * Identidade visual da instituição: logo da Pluggy, ícone ou iniciais sobre a cor escolhida.
 * Decorativo (o nome sempre acompanha). Se o logo não carregar, as iniciais aparecem (ver app.ts).
 */
export function instLogo(inst: InstLike, size: 'lg' | 'md' | 'sm' | 'xs' = 'md'): SafeHtml {
  const color = isHexColor(inst.primaryColor) ? inst.primaryColor : null;
  const fg = inst.textColor ?? (color ? readableTextOn(color) : null);
  const initials = inst.initials ?? initialsOf(inst.name);
  const cls = `inst-logo inst-logo--${size}`;
  if (inst.imageUrl && inst.logo !== 'initials' && inst.logo !== 'icon') {
    return html`<span class="${cls} inst-logo--img" aria-hidden="true">
      <img src="${inst.imageUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <span class="inst-logo__fallback" style="${color ? `background:${color};color:${fg}` : ''}">${initials}</span>
    </span>`;
  }
  const content = inst.logo === 'icon' && inst.icon ? icon(inst.icon) : initials;
  return html`<span class="${cls}" style="${color ? `background:${color};color:${fg}` : ''}" aria-hidden="true">${content}</span>`;
}

/** Logo + nome da instituição (e "via Meu Pluggy" quando for o caso). */
export function instName(inst: InstLike & { via?: string | null }, opts: { size?: 'md' | 'sm' | 'xs'; via?: boolean } = {}): SafeHtml {
  return html`<span class="inst-name">${instLogo(inst, opts.size ?? 'xs')}<span class="inst-name__text">${inst.name}${
    opts.via && inst.via ? html` <span class="inst-name__via">via ${inst.via}</span>` : ''
  }</span></span>`;
}

export function kv(label: string | SafeHtml, value: SafeHtml | string): SafeHtml {
  return html`<div class="kv"><span>${label}</span><strong>${value}</strong></div>`;
}

export function pageHead(title: string, intro: string | null, actions?: SafeHtml): SafeHtml {
  return html`<div class="page-head">
    <div class="stack-sm">
      <h2 class="sr-only">${title}</h2>
      ${intro ? html`<p class="page-head__intro">${intro}</p>` : ''}
    </div>
    ${actions ? html`<div class="row wrap">${actions}</div>` : ''}
  </div>`;
}

export function segmented(name: string, options: Array<{ value: string; label: string | SafeHtml }>, current: string, label: string): SafeHtml {
  return html`<div class="segmented" role="group" aria-label="${label}">
    ${options.map((o) => html`<button type="button" data-action="${name}" data-value="${o.value}" aria-pressed="${o.value === current ? 'true' : 'false'}">${o.label}</button>`)}
  </div>`;
}

export function legend(items: Array<{ label: string; color: string; dashed?: boolean }>): SafeHtml {
  return html`<div class="chart-legend" role="list">
    ${items.map(
      (i) => html`<span class="chart-legend__item" role="listitem"><span class="chart-legend__key ${i.dashed ? 'is-dashed' : ''}" style="--key:${i.color}"></span>${i.label}</span>`,
    )}
  </div>`;
}
