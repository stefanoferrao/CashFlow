/**
 * Formatação brasileira (Intl). Valores: "R$ 1.234,56". Datas: "22/09/2026". Meses: "Janeiro".
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const compactFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string): Intl.NumberFormat {
  let f = currencyFormatters.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      // Código de moeda inválido vindo da API: mostra o número com o código ao lado.
      f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    currencyFormatters.set(currency, f);
  }
  return f;
}

/** Normaliza o espaço não-separável do Intl para um espaço comum estável em testes e na UI. */
function tidy(s: string): string {
  return s.replace(/ | /g, ' ');
}

export function formatMoney(value: number | null | undefined, currency = 'BRL'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const v = Object.is(value, -0) ? 0 : value;
  return tidy(currencyFormatter(currency).format(v));
}

/** Com sinal explícito: "+R$ 10,00" / "−R$ 10,00". */
export function formatSignedMoney(value: number, currency = 'BRL'): string {
  if (Number.isNaN(value)) return '—';
  const abs = formatMoney(Math.abs(value), currency);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

/** Formato compacto para eixos de gráfico: "R$ 12,5 mil". */
export function formatMoneyCompact(value: number, currency = 'BRL'): string {
  let f = compactFormatters.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    } catch {
      f = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
    }
    compactFormatters.set(currency, f);
  }
  return tidy(f.format(value));
}

const pctFormatter = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 });
const pctFormatter2 = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Recebe fração (0.42 → "42%"). */
export function formatPercent(fraction: number | null | undefined, precise = false): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  return tidy((precise ? pctFormatter2 : pctFormatter).format(fraction));
}

export function formatSignedPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  const s = formatPercent(Math.abs(fraction), true);
  if (fraction > 0) return `+${s}`;
  if (fraction < 0) return `−${s}`;
  return s;
}

const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
export function formatNumber(n: number): string {
  return tidy(numberFormatter.format(n));
}

// ---------- Datas ----------
// Convenção interna: datas de calendário como string 'YYYY-MM-DD' (sem fuso).

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const shortDateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const monthShortFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function keyToUtcDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1) : s;
}

/** '2026-09-22' → '22/09/2026' */
export function formatDate(key: string | null | undefined): string {
  if (!key) return '—';
  return dateFmt.format(keyToUtcDate(key));
}

/** '2026-09-22' → '22/09' */
export function formatShortDate(key: string | null | undefined): string {
  if (!key) return '—';
  return shortDateFmt.format(keyToUtcDate(key));
}

/** 9 → 'Setembro' (1-12) */
export function monthName(month1to12: number): string {
  return capitalize(monthFmt.format(new Date(Date.UTC(2000, month1to12 - 1, 1))));
}

export function monthShortName(month1to12: number): string {
  return capitalize(monthShortFmt.format(new Date(Date.UTC(2000, month1to12 - 1, 1))).replace('.', ''));
}

/** '2026-09' → 'Setembro de 2026' */
export function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthName(m ?? 1)} de ${y}`;
}

/** '2026-09' → 'Set/26' */
export function formatMonthKeyShort(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthShortName(m ?? 1)}/${String(y).slice(2)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return tidy(dateTimeFmt.format(d));
}

/** "há 3 minutos", "há 2 horas", "agora mesmo" */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'nunca';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.round((now.getTime() - t) / 1000);
  if (diffSec < 45) return 'agora mesmo';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return `em ${formatDateTime(iso)}`;
}

/** Mascara números de conta/cartão mantendo só os 4 últimos dígitos. */
export function maskNumber(num: string | null | undefined): string {
  if (!num) return '';
  const digits = num.replace(/\D/g, '');
  if (digits.length <= 4) return `•••• ${digits}`;
  return `•••• ${digits.slice(-4)}`;
}
