/**
 * Consulta de transações (filtros, busca, ordenação, paginação) — lógica pura, fora da UI.
 */
import type { AppCategoryId, NormalizedTransaction } from '../models/finance';
import { addDays, addMonths, monthEnd, monthStart, type DateKey } from '../utils/dates';
import { normalizeText } from './categories';

export type PeriodPreset = 'month' | 'prev' | '30' | '90' | '365' | 'all' | 'custom';
export type TypeFilter = 'all' | 'in' | 'out' | 'internal' | 'card_payment' | 'investment' | 'pending' | 'ignored';
export type SortKey = 'date' | 'description' | 'amount' | 'category';

export interface TxFilters {
  q: string;
  period: PeriodPreset;
  from: DateKey | null;
  to: DateKey | null;
  account: string;
  card: string;
  institution: string;
  category: AppCategoryId | '';
  type: TypeFilter;
  min: number | null;
  max: number | null;
}

export const defaultFilters = (): TxFilters => ({
  q: '',
  period: '90',
  from: null,
  to: null,
  account: '',
  card: '',
  institution: '',
  category: '',
  type: 'all',
  min: null,
  max: null,
});

export function periodRange(f: Pick<TxFilters, 'period' | 'from' | 'to'> & { type?: TypeFilter }, today: DateKey): { from: DateKey | null; to: DateKey | null } {
  // "Últimos N dias" termina hoje; lançamentos futuros aparecem em "Tudo" ou no tipo "Pendentes/futuras".
  const end = f.type === 'pending' ? null : today;
  switch (f.period) {
    case 'month':
      return { from: monthStart(today), to: monthEnd(today) };
    case 'prev': {
      const s = addMonths(monthStart(today), -1);
      return { from: s, to: monthEnd(s) };
    }
    case '30':
      return { from: addDays(today, -29), to: end };
    case '90':
      return { from: addDays(today, -89), to: end };
    case '365':
      return { from: addDays(today, -364), to: end };
    case 'custom':
      return { from: f.from, to: f.to };
    default:
      return { from: null, to: null };
  }
}

export function filterTransactions(txs: NormalizedTransaction[], f: TxFilters, today: DateKey, labels: (t: NormalizedTransaction) => string = () => ''): NormalizedTransaction[] {
  const { from, to } = periodRange(f, today);
  const q = normalizeText(f.q.trim());
  const terms = q ? q.split(/\s+/) : [];
  return txs.filter((t) => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (f.account && t.accountId !== f.account) return false;
    if (f.card && t.cardId !== f.card) return false;
    if (f.institution && t.institution !== f.institution) return false;
    if (f.category && t.category !== f.category) return false;
    const abs = Math.abs(t.amount);
    if (f.min !== null && abs < f.min) return false;
    if (f.max !== null && abs > f.max) return false;
    switch (f.type) {
      case 'in':
        if (!(t.amount > 0 && t.kind !== 'internal_transfer' && t.kind !== 'card_payment')) return false;
        break;
      case 'out':
        if (!(t.amount < 0 && t.kind !== 'internal_transfer' && t.kind !== 'card_payment')) return false;
        break;
      case 'internal':
        if (t.kind !== 'internal_transfer') return false;
        break;
      case 'card_payment':
        if (t.kind !== 'card_payment') return false;
        break;
      case 'investment':
        if (t.kind !== 'investment') return false;
        break;
      case 'pending':
        if (t.status !== 'pending') return false;
        break;
      case 'ignored':
        if (!t.ignored) return false;
        break;
    }
    if (terms.length) {
      const hay = normalizeText(`${t.description} ${t.merchant ?? ''} ${t.subcategory ?? ''} ${t.providerCategory ?? ''} ${labels(t)}`);
      if (!terms.every((term) => hay.includes(term))) return false;
    }
    return true;
  });
}

export function sortTransactions(txs: NormalizedTransaction[], key: SortKey, dir: 'asc' | 'desc', categoryLabel: (id: AppCategoryId) => string): NormalizedTransaction[] {
  const m = dir === 'asc' ? 1 : -1;
  const out = [...txs];
  out.sort((a, b) => {
    let c = 0;
    if (key === 'date') c = a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    else if (key === 'amount') c = a.amount - b.amount;
    else if (key === 'description') c = a.description.localeCompare(b.description, 'pt-BR');
    else c = categoryLabel(a.category).localeCompare(categoryLabel(b.category), 'pt-BR');
    return c * m;
  });
  return out;
}

export interface TxSummary {
  count: number;
  inflow: number;
  outflow: number;
  net: number;
  /** Transações em outras moedas (fora da soma). */
  otherCurrency: number;
}

export function summarizeTransactions(txs: NormalizedTransaction[], base = 'BRL'): TxSummary {
  let inflow = 0;
  let outflow = 0;
  let other = 0;
  for (const t of txs) {
    if (t.currency !== base) {
      other++;
      continue;
    }
    if (t.amount >= 0) inflow += t.amount;
    else outflow += -t.amount;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { count: txs.length, inflow: r(inflow), outflow: r(outflow), net: r(inflow - outflow), otherCurrency: other };
}

export function paginate<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * size, p * size), page: p, pages };
}
