/**
 * FinancialCalculator — TODAS as regras financeiras do app. Funções puras, sem DOM.
 * Nenhuma página calcula nada por conta própria.
 *
 * Regras fundamentais:
 *  - Saldo em contas ≠ patrimônio. Limite de cartão NÃO é patrimônio. Fatura NÃO é ativo.
 *  - Investimentos são contabilizados separadamente das contas.
 *  - Transferências entre contas próprias, pagamento de fatura e aplicações/resgates não são receita nem despesa.
 *  - Despesas em regime de competência: a compra no cartão conta na data da compra; o pagamento da fatura não conta de novo.
 *  - Moedas diferentes da moeda base nunca são somadas (não há conversão inventada).
 */
import type {
  AppCategoryId,
  NetWorthSnapshot,
  NormalizedAccount,
  NormalizedBill,
  NormalizedCard,
  NormalizedInvestment,
  NormalizedTransaction,
  InvestmentClass,
  PlannedEntry,
} from '../models/finance';
import { INVESTMENT_CLASS_LABEL } from '../models/finance';
import {
  type DateKey,
  addDays,
  addMonths,
  diffDays,
  eachDay,
  monthEnd,
  monthKey,
  monthStart,
  weekStart,
  addMonthsToMonthKey,
  nextDayOfMonth,
} from '../utils/dates';
import type { Recurrence } from './recurrence';
import { projectRecurrence } from './recurrence';

const BASE = 'BRL';
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CurrencyTotals {
  /** Total na moeda base. */
  base: number;
  /** Totais em outras moedas (não convertidos). */
  others: Record<string, number>;
}

function addTo(t: CurrencyTotals, currency: string, value: number, base: string): void {
  if (currency === base) t.base += value;
  else t.others[currency] = r2((t.others[currency] ?? 0) + value);
}

// ------------------------------------------------------------------ saldos e patrimônio

/** Soma SOMENTE saldos de contas bancárias (sem investimentos, limite ou fatura). */
export function calculateTotalBalance(accounts: NormalizedAccount[], base = BASE): CurrencyTotals {
  const t: CurrencyTotals = { base: 0, others: {} };
  for (const a of accounts) addTo(t, a.currency, a.balance, base);
  t.base = r2(t.base);
  return t;
}

/** Soma o valor líquido atual dos investimentos ativos. */
export function calculateTotalInvestments(investments: NormalizedInvestment[], base = BASE): CurrencyTotals {
  const t: CurrencyTotals = { base: 0, others: {} };
  for (const i of investments) {
    if (i.status === 'TOTAL_WITHDRAWAL') continue;
    addTo(t, i.currency, i.value, base);
  }
  t.base = r2(t.base);
  return t;
}

/** Dívida atual de um cartão: limite utilizado (limite − disponível) ou, na falta dele, o saldo informado pela instituição. */
export function cardDebt(card: NormalizedCard): number {
  if (card.usedLimit !== null) return card.usedLimit;
  return Math.max(0, card.institutionBalance);
}

export interface NetWorth {
  /** Ativos = contas com saldo positivo + investimentos. */
  assets: number;
  accounts: number;
  investments: number;
  /** Passivos = dívida de cartões + cheque especial usado (saldo negativo). */
  liabilities: number;
  cardDebt: number;
  overdraft: number;
  netWorth: number;
  /** Moedas presentes nos dados mas fora do total (sem conversão). */
  excludedCurrencies: string[];
}

export function calculateNetWorth(accounts: NormalizedAccount[], investments: NormalizedInvestment[], cards: NormalizedCard[], base = BASE): NetWorth {
  const excluded = new Set<string>();
  let acc = 0;
  let overdraft = 0;
  for (const a of accounts) {
    if (a.currency !== base) {
      excluded.add(a.currency);
      continue;
    }
    if (a.balance >= 0) acc += a.balance;
    else overdraft += -a.balance;
  }
  const inv = calculateTotalInvestments(investments, base);
  Object.keys(inv.others).forEach((c) => excluded.add(c));
  let debt = 0;
  for (const c of cards) {
    if (c.currency !== base) {
      excluded.add(c.currency);
      continue;
    }
    debt += cardDebt(c);
  }
  const assets = r2(acc + inv.base);
  const liabilities = r2(debt + overdraft);
  return {
    assets,
    accounts: r2(acc),
    investments: inv.base,
    liabilities,
    cardDebt: r2(debt),
    overdraft: r2(overdraft),
    netWorth: r2(assets - liabilities),
    excludedCurrencies: [...excluded],
  };
}

