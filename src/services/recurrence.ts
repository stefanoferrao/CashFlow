/**
 * Detecção de recorrências a partir do histórico REAL de transações.
 * Resultado é sempre rotulado como ESTIMATIVA na interface e pode ser desligado nas projeções.
 *
 * Critérios (conservadores):
 *  - mesma descrição normalizada, mesmo sentido (entrada/saída) e mesma origem (conta/cartão)
 *  - ≥ 3 ocorrências nos últimos 200 dias (≥ 2 quando o valor é praticamente idêntico)
 *  - intervalo mediano semanal (6–8 d), quinzenal (13–16 d) ou mensal (26–35 d)
 *  - variação de valor ≤ 25% da mediana
 *  - ainda "ativa": próxima data prevista não passou há mais de 10 dias
 */
import type { AppCategoryId, NormalizedTransaction } from '../models/finance';
import { type DateKey, addDays, diffDays } from '../utils/dates';
import { normalizeText } from './categories';

export interface Recurrence {
  key: string;
  label: string;
  category: AppCategoryId;
  source: 'bank' | 'card';
  /** Valor típico com sinal (+ receita, − despesa). */
  averageAmount: number;
  intervalDays: number;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  lastDate: DateKey;
  nextDate: DateKey;
  occurrences: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Normaliza a descrição removendo números, datas e ruídos para agrupar lançamentos semelhantes. */
export function recurrenceKey(description: string): string {
  return normalizeText(description)
    .replace(/\d+\/\d+/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\b(pix|ted|doc|transf|transferencia|pagamento|pagto|pag|compra|debito|credito|enviado|recebido|de|da|do|para)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');
}

export function detectRecurrences(transactions: NormalizedTransaction[], today: DateKey, lookbackDays = 200): Recurrence[] {
  const from = addDays(today, -lookbackDays);
  const groups = new Map<string, NormalizedTransaction[]>();
  for (const t of transactions) {
    if (t.status !== 'posted' || t.ignored || t.date < from || t.date > today) continue;
    if (t.kind !== 'income' && t.kind !== 'expense') continue;
    if (t.installment) continue; // parcelas têm fim conhecido; não são assinaturas
    const k = recurrenceKey(t.description);
    if (k.length < 3) continue;
    const key = `${t.source}|${t.amount >= 0 ? '+' : '-'}|${k}`;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const out: Recurrence[] = [];
  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;
    txs.sort((a, b) => a.date.localeCompare(b.date));
    // uma ocorrência por data
    const unique = txs.filter((t, i) => i === 0 || t.date !== txs[i - 1]!.date);
    if (unique.length < 2) continue;
    const intervals = unique.slice(1).map((t, i) => diffDays(unique[i]!.date, t.date));
    const interval = median(intervals);
    let cadence: Recurrence['cadence'] | null = null;
    if (interval >= 26 && interval <= 35) cadence = 'monthly';
    else if (interval >= 13 && interval <= 16) cadence = 'biweekly';
    else if (interval >= 6 && interval <= 8) cadence = 'weekly';
    if (!cadence) continue;

    const amounts = unique.map((t) => Math.abs(t.amount));
    const med = median(amounts);
    if (med <= 0) continue;
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / med;
    if (spread > 0.25) continue;
    if (unique.length < 3 && spread > 0.02) continue;
    // intervalos irregulares demais descartam o grupo
    if (intervals.some((d) => Math.abs(d - interval) > Math.max(5, interval * 0.35))) continue;

    const last = unique[unique.length - 1]!;
    const step = cadence === 'monthly' ? 30 : Math.round(interval);
    const nextDate = addDays(last.date, step);
    if (diffDays(nextDate, today) > 10) continue; // parou de ocorrer

    const sign = last.amount >= 0 ? 1 : -1;
    out.push({
      key,
      label: last.description,
      category: last.category,
      source: last.source,
      averageAmount: Math.round(sign * med * 100) / 100,
      intervalDays: step,
      cadence,
      lastDate: last.date,
      nextDate,
      occurrences: unique.length,
    });
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/** Datas futuras previstas de uma recorrência dentro de [from, to]. Mensais mantêm o dia do mês. */
export function projectRecurrence(r: Recurrence, from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  if (r.cadence === 'monthly') {
    const day = Number(r.lastDate.slice(8, 10));
    let [y, m] = r.lastDate.slice(0, 7).split('-').map(Number) as [number, number];
    for (let i = 0; i < 24; i++) {
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      const last = new Date(y, m, 0).getDate();
      const d = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
      if (d > to) break;
      if (d >= from) out.push(d);
    }
    // Ocorrências atrasadas não são projetadas (abordagem conservadora).
    return out;
  }
  let d = r.nextDate;
  for (let i = 0; i < 200 && d <= to; i++) {
    if (d >= from) out.push(d);
    d = addDays(d, r.intervalDays);
  }
  return out;
}
