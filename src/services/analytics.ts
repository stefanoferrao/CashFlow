/**
 * Agregações derivadas usadas pelas páginas. Tudo delega ao FinancialCalculator;
 * aqui apenas se compõe e se memoiza (recalcula só quando os dados mudam).
 */
import type { FinancialDataset, NormalizedTransaction, PlannedEntry, UserCategorization } from '../models/finance';
import { addDays, diffDays, monthEnd, monthStart, todayKey, type DateKey } from '../utils/dates';
import { applyUserCategorization } from './categories';
import {
  type AllocationSlice,
  type BillProjection,
  type CardBillSummary,
  type CategoryShare,
  type CreditUtilization,
  type CurrencyTotals,
  type InvestmentPerformanceSummary,
  type NetWorth,
  type OpenBillsOverview,
  type PeriodTotals,
  type ProjectionEvent,
  buildProjectionEvents,
  calculateAssetAllocation,
  calculateAverageDailyExpense,
  calculateCategoryBreakdown,
  calculateCreditUtilization,
  calculateCurrentBills,
  calculateInvestmentBreakdown,
  calculateInvestmentPerformance,
  calculateMonthOutlook,
  calculateNetWorth,
  calculateNetWorthGrowth,
  calculateOpenBillsOverview,
  calculatePeriodTotals,
  calculateProjectedBill,
  calculateSavingsRate,
  calculateTotalBalance,
  calculateTotalInvestments,
} from './financialCalculator';
import { type Insight, generateInsights } from './insights';
import { type Recurrence, detectRecurrences } from './recurrence';

export interface Analytics {
  today: DateKey;
  transactions: NormalizedTransaction[];
  totalBalance: CurrencyTotals;
  totalInvestments: CurrencyTotals;
  netWorth: NetWorth;
  netWorthGrowth30: ReturnType<typeof calculateNetWorthGrowth>;
  credit: CreditUtilization;
  allocation: { total: number; slices: AllocationSlice[] };
  investmentBreakdown: ReturnType<typeof calculateInvestmentBreakdown>;
  /** Rendimento da carteira: aplicado × valor atual, só com base confiável (ver calculateInvestmentPerformance). */
  investmentPerformance: InvestmentPerformanceSummary;
  bills: CardBillSummary[];
  billProjections: Record<string, BillProjection>;
  openBillsTotal: number;
  /** Todas as faturas abertas somadas + o valor de cada cartão. */
  openBills: OpenBillsOverview;
  month: PeriodTotals;
  /** Mesmo intervalo de dias do mês anterior (comparação justa). */
  previousMonthToDate: PeriodTotals;
  outlook: ReturnType<typeof calculateMonthOutlook>;
  savingsRate: number | null;
  categoryMonth: CategoryShare[];
  averageDailyExpense: number;
  recurrences: Recurrence[];
  upcoming: ProjectionEvent[];
  insights: Insight[];
}

let cacheKey: unknown[] = [];
let cacheValue: Analytics | null = null;

export function computeAnalytics(
  ds: FinancialDataset,
  uc: UserCategorization,
  planned: PlannedEntry[],
  includeEstimates: boolean,
  today: DateKey = todayKey(),
): Analytics {
  const key = [ds, uc, planned, includeEstimates, today];
  if (cacheValue && key.every((k, i) => k === cacheKey[i])) return cacheValue;

  const transactions = applyUserCategorization(ds.transactions, uc);
  const totalBalance = calculateTotalBalance(ds.accounts);
  const totalInvestments = calculateTotalInvestments(ds.investments);
  const netWorth = calculateNetWorth(ds.accounts, ds.investments, ds.cards);
  const bills = calculateCurrentBills(ds.cards, transactions, ds.bills, today);
  const billProjections: Record<string, BillProjection> = {};
  for (const b of bills) billProjections[b.card.id] = calculateProjectedBill(b, today);
  const mStart = monthStart(today);
  const month = calculatePeriodTotals(transactions, mStart, today, false);
  const prevStart = monthStart(addDays(mStart, -1));
  const elapsed = diffDays(mStart, today);
  const prevEndCandidate = addDays(prevStart, elapsed);
  const prevEnd = prevEndCandidate > monthEnd(prevStart) ? monthEnd(prevStart) : prevEndCandidate;
  const previousMonthToDate = calculatePeriodTotals(transactions, prevStart, prevEnd, false);
  const recurrences = detectRecurrences(transactions, today);
  const outlook = calculateMonthOutlook({ today, transactions, recurrences, planned, includeEstimates });
  const upcoming = buildProjectionEvents({
    today,
    days: 30,
    transactions,
    billSummaries: bills,
    bills: ds.bills,
    recurrences,
    planned,
    includeEstimates,
  }).filter((e) => e.amount < 0);

  const partial = {
    today,
    transactions,
    totalBalance,
    totalInvestments,
    netWorth,
    netWorthGrowth30: calculateNetWorthGrowth(ds.snapshots, netWorth.netWorth, today, 30),
    credit: calculateCreditUtilization(ds.cards),
    allocation: calculateAssetAllocation(ds.accounts, ds.investments),
    investmentBreakdown: calculateInvestmentBreakdown(ds.investments),
    investmentPerformance: calculateInvestmentPerformance(ds.investments, today),
    bills,
    billProjections,
    openBillsTotal: Math.round(bills.filter((b) => b.card.currency === 'BRL').reduce((s, b) => s + b.total, 0) * 100) / 100,
    openBills: calculateOpenBillsOverview(ds.cards, bills, billProjections, ds.bills, today),
    month,
    previousMonthToDate,
    outlook,
    savingsRate: calculateSavingsRate(month.income, month.expenses),
    categoryMonth: calculateCategoryBreakdown(transactions, mStart, today),
    averageDailyExpense: calculateAverageDailyExpense(transactions, mStart, today),
    recurrences,
    upcoming,
  };
  const value: Analytics = { ...partial, insights: generateInsights(partial, ds) };
  cacheKey = key;
  cacheValue = value;
  return value;
}