export interface CreditUtilization {
  limit: number;
  used: number;
  available: number;
  /** Fração 0..1 (null quando nenhum cartão informa limite). */
  utilization: number | null;
  cardsWithData: number;
  cardsWithoutData: number;
}

export function calculateCreditUtilization(cards: NormalizedCard[], base = BASE): CreditUtilization {
  let limit = 0;
  let available = 0;
  let withData = 0;
  let without = 0;
  for (const c of cards) {
    if (c.currency !== base || c.limit === null || c.availableLimit === null || c.limit <= 0) {
      without++;
      continue;
    }
    withData++;
    limit += c.limit;
    available += Math.min(c.availableLimit, c.limit);
  }
  const used = limit - available;
  return {
    limit: r2(limit),
    used: r2(used),
    available: r2(available),
    utilization: limit > 0 ? used / limit : null,
    cardsWithData: withData,
    cardsWithoutData: without,
  };
}

export function cardUtilization(card: NormalizedCard): number | null {
  if (card.limit === null || card.limit <= 0 || card.usedLimit === null) return null;
  return Math.min(1, Math.max(0, card.usedLimit / card.limit));
}

// ------------------------------------------------------------------ alocação

export interface AllocationSlice {
  key: 'contas' | InvestmentClass;
  group: 'contas' | 'investimentos';
  label: string;
  value: number;
  share: number;
}

/**
 * Distribuição dos recursos (ativos). Cada recurso aparece UMA vez:
 * contas (saldo positivo) + investimentos por classe. Cartões são passivos e ficam fora da distribuição de ativos.
 */
export function calculateAssetAllocation(accounts: NormalizedAccount[], investments: NormalizedInvestment[], base = BASE): { total: number; slices: AllocationSlice[] } {
  const accTotal = accounts.filter((a) => a.currency === base && a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const byClass = new Map<InvestmentClass, number>();
  for (const i of investments) {
    if (i.currency !== base || i.status === 'TOTAL_WITHDRAWAL' || i.value <= 0) continue;
    byClass.set(i.investmentClass, (byClass.get(i.investmentClass) ?? 0) + i.value);
  }
  const slices: AllocationSlice[] = [];
  if (accTotal > 0) slices.push({ key: 'contas', group: 'contas', label: 'Contas', value: r2(accTotal), share: 0 });
  const order: InvestmentClass[] = ['renda_fixa', 'fundos', 'acoes', 'etfs', 'previdencia', 'outros'];
  for (const k of order) {
    const v = byClass.get(k);
    if (v && v > 0) slices.push({ key: k, group: 'investimentos', label: INVESTMENT_CLASS_LABEL[k], value: r2(v), share: 0 });
  }
  const total = slices.reduce((s, x) => s + x.value, 0);
  for (const s of slices) s.share = total > 0 ? s.value / total : 0;
  return { total: r2(total), slices };
}

export function calculateInvestmentBreakdown(investments: NormalizedInvestment[], base = BASE): Array<{ key: InvestmentClass; label: string; value: number; share: number; count: number }> {
  const map = new Map<InvestmentClass, { value: number; count: number }>();
  for (const i of investments) {
    if (i.currency !== base || i.status === 'TOTAL_WITHDRAWAL') continue;
    const cur = map.get(i.investmentClass) ?? { value: 0, count: 0 };
    cur.value += i.value;
    cur.count++;
    map.set(i.investmentClass, cur);
  }
  const total = [...map.values()].reduce((s, v) => s + v.value, 0);
  const order: InvestmentClass[] = ['renda_fixa', 'fundos', 'acoes', 'etfs', 'previdencia', 'outros'];
  return order
    .filter((k) => map.has(k))
    .map((k) => {
      const v = map.get(k)!;
      return { key: k, label: INVESTMENT_CLASS_LABEL[k], value: r2(v.value), share: total > 0 ? v.value / total : 0, count: v.count };
    });
}

/** Rentabilidade agregada — só quando a instituição informa lucro E valor original. */
export function calculateInvestmentReturn(investments: NormalizedInvestment[], base = BASE): { profit: number; original: number; rate: number; coverage: number } | null {
  let profit = 0;
  let original = 0;
  let covered = 0;
  const active = investments.filter((i) => i.currency === base && i.status !== 'TOTAL_WITHDRAWAL');
  for (const i of active) {
    if (i.profit !== null && i.originalValue !== null && i.originalValue > 0) {
      profit += i.profit;
      original += i.originalValue;
      covered++;
    }
  }
  if (covered === 0 || original <= 0) return null;
  return { profit: r2(profit), original: r2(original), rate: profit / original, coverage: covered / active.length };
}

// ------------------------------------------------------------------ receitas, despesas, fluxo

/** Transações que entram no fluxo de caixa (exclui transferências próprias, pagamento de fatura, investimentos e ignoradas). */
export function isCashFlowRelevant(t: NormalizedTransaction, base = BASE): boolean {
  return !t.ignored && t.currency === base && (t.kind === 'income' || t.kind === 'expense');
}

export interface PeriodTotals {
  income: number;
  expenses: number;
  net: number;
}

/**
 * Totais de um período [start, end] (datas inclusivas).
 * `includePending`: inclui lançamentos pendentes/futuros (ex.: parcelas já conhecidas).
 */
export function calculatePeriodTotals(transactions: NormalizedTransaction[], start: DateKey, end: DateKey, includePending = true, base = BASE): PeriodTotals {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.date < start || t.date > end) continue;
    if (!includePending && t.status === 'pending') continue;
    if (!isCashFlowRelevant(t, base)) continue;
    if (t.kind === 'income') income += t.amount;
    else expenses += -t.amount; // estornos (positivos) reduzem a despesa
  }
  return { income: r2(income), expenses: r2(expenses), net: r2(income - expenses) };
}

