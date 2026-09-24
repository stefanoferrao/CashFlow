/**
 * Insights gerados SOMENTE a partir dos dados existentes.
 * Sem recomendações de investimento, sem informações inventadas.
 * Cada insight declara o dado que o sustenta.
 */
import type { FinancialDataset } from '../models/finance';
import { CATEGORY_BY_ID } from '../models/finance';
import { diffDays, type DateKey } from '../utils/dates';
import { formatDate, formatMoney, formatPercent } from '../utils/format';
import type { Analytics } from './analytics';

export interface Insight {
  id: string;
  tone: 'neutral' | 'positive' | 'attention';
  icon: string;
  text: string;
  /** De onde vem o número (transparência). */
  basis: string;
}

type Input = Omit<Analytics, 'insights'>;

export function generateInsights(a: Input, ds: FinancialDataset): Insight[] {
  const out: Insight[] = [];
  const hasTx = a.transactions.length > 0;

  // 1. Maior categoria de gasto do mês
  const top = a.categoryMonth[0];
  if (top && a.month.expenses > 0) {
    out.push({
      id: 'top-category',
      tone: 'neutral',
      icon: 'pie',
      text: `Seus gastos com ${CATEGORY_BY_ID[top.category].label} representam ${formatPercent(top.share)} das despesas deste mês.`,
      basis: `${top.count} transações categorizadas neste mês`,
    });
  }

  // 2. Utilização média dos cartões
  if (a.credit.utilization !== null) {
    const u = a.credit.utilization;
    out.push({
      id: 'credit-utilization',
      tone: u >= 0.7 ? 'attention' : 'neutral',
      icon: 'card',
      text: `A utilização média dos cartões está em ${formatPercent(u)} (${formatMoney(a.credit.used)} de ${formatMoney(a.credit.limit)}).`,
      basis: `Limites informados por ${a.credit.cardsWithData} cartão(ões)`,
    });
  }

  // 3. Variação patrimonial (somente com histórico local suficiente)
  const g = a.netWorthGrowth30;
  if (g) {
    const up = g.change >= 0;
    out.push({
      id: 'net-worth-growth',
      tone: up ? 'positive' : 'attention',
      icon: 'trending',
      text: `Seu patrimônio ${up ? 'aumentou' : 'diminuiu'} ${formatMoney(Math.abs(g.change))} desde ${formatDate(g.from)}.`,
      basis: 'Comparação com o registro local de patrimônio',
    });
  }

  // 4. Despesas vs mesmo período do mês anterior
  const prev = a.previousMonthToDate.expenses;
  if (hasTx && prev > 0 && a.month.expenses > 0) {
    const diff = (a.month.expenses - prev) / prev;
    if (Math.abs(diff) >= 0.05) {
      out.push({
        id: 'expenses-vs-previous',
        tone: diff > 0 ? 'attention' : 'positive',
        icon: diff > 0 ? 'arrowUpRight' : 'arrowDownRight',
        text: `Suas despesas deste mês estão ${formatPercent(Math.abs(diff))} ${diff > 0 ? 'acima' : 'abaixo'} do mesmo período do mês anterior.`,
        basis: `${formatMoney(a.month.expenses)} agora × ${formatMoney(prev)} no mesmo intervalo do mês passado`,
      });
    }
  }

  // 5. Taxa de poupança
  if (a.savingsRate !== null) {
    out.push({
      id: 'savings-rate',
      tone: a.savingsRate >= 0 ? 'positive' : 'attention',
      icon: 'target',
      text:
        a.savingsRate >= 0
          ? `Neste mês, você guardou ${formatPercent(a.savingsRate)} do que recebeu.`
          : `Neste mês, suas despesas superaram as receitas em ${formatMoney(a.month.expenses - a.month.income)}.`,
      basis: 'Receitas e despesas lançadas no mês (sem transferências próprias, faturas e aplicações)',
    });
  }

  // 6. Fatura com vencimento próximo
  const soon = a.bills
    .filter((b) => b.total > 0 && diffDays(a.today, b.cycle.due) >= 0 && diffDays(a.today, b.cycle.due) <= 10)
    .sort((x, y) => x.cycle.due.localeCompare(y.cycle.due))[0];
  if (soon) {
    const days = diffDays(a.today, soon.cycle.due);
    out.push({
      id: 'bill-due-soon',
      tone: 'attention',
      icon: 'calendar',
      text: `A fatura do ${soon.card.label ?? soon.card.name} vence ${days === 0 ? 'hoje' : `em ${days} ${days === 1 ? 'dia' : 'dias'}`} (${formatDate(soon.cycle.due)}), com ${formatMoney(soon.total)} lançados até agora.`,
      basis: soon.cycle.source === 'user' ? 'Dias de fechamento e vencimento definidos por você' : soon.cycle.estimated ? 'Datas estimadas a partir do último ciclo' : 'Datas informadas pela instituição',
    });
  }

  // 7. Assinaturas recorrentes
  const subs = a.recurrences.filter((r) => r.averageAmount < 0 && r.category === 'assinaturas');
  if (subs.length) {
    const monthly = subs.reduce((s, r) => s + (r.cadence === 'monthly' ? -r.averageAmount : (-r.averageAmount * 30) / r.intervalDays), 0);
    out.push({
      id: 'subscriptions',
      tone: 'neutral',
      icon: 'repeat',
      text: `Identificamos ${subs.length} assinatura(s) recorrente(s), somando cerca de ${formatMoney(monthly)} por mês.`,
      basis: 'Lançamentos com mesma descrição e valor em intervalos regulares',
    });
  }

  // 8. Maior despesa individual do mês
  const monthStartKey = `${a.today.slice(0, 7)}-01`;
  const biggest = a.transactions
    .filter((t) => t.kind === 'expense' && !t.ignored && t.status === 'posted' && t.date >= monthStartKey && t.date <= a.today && t.currency === 'BRL')
    .sort((x, y) => x.amount - y.amount)[0];
  if (biggest && biggest.amount < 0) {
    out.push({
      id: 'biggest-expense',
      tone: 'neutral',
      icon: 'receipt',
      text: `A maior despesa do mês até agora foi "${biggest.description}" (${formatMoney(-biggest.amount)}, em ${formatDate(biggest.date)}).`,
      basis: 'Transações lançadas no mês',
    });
  }

  // 9. Conexões com problema
  const broken = ds.items.filter((i) => i.syncState === 'error' || i.syncState === 'action_required');
  if (broken.length) {
    out.push({
      id: 'items-attention',
      tone: 'attention',
      icon: 'alert',
      text: `${broken.length} conexão(ões) precisam de atenção: ${broken.map((b) => b.institution.name).join(', ')}.`,
      basis: 'Status informado pela Pluggy',
    });
  }

  return out;
}

export function daysUntil(today: DateKey, date: DateKey): number {
  return diffDays(today, date);
}
