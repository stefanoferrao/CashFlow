/**
 * Utilitários de datas de calendário. Convenção: 'YYYY-MM-DD' (string, sem fuso horário).
 */

export type DateKey = string; // 'YYYY-MM-DD'
export type MonthKey = string; // 'YYYY-MM'

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

export function parseKey(key: DateKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

/** Converte chave em Date ao meio-dia local (imune a horário de verão). */
export function keyToDate(key: DateKey): Date {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key: DateKey, days: number): DateKey {
  const dt = keyToDate(key);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

/** Soma meses preservando o dia quando possível (31/01 + 1 mês → 28/29/02). */
export function addMonths(key: DateKey, months: number): DateKey {
  const { y, m, d } = parseKey(key);
  const target = new Date(y, m - 1 + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return toDateKey(target);
}

export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86_400_000);
}

export function monthKey(key: DateKey): MonthKey {
  return key.slice(0, 7);
}

export function monthStart(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

export function monthEnd(key: DateKey): DateKey {
  const { y, m } = parseKey(key);
  return toDateKey(new Date(y, m, 0, 12));
}

export function addMonthsToMonthKey(mk: MonthKey, months: number): MonthKey {
  return monthKey(addMonths(`${mk}-01`, months));
}

export function daysInMonth(key: DateKey): number {
  const { y, m } = parseKey(key);
  return new Date(y, m, 0).getDate();
}

/** Início da semana (segunda-feira). */
export function weekStart(key: DateKey): DateKey {
  const dt = keyToDate(key);
  const dow = (dt.getDay() + 6) % 7; // 0 = segunda
  return addDays(key, -dow);
}

export function isBetween(key: DateKey, start: DateKey, end: DateKey): boolean {
  return key >= start && key <= end;
}

export function eachDay(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  if (start > end) return out;
  let k = start;
  let guard = 0;
  while (k <= end && guard++ < 5000) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}

/**
 * Converte data vinda da API Pluggy (ISO 8601 em UTC) em data de calendário.
 * - Se o horário for exatamente 00:00:00.000Z, trata-se de uma data "pura" → usa a parte de data UTC
 *   (converter para o fuso local deslocaria o dia para trás no Brasil).
 * - Caso contrário é um instante real → converte para a data local do usuário.
 */
export function apiDateToKey(value: string | Date | null | undefined): DateKey | null {
  if (!value) return null;
  const iso = typeof value === 'string' ? value : value.toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return iso.slice(0, 10);
  }
  return toDateKey(d);
}