export function calculateMonthlyIncome(transactions: NormalizedTransaction[], month: string, base = BASE): number {
  const start = `${month}-01`;
  return calculatePeriodTotals(transactions, start, monthEnd(start), false, base).income;
}

export function calculateMonthlyExpenses(transactions: NormalizedTransaction[], month: string, base = BASE): number {
  const start = `${month}-01`;
  return calculatePeriodTotals(transactions, start, monthEnd(start), false, base).expenses;
}

/** Taxa de poupança = (receitas − despesas) / receitas. Null quando não há receitas. */
export function calculateSavingsRate(income: number, expenses: number): number | null {
  if (!(income > 0)) return null;
  return (income - expenses) / income;
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface CashFlowBucket {
  key: string;
  start: DateKey;
  end: DateKey;
  income: number;
  expenses: number;
  net: number;
}

function bucketStart(date: DateKey, g: Granularity): DateKey {
  switch (g) {
    case 'day':
      return date;
    case 'week':
      return weekStart(date);
    case 'month':
      return monthStart(date);
    case 'year':
      return `${date.slice(0, 4)}-01-01`;
  }
}

function nextBucket(start: DateKey, g: Granularity): DateKey {
  switch (g) {
    case 'day':
      return addDays(start, 1);
    case 'week':
      return addDays(start, 7);
    case 'month':
      return addMonths(start, 1);
    case 'year':
      return addMonths(start, 12);
  }
}

/** Fluxo de caixa agrupado (dia/semana/mês/ano), incluindo buckets vazios no intervalo. */
export function calculateCashFlow(
  transactions: NormalizedTransaction[],
  opts: { granularity: Granularity; start: DateKey; end: DateKey; includePending?: boolean; base?: string },
): CashFlowBucket[] {
  const { granularity: g, start, end, includePending = false, base = BASE } = opts;
  const buckets = new Map<string, CashFlowBucket>();
  let cur = bucketStart(start, g);
  for (let guard = 0; cur <= end && guard < 2000; guard++) {
    const nxt = nextBucket(cur, g);
    buckets.set(cur, { key: cur, start: cur, end: addDays(nxt, -1), income: 0, expenses: 0, net: 0 });
    cur = nxt;
  }
  for (const t of transactions) {
    if (t.date < start || t.date > end) continue;
    if (!includePending && t.status === 'pending') continue;
    if (!isCashFlowRelevant(t, base)) continue;
    const b = buckets.get(bucketStart(t.date, g));
    if (!b) continue;
    if (t.kind === 'income') b.income += t.amount;
    else b.expenses += -t.amount;
  }
  return [...buckets.values()].map((b) => ({ ...b, income: r2(b.income), expenses: r2(b.expenses), net: r2(b.income - b.expenses) }));
}

export interface CategoryShare {
  category: AppCategoryId;
  total: number;
  share: number;
  count: number;
}

/** Despesas por categoria no período (maior → menor). */
export function calculateCategoryBreakdown(transactions: NormalizedTransaction[], start: DateKey, end: DateKey, base = BASE): CategoryShare[] {
  const map = new Map<AppCategoryId, { total: number; count: number }>();
  for (const t of transactions) {
    if (t.date < start || t.date > end || t.status === 'pending' || !isCashFlowRelevant(t, base) || t.kind !== 'expense') continue;
    const cur = map.get(t.category) ?? { total: 0, count: 0 };
    cur.total += -t.amount;
    cur.count++;
    map.set(t.category, cur);
  }
  const positive = [...map.entries()].filter(([, v]) => v.total > 0.004);
  const total = positive.reduce((s, [, v]) => s + v.total, 0);
  return positive
    .map(([category, v]) => ({ category, total: r2(v.total), share: total > 0 ? v.total / total : 0, count: v.count }))
    .sort((a, b) => b.total - a.total);
}

/** Gasto médio diário no período (despesas / dias decorridos). */
export function calculateAverageDailyExpense(transactions: NormalizedTransaction[], start: DateKey, end: DateKey, base = BASE): number {
  const days = diffDays(start, end) + 1;
  if (days <= 0) return 0;
  return r2(calculatePeriodTotals(transactions, start, end, false, base).expenses / days);
}

// ------------------------------------------------------------------ faturas

export interface CardCycle {
  cardId: string;
  /** Primeiro dia do ciclo aberto. */
  start: DateKey;
  closing: DateKey;
  due: DateKey;
  /** true quando datas foram inferidas (instituição não informou ou ciclo informado já fechou). */
  estimated: boolean;
  /** Origem das datas: instituição, dias definidos pelo usuário ou histórico de faturas. */
  source: 'institution' | 'user' | 'history';
}

/**
 * Ciclo da fatura aberta. Prioridade das datas:
 *  1. balanceCloseDate/balanceDueDate informados pela instituição;
 *  2. dias de fechamento/vencimento definidos pelo usuário (quando a instituição não informa);
 *  3. última fatura fechada + 1 mês (estimado).
 * O início é o dia seguinte ao fechamento da última fatura fechada (ou fechamento − 1 mês).
 */
export function getCardCycle(card: NormalizedCard, bills: NormalizedBill[], today: DateKey): CardCycle | null {
  let closing = card.closingDate;
  let due = card.dueDate;
  let estimated = false;
  let source: CardCycle['source'] = 'institution';
  const manualClosing = card.manualClosingDay ?? null;
  const manualDue = card.manualDueDay ?? null;
  const cardBills = bills.filter((b) => b.cardId === card.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!closing && manualClosing) {
    closing = nextDayOfMonth(today, manualClosing);
    source = 'user';
  }
  if (!closing) {
    const lastClosed = [...cardBills].reverse().find((b) => b.closingDate);
    if (!lastClosed?.closingDate) return null;
    closing = addMonths(lastClosed.closingDate, 1);
    due = addMonths(lastClosed.dueDate, 1);
    estimated = true;
    source = 'history';
  }
  // Ciclo informado já fechou (dados antigos) → projeta o próximo.
  let guard = 0;
  while (closing < today && guard++ < 24) {
    closing = addMonths(closing, 1);
    if (due) due = addMonths(due, 1);
    estimated = true;
  }
  if (!due || (source === 'user' && manualDue)) {
    if (manualDue) {
      due = nextDayOfMonth(addDays(closing, 1), manualDue);
    } else {
      due = addDays(closing, 7);
      estimated = true;
    }
  }
  const previousClosed = [...cardBills].reverse().find((b) => b.closingDate && b.closingDate < closing!);
  const start = previousClosed?.closingDate && diffDays(previousClosed.closingDate, closing) <= 40 && diffDays(previousClosed.closingDate, closing) >= 20
    ? addDays(previousClosed.closingDate, 1)
    : addDays(addMonths(closing, -1), 1);
  return { cardId: card.id, start, closing, due, estimated, source };
}

export interface CardBillSummary {
  card: NormalizedCard;
  cycle: CardCycle;
  /** Lançado até hoje no ciclo (compras − estornos). */
  launched: number;
  /** Lançamentos futuros já conhecidos no ciclo (ex.: parcelas). */
  future: number;
  total: number;
  transactions: NormalizedTransaction[];
}

/** Pertence ao ciclo aberto? Prioriza billForecast (Open Finance), depois a janela de datas; ignora itens de faturas fechadas (billId). */
function inCycle(t: NormalizedTransaction, cycle: CardCycle, closedBillIds: Set<string>): boolean {
  if (t.billId && closedBillIds.has(t.billId)) return false;
  // billForecast (YYYY-MM) identifica o período da fatura; comparamos com o mês de vencimento do ciclo aberto.
  if (t.billForecast) return t.billForecast === monthKey(cycle.due);
  return t.date >= cycle.start && t.date <= cycle.closing;
}

export function calculateCurrentBills(cards: NormalizedCard[], transactions: NormalizedTransaction[], bills: NormalizedBill[], today: DateKey): CardBillSummary[] {
  const closedIds = new Set(bills.map((b) => b.id));
  const out: CardBillSummary[] = [];
  for (const card of cards) {
    const cycle = getCardCycle(card, bills, today);
    if (!cycle) continue;
    const txs = transactions.filter((t) => t.cardId === card.id && t.kind === 'expense' && !t.ignored && inCycle(t, cycle, closedIds));
    let launched = 0;
    let future = 0;
    for (const t of txs) {
      const v = -t.amount; // compra positiva, estorno negativo
      // Com data até hoje (lançado ou pendente) = já lançado; data futura = parcela/lançamento futuro conhecido.
      if (t.date <= today) launched += v;
      else future += v;
    }
    out.push({ card, cycle, launched: r2(launched), future: r2(future), total: r2(launched + future), transactions: txs.sort((a, b) => a.date.localeCompare(b.date)) });
  }
  return out;
}

export interface BillProjection {
  launched: number;
  future: number;
  forecast: number;
  /** "Se você continuar gastando neste ritmo..." */
  paceForecast: number;
  dailyAverage: number;
  daysElapsed: number;
  daysRemaining: number;
  series: Array<{ date: DateKey; actual: number | null; projected: number | null }>;
}

/**
 * Previsão da fatura aberta.
 *  - forecast = lançado + lançamentos futuros conhecidos (parcelas)
 *  - paceForecast = forecast + média diária de compras novas × dias restantes até o fechamento
 *    (parcelas de compras antigas não entram na média, para não inflar o ritmo)
 */
export function calculateProjectedBill(summary: CardBillSummary, today: DateKey): BillProjection {
  const { cycle } = summary;
  const effectiveToday = today < cycle.start ? cycle.start : today > cycle.closing ? cycle.closing : today;
  const daysElapsed = Math.max(1, diffDays(cycle.start, effectiveToday) + 1);
  const daysRemaining = Math.max(0, diffDays(effectiveToday, cycle.closing));
  const newPurchases = summary.transactions
    .filter((t) => t.date <= effectiveToday && (!t.installment || t.installment.number === 1))
    .reduce((s, t) => s + -t.amount, 0);
  const dailyAverage = Math.max(0, newPurchases / daysElapsed);
  const forecast = summary.launched + summary.future;
  const paceForecast = forecast + dailyAverage * daysRemaining;

  // Série diária acumulada (real até hoje; projeção linear depois).
  const byDay = new Map<DateKey, number>();
  for (const t of summary.transactions) byDay.set(t.date, (byDay.get(t.date) ?? 0) + -t.amount);
  const series: BillProjection['series'] = [];
  let acc = 0;
  let projected = 0;
  for (const d of eachDay(cycle.start, cycle.closing)) {
    if (d <= effectiveToday) {
      acc += byDay.get(d) ?? 0;
      series.push({ date: d, actual: r2(acc), projected: d === effectiveToday ? r2(acc) : null });
      projected = acc;
    } else {
      projected += dailyAverage + (byDay.get(d) ?? 0);
      series.push({ date: d, actual: null, projected: r2(projected) });
    }
  }
  return {
    launched: summary.launched,
    future: summary.future,
    forecast: r2(forecast),
    paceForecast: r2(paceForecast),
    dailyAverage: r2(dailyAverage),
    daysElapsed,
    daysRemaining,
    series,
  };
}

/** Parcelas/lançamentos futuros além do ciclo aberto, agrupados por mês de vencimento estimado. */
export function calculateFutureCardCharges(summary: CardBillSummary, transactions: NormalizedTransaction[], months = 6): Array<{ month: string; due: DateKey; total: number; count: number }> {
  const out: Array<{ month: string; due: DateKey; total: number; count: number }> = [];
  for (let i = 1; i <= months; i++) {
    const closing = addMonths(summary.cycle.closing, i);
    const start = addDays(addMonths(summary.cycle.closing, i - 1), 1);
    const due = addMonths(summary.cycle.due, i);
    let total = 0;
    let count = 0;
    for (const t of transactions) {
      if (t.cardId !== summary.card.id || t.kind !== 'expense' || t.ignored) continue;
      const match = t.billForecast ? t.billForecast === monthKey(due) : t.date >= start && t.date <= closing;
      if (!match) continue;
      total += -t.amount;
      count++;
    }
    if (count > 0) out.push({ month: monthKey(due), due, total: r2(total), count });
  }
  return out;
}

/** Soma das faturas abertas (lançado) de todos os cartões — é passivo, nunca ativo. */
export function calculateOpenBillsTotal(summaries: CardBillSummary[], base = BASE): number {
  return r2(summaries.filter((s) => s.card.currency === base).reduce((s, x) => s + x.total, 0));
}

// ------------------------------------------------------------------ projeção de saldo

export type ProjectionEventKind = 'income' | 'expense' | 'bill';

export interface ProjectionEvent {
  date: DateKey;
  amount: number; // + entra, − sai
  label: string;
  kind: ProjectionEventKind;
  certainty: 'confirmed' | 'estimated';
  origin: 'scheduled' | 'bill' | 'recurrence' | 'planned';
}

/**
 * Eventos conhecidos para a projeção de saldo (regime de caixa):
 *  - lançamentos bancários futuros já informados (agendados)
 *  - faturas: aberta (previsão) no vencimento + fechadas não pagas + parcelas futuras conhecidas
 *  - recorrências detectadas no histórico (estimadas, opcionais)
 *  - lançamentos previstos manuais do usuário
 */
export function buildProjectionEvents(input: {
  today: DateKey;
  days: number;
  transactions: NormalizedTransaction[];
  billSummaries: CardBillSummary[];
  bills: NormalizedBill[];
  recurrences: Recurrence[];
  planned: PlannedEntry[];
  includeEstimates: boolean;
  base?: string;
}): ProjectionEvent[] {
  const { today, days, base = BASE } = input;
  const end = addDays(today, days);
  const events: ProjectionEvent[] = [];

  for (const t of input.transactions) {
    if (t.source !== 'bank' || t.currency !== base || t.ignored) continue;
    if (t.date <= today || t.date > end) continue;
    if (t.kind === 'internal_transfer') continue;
    events.push({ date: t.date, amount: t.amount, label: t.description, kind: t.amount >= 0 ? 'income' : 'expense', certainty: 'confirmed', origin: 'scheduled' });
  }

  for (const s of input.billSummaries) {
    if (s.card.currency !== base) continue;
    if (s.cycle.due > today && s.cycle.due <= end && s.total > 0) {
      events.push({ date: s.cycle.due, amount: -s.total, label: `Fatura ${s.card.label ?? s.card.name}`, kind: 'bill', certainty: s.cycle.estimated ? 'estimated' : 'confirmed', origin: 'bill' });
    }
    for (const f of calculateFutureCardCharges(s, input.transactions, 4)) {
      if (f.due > today && f.due <= end) {
        events.push({ date: f.due, amount: -f.total, label: `Parcelas futuras ${s.card.label ?? s.card.name}`, kind: 'bill', certainty: 'confirmed', origin: 'bill' });
      }
    }
  }
  for (const b of input.bills) {
    if (b.isPaid || b.currency !== base || b.dueDate <= today || b.dueDate > end) continue;
    const remaining = r2(b.totalAmount - b.paidAmount);
    if (remaining > 0) events.push({ date: b.dueDate, amount: -remaining, label: 'Fatura fechada a pagar', kind: 'bill', certainty: 'confirmed', origin: 'bill' });
  }

  if (input.includeEstimates) {
    for (const r of input.recurrences) {
      if (r.source !== 'bank') continue; // gastos recorrentes no cartão já chegam via fatura
      for (const d of projectRecurrence(r, addDays(today, 1), end)) {
        events.push({ date: d, amount: r.averageAmount, label: r.label, kind: r.averageAmount >= 0 ? 'income' : 'expense', certainty: 'estimated', origin: 'recurrence' });
      }
    }
  }

  for (const p of input.planned) {
    for (const d of plannedDates(p, today, end)) {
      events.push({ date: d, amount: p.amount, label: p.description, kind: p.amount >= 0 ? 'income' : 'expense', certainty: 'confirmed', origin: 'planned' });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export interface BalanceProjection {
  start: number;
  end: number;
  min: number;
  minDate: DateKey;
  income: number;
  expenses: number;
  bills: number;
  series: Array<{ date: DateKey; balance: number }>;
}

/** Saldo projetado = saldo atual + receitas previstas − despesas previstas − faturas. */
export function calculateProjectedBalance(startBalance: number, today: DateKey, days: number, events: ProjectionEvent[]): BalanceProjection {
  const end = addDays(today, days);
  const byDay = new Map<DateKey, number>();
  let income = 0;
  let expenses = 0;
  let bills = 0;
  for (const e of events) {
    if (e.date <= today || e.date > end) continue;
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);
    if (e.kind === 'bill') bills += -e.amount;
    else if (e.amount >= 0) income += e.amount;
    else expenses += -e.amount;
  }
  let bal = startBalance;
  let min = startBalance;
  let minDate = today;
  const series = [{ date: today, balance: r2(bal) }];
  for (const d of eachDay(addDays(today, 1), end)) {
    bal += byDay.get(d) ?? 0;
    if (bal < min) {
      min = bal;
      minDate = d;
    }
    series.push({ date: d, balance: r2(bal) });
  }
  return { start: r2(startBalance), end: r2(bal), min: r2(min), minDate, income: r2(income), expenses: r2(expenses), bills: r2(bills), series };
}

// ------------------------------------------------------------------ histórico

/**
 * Reconstrói o saldo diário das contas a partir das transações:
 * saldo(d) = saldo atual − Σ transações lançadas depois de d. Apenas contas na moeda base.
 */
export function reconstructBalanceHistory(accounts: NormalizedAccount[], transactions: NormalizedTransaction[], start: DateKey, today: DateKey, base = BASE): Array<{ date: DateKey; balance: number }> {
  const ids = new Set(accounts.filter((a) => a.currency === base).map((a) => a.id));
  const current = accounts.filter((a) => ids.has(a.id)).reduce((s, a) => s + a.balance, 0);
  const byDay = new Map<DateKey, number>();
  for (const t of transactions) {
    if (!t.accountId || !ids.has(t.accountId) || t.status !== 'posted' || t.date > today) continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
  }
  const days = eachDay(start, today);
  const out: Array<{ date: DateKey; balance: number }> = new Array(days.length);
  let bal = current;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]!;
    out[i] = { date: d, balance: r2(bal) };
    bal -= byDay.get(d) ?? 0;
  }
  return out;
}

export function calculateNetWorthGrowth(snapshots: NetWorthSnapshot[], currentNetWorth: number, today: DateKey, periodDays: number): { from: DateKey; startValue: number; change: number; pct: number | null } | null {
  if (!snapshots.length) return null;
  const target = addDays(today, -periodDays);
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  // snapshot mais próximo do início do período (no máximo 45 dias de diferença), excluindo hoje
  let best: NetWorthSnapshot | null = null;
  for (const s of sorted) {
    if (s.date >= today) continue;
    if (!best || Math.abs(diffDays(s.date, target)) < Math.abs(diffDays(best.date, target))) best = s;
  }
  if (!best || Math.abs(diffDays(best.date, target)) > 45) return null;
  const change = currentNetWorth - best.netWorth;
  return { from: best.date, startValue: best.netWorth, change: r2(change), pct: best.netWorth !== 0 ? change / Math.abs(best.netWorth) : null };
}

export function createSnapshot(date: DateKey, nw: NetWorth, base = BASE): NetWorthSnapshot {
  return { date, accounts: nw.accounts - nw.overdraft, investments: nw.investments, cardDebt: nw.cardDebt, netWorth: nw.netWorth, currency: base };
}

export function upsertSnapshot(list: NetWorthSnapshot[], snap: NetWorthSnapshot, max = 1100): NetWorthSnapshot[] {
  const out = list.filter((s) => s.date !== snap.date);
  out.push(snap);
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(-max);
}

/** Receitas e despesas do mês: realizadas + previstas (recorrências ainda não ocorridas + lançamentos previstos). */
export function calculateMonthOutlook(input: {
  today: DateKey;
  transactions: NormalizedTransaction[];
  recurrences: Recurrence[];
  planned: PlannedEntry[];
  includeEstimates: boolean;
  base?: string;
}): { month: string; realizedIncome: number; expectedIncome: number; realizedExpenses: number; expectedExpenses: number } {
  const { today, base = BASE } = input;
  const start = monthStart(today);
  const end = monthEnd(today);
  const realized = calculatePeriodTotals(input.transactions, start, today, true, base);
  const future = calculatePeriodTotals(input.transactions, addDays(today, 1), end, true, base);
  let expIn = future.income;
  let expOut = future.expenses;
  if (input.includeEstimates) {
    for (const r of input.recurrences) {
      const n = projectRecurrence(r, addDays(today, 1), end).length;
      if (!n) continue;
      if (r.averageAmount >= 0) expIn += r.averageAmount * n;
      else expOut += -r.averageAmount * n;
    }
  }
  for (const p of input.planned) {
    const hits = plannedDates(p, today, end);
    if (p.amount >= 0) expIn += p.amount * hits.length;
    else expOut += -p.amount * hits.length;
  }
  return {
    month: monthKey(today),
    realizedIncome: realized.income,
    expectedIncome: r2(expIn),
    realizedExpenses: realized.expenses,
    expectedExpenses: r2(expOut),
  };
}

/** Datas (após `after`, até `end`) em que um lançamento previsto manual ocorre. */
export function plannedDates(p: PlannedEntry, after: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  if (p.recurrence === 'monthly') {
    for (let i = 0; i < 60; i++) {
      const d = addMonths(p.date, i);
      if (d > end) break;
      if (d > after) out.push(d);
    }
  } else if (p.date > after && p.date <= end) {
    out.push(p.date);
  }
  return out;
}

/** Meses de uma janela (para gráficos mensais). */
export function lastMonths(today: DateKey, count: number): string[] {
  const cur = monthKey(today);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addMonthsToMonthKey(cur, -i));
  return out;
}

/** Fachada com o nome pedido na especificação. */
export const FinancialCalculator = {
  calculateTotalBalance,
  calculateTotalInvestments,
  calculateNetWorth,
  calculateCreditUtilization,
  calculateCurrentBills,
  calculateProjectedBill,
  calculateProjectedBalance,
  calculateMonthlyIncome,
  calculateMonthlyExpenses,
  calculateSavingsRate,
  calculateCashFlow,
  calculateAssetAllocation,
  calculateCategoryBreakdown,
  calculatePeriodTotals,
  calculateAverageDailyExpense,
  calculateInvestmentBreakdown,
  calculateInvestmentReturn,
  calculateNetWorthGrowth,
  calculateMonthOutlook,
  buildProjectionEvents,
  reconstructBalanceHistory,
  getCardCycle,
  cardDebt,
  cardUtilization,
};
