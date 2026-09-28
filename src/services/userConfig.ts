/**
 * Personalizações do usuário para copiar entre aparelhos (celular ⇄ computador): exportar e importar.
 * Funções puras — sem rede, sem armazenamento, sem estado.
 *
 * O QUE VAI NO ARQUIVO (lista fechada; só entra o que está aqui):
 *  - tema e preferências de exibição (ocultar valores, incluir estimativas, validade do cache);
 *  - organização do dashboard (posição, tamanho, visibilidade e ordem no celular);
 *  - nome, cor e logo de cada instituição; nome e logo/ícone de cada conta e cartão;
 *  - dias de fechamento e vencimento definidos para os cartões;
 *  - categorização (ajustes, regras e subcategorias) e lançamentos previstos.
 *
 * O QUE NUNCA ENTRA, NEM NO ARQUIVO NEM NO IMPORT: Client ID/Secret, senha local, cofre, tokens e chaves da API, lista de
 * conexões (Items), bloqueio automático, modo de conexão (direto/proxy) e qualquer dado baixado da Pluggy (saldos,
 * transações, faturas). Como o arquivo é lido a partir de uma lista de campos permitidos, mesmo um arquivo editado à mão
 * com esses campos não os aplica: eles são descartados (e o app avisa que foram ignorados).
 */
import {
  CATEGORY_BY_ID,
  type AppCategoryId,
  type CardCycleSetting,
  type CategoryOverride,
  type CategoryRule,
  type PlannedEntry,
  type UserCategorization,
  type UserLabels,
  emptyCategorization,
  emptyLabels,
} from '../models/finance';
import type { DashboardLayout, ThemePref, UserPreferences, WidgetLayout } from '../storage/preferences';
import { sanitizeIdentity, sanitizeProductLogo, validDay } from './institutions';

/** Identificador do formato. Mantido igual ao da 1ª versão: arquivos antigos continuam sendo aceitos. */
export const CONFIG_KIND = 'visual-config';
export const CONFIG_VERSION = 2;
/** Com logos enviados (até 200 KB cada) o arquivo pode passar de alguns MB. */
export const MAX_CONFIG_BYTES = 4_000_000;

const CACHE_TTL_CHOICES = [1, 6, 12, 24];
const MAX_MAP_ENTRIES = 500;
const MAX_OVERRIDES = 50_000;
const MAX_RULES = 1_000;
const MAX_PLANNED = 2_000;
const MAX_WIDGETS = 60;
/** Identificadores (de conexão, conta, cartão, transação, card do dashboard): só caracteres seguros. */
const SAFE_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
/** Nomes que, usados como chave de objeto, mexem no protótipo: nunca aceitos como identificador. */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_KEY = { test: (k: string): boolean => SAFE_KEY_PATTERN.test(k) && !RESERVED_KEYS.has(k) };
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Preferências que podem viajar no arquivo. */
export type SharedPreferences = Partial<Pick<UserPreferences, 'hideValues' | 'includeEstimates' | 'cacheTtlHours'>>;

/** Personalizações já validadas. `null` = o arquivo não trazia aquela parte (nada será alterado nela). */
export interface UserConfig {
  theme: ThemePref | null;
  preferences: SharedPreferences;
  layout: DashboardLayout | null;
  labels: UserLabels | null;
  categorization: UserCategorization | null;
  planned: PlannedEntry[] | null;
}

export interface ParsedUserConfig {
  config: UserConfig;
  /** Formato do arquivo (1 = só tema, preferências e dashboard). */
  version: number;
  exportedAt: string | null;
  /** Quantos itens do arquivo eram inválidos e foram descartados. */
  dropped: number;
  /** Campos de segurança/conexão presentes no arquivo e ignorados (nomes dos campos). */
  ignored: string[];
}

/** Tudo que o app entrega para montar o arquivo. */
export interface UserConfigSource {
  theme: ThemePref;
  preferences: Pick<UserPreferences, 'hideValues' | 'includeEstimates' | 'cacheTtlHours'>;
  layout: DashboardLayout | null;
  labels: UserLabels;
  categorization: UserCategorization;
  planned: PlannedEntry[];
}

/** Monta o conteúdo do arquivo de exportação: campo a campo, só o que está na lista permitida. */
export function buildUserConfig(src: UserConfigSource, now: Date = new Date()): Record<string, unknown> {
  return {
    app: 'cashflow',
    kind: CONFIG_KIND,
    version: CONFIG_VERSION,
    exportedAt: now.toISOString(),
    theme: src.theme,
    preferences: {
      hideValues: src.preferences.hideValues,
      includeEstimates: src.preferences.includeEstimates,
      cacheTtlHours: src.preferences.cacheTtlHours,
    },
    dashboardLayout: src.layout,
    labels: {
      identities: src.labels.identities,
      nicknames: src.labels.nicknames,
      cardCycles: src.labels.cardCycles,
      productLogos: src.labels.productLogos,
    },
    categorization: {
      overrides: src.categorization.overrides,
      rules: src.categorization.rules,
      customSubcategories: src.categorization.customSubcategories,
    },
    plannedEntries: src.planned,
  };
}

// ------------------------------------------------------------------ leitura e validação

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.trim().slice(0, max) : null);

/** Nomes de campo que indicam segurança/conexão — nunca aplicados; só servem para avisar que foram ignorados. */
const SENSITIVE_NAME = /secret|password|passphrase|senha|token|api[-_ ]?key|credential|client[-_ ]?id|vault|cofre|item[-_ ]?ids?$|^items$|auto[-_ ]?lock|api[-_ ]?mode|sandbox|^mode$|debug/i;

function findIgnored(root: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const known = new Set(['app', 'kind', 'version', 'exportedAt', 'theme', 'preferences', 'dashboardLayout', 'labels', 'categorization', 'plannedEntries']);
  for (const k of Object.keys(root)) if (!known.has(k) && SENSITIVE_NAME.test(k)) out.add(k);
  if (isRecord(root.preferences)) {
    const allowed = new Set(['hideValues', 'includeEstimates', 'cacheTtlHours']);
    for (const k of Object.keys(root.preferences)) if (!allowed.has(k) && SENSITIVE_NAME.test(k)) out.add(`preferences.${k}`);
  }
  return [...out].sort();
}

function readLayout(v: unknown, count: { dropped: number }): DashboardLayout | null {
  if (!isRecord(v) || !Array.isArray(v.widgets)) return null;
  const widgets: WidgetLayout[] = [];
  for (const w of v.widgets.slice(0, MAX_WIDGETS)) {
    if (!isRecord(w) || typeof w.id !== 'string' || !SAFE_KEY.test(w.id) || ![w.x, w.y, w.w, w.h].every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 200)) {
      count.dropped++;
      continue;
    }
    widgets.push({ id: w.id, x: w.x as number, y: w.y as number, w: w.w as number, h: w.h as number, visible: w.visible !== false, pinned: w.pinned === true });
  }
  const mobileOrder = Array.isArray(v.mobileOrder) ? v.mobileOrder.filter((x): x is string => typeof x === 'string' && SAFE_KEY.test(x)).slice(0, MAX_WIDGETS) : undefined;
  return { version: Number.isInteger(v.version) ? (v.version as number) : 1, widgets, ...(mobileOrder ? { mobileOrder } : {}) };
}

/** Aplica `read` a cada entrada de um dicionário, com chaves seguras e no máximo `max` entradas. */
function readMap<T>(v: unknown, max: number, count: { dropped: number }, read: (val: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isRecord(v)) return out;
  let n = 0;
  for (const [key, val] of Object.entries(v)) {
    if (n >= max) {
      count.dropped++;
      continue;
    }
    const clean = SAFE_KEY.test(key) ? read(val) : null;
    if (clean === null) {
      count.dropped++;
      continue;
    }
    out[key] = clean;
    n++;
  }
  return out;
}

function readLabels(v: unknown, count: { dropped: number }): UserLabels | null {
  if (!isRecord(v)) return null;
  const labels = emptyLabels();
  labels.identities = readMap(v.identities, MAX_MAP_ENTRIES, count, (i) => (isRecord(i) ? sanitizeIdentity(i as never) : null));
  labels.nicknames = readMap(v.nicknames, MAX_MAP_ENTRIES, count, (n) => str(n, 40) || null);
  labels.cardCycles = readMap<CardCycleSetting>(v.cardCycles, MAX_MAP_ENTRIES, count, (c) => {
    if (!isRecord(c)) return null;
    const closingDay = validDay(c.closingDay as number);
    const dueDay = validDay(c.dueDay as number);
    return closingDay || dueDay ? { closingDay, dueDay } : null;
  });
  labels.productLogos = readMap(v.productLogos, MAX_MAP_ENTRIES, count, (p) => (isRecord(p) ? sanitizeProductLogo(p as never) : null));
  return labels;
}

const validCategory = (c: unknown): c is AppCategoryId => typeof c === 'string' && c in CATEGORY_BY_ID;

function readCategorization(v: unknown, count: { dropped: number }): UserCategorization | null {
  if (!isRecord(v)) return null;
  const uc = emptyCategorization();
  uc.overrides = readMap<CategoryOverride>(v.overrides, MAX_OVERRIDES, count, (o) => {
    if (!isRecord(o)) return null;
    const out: CategoryOverride = {};
    if (validCategory(o.category)) out.category = o.category;
    if (o.subcategory === null) out.subcategory = null;
    else if (typeof o.subcategory === 'string') out.subcategory = str(o.subcategory, 40) || null;
    if (typeof o.ignored === 'boolean') out.ignored = o.ignored;
    return Object.keys(out).length ? out : null;
  });
  if (Array.isArray(v.rules)) {
    for (const r of v.rules.slice(0, MAX_RULES)) {
      const contains = isRecord(r) ? str(r.contains, 60) : null;
      if (!isRecord(r) || typeof r.id !== 'string' || !SAFE_KEY.test(r.id) || !contains || !validCategory(r.category)) {
        count.dropped++;
        continue;
      }
      uc.rules.push({ id: r.id, contains, category: r.category, subcategory: str(r.subcategory, 40) || null } satisfies CategoryRule);
    }
  }
  if (isRecord(v.customSubcategories)) {
    for (const [cat, list] of Object.entries(v.customSubcategories)) {
      if (!validCategory(cat) || !Array.isArray(list)) {
        count.dropped++;
        continue;
      }
      const names = [...new Set(list.map((n) => str(n, 40)).filter((n): n is string => !!n))].slice(0, 50);
      if (names.length) uc.customSubcategories[cat] = names;
    }
  }
  return uc;
}

function readPlanned(v: unknown, count: { dropped: number }): PlannedEntry[] | null {
  if (!Array.isArray(v)) return null;
  const out: PlannedEntry[] = [];
  for (const p of v.slice(0, MAX_PLANNED)) {
    const description = isRecord(p) ? str(p.description, 80) : null;
    const date = isRecord(p) && typeof p.date === 'string' && DATE_KEY.test(p.date) && !Number.isNaN(Date.parse(p.date)) ? p.date : null;
    if (!isRecord(p) || typeof p.id !== 'string' || !SAFE_KEY.test(p.id) || !description || !date || typeof p.amount !== 'number' || !Number.isFinite(p.amount) || Math.abs(p.amount) > 1e9) {
      count.dropped++;
      continue;
    }
    out.push({ id: p.id, description, amount: Math.round(p.amount * 100) / 100, date, recurrence: p.recurrence === 'monthly' ? 'monthly' : 'none' });
  }
  return out;
}

/** Lê e valida um arquivo de personalizações. Lança um Error com mensagem amigável se o arquivo não servir. */
export function parseUserConfig(text: string): ParsedUserConfig {
  if (text.length > MAX_CONFIG_BYTES) throw new Error('Arquivo grande demais para ser uma configuração do CashFlow.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.');
  }
  if (!isRecord(data) || data.app !== 'cashflow' || data.kind !== CONFIG_KIND) throw new Error('Este arquivo não é uma configuração do CashFlow.');

  const count = { dropped: 0 };
  const prefs = isRecord(data.preferences) ? data.preferences : {};
  const preferences: SharedPreferences = {};
  if (typeof prefs.hideValues === 'boolean') preferences.hideValues = prefs.hideValues;
  if (typeof prefs.includeEstimates === 'boolean') preferences.includeEstimates = prefs.includeEstimates;
  if (typeof prefs.cacheTtlHours === 'number' && CACHE_TTL_CHOICES.includes(prefs.cacheTtlHours)) preferences.cacheTtlHours = prefs.cacheTtlHours;

  return {
    config: {
      theme: data.theme === 'light' || data.theme === 'dark' || data.theme === 'system' ? data.theme : null,
      preferences,
      layout: readLayout(data.dashboardLayout, count),
      labels: readLabels(data.labels, count),
      categorization: readCategorization(data.categorization, count),
      planned: readPlanned(data.plannedEntries, count),
    },
    version: Number.isInteger(data.version) ? (data.version as number) : 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 40) : null,
    dropped: count.dropped,
    ignored: findIgnored(data),
  };
}

// ------------------------------------------------------------------ resumo e mesclagem

const THEME_NAME: Record<ThemePref, string> = { light: 'claro', dark: 'escuro', system: 'do sistema' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Linhas para mostrar à pessoa o que o arquivo vai aplicar. Vazio = o arquivo não traz nada aplicável. */
export function describeUserConfig(cfg: UserConfig): string[] {
  const lines: string[] = [];
  if (cfg.theme) lines.push(`Tema ${THEME_NAME[cfg.theme]}`);
  if (Object.keys(cfg.preferences).length) lines.push('Preferências de exibição');
  if (cfg.layout) lines.push(`Organização do dashboard (${plural(cfg.layout.widgets.length, 'card', 'cards')})`);
  const l = cfg.labels;
  if (l) {
    const nicknames = Object.keys(l.nicknames).length;
    const identities = Object.keys(l.identities).length;
    const logos = Object.keys(l.productLogos).length;
    const cycles = Object.keys(l.cardCycles).length;
    if (nicknames) lines.push(`Nomes de ${plural(nicknames, 'conta ou cartão', 'contas e cartões')}`);
    if (identities) lines.push(`Nome, cor e logo de ${plural(identities, 'instituição', 'instituições')}`);
    if (logos) lines.push(`Ícones de ${plural(logos, 'conta ou cartão', 'contas e cartões')}`);
    if (cycles) lines.push(`Fechamento e vencimento de ${plural(cycles, 'cartão', 'cartões')}`);
  }
  const c = cfg.categorization;
  if (c) {
    const n = Object.keys(c.overrides).length + c.rules.length + Object.values(c.customSubcategories).reduce((s, a) => s + (a?.length ?? 0), 0);
    if (n) lines.push(`Categorização (${plural(n, 'ajuste ou regra', 'ajustes e regras')})`);
  }
  if (cfg.planned?.length) lines.push(`${plural(cfg.planned.length, 'lançamento previsto', 'lançamentos previstos')}`);
  return lines;
}

/** Importa por cima: o que veio no arquivo vence em caso de conflito e o que só existe aqui é mantido. */
export function mergeLabels(cur: UserLabels, inc: UserLabels): UserLabels {
  return {
    identities: { ...cur.identities, ...inc.identities },
    nicknames: { ...cur.nicknames, ...inc.nicknames },
    cardCycles: { ...cur.cardCycles, ...inc.cardCycles },
    productLogos: { ...cur.productLogos, ...inc.productLogos },
  };
}

export function mergeCategorization(cur: UserCategorization, inc: UserCategorization): UserCategorization {
  const rules = new Map(cur.rules.map((r) => [r.id, r]));
  for (const r of inc.rules) rules.set(r.id, r);
  const custom: UserCategorization['customSubcategories'] = { ...cur.customSubcategories };
  for (const [cat, names] of Object.entries(inc.customSubcategories) as Array<[AppCategoryId, string[]]>) {
    custom[cat] = [...new Set([...(custom[cat] ?? []), ...names])];
  }
  return { overrides: { ...cur.overrides, ...inc.overrides }, rules: [...rules.values()], customSubcategories: custom };
}

export function mergePlanned(cur: PlannedEntry[], inc: PlannedEntry[]): PlannedEntry[] {
  const byId = new Map(cur.map((p) => [p.id, p]));
  for (const p of inc) byId.set(p.id, p);
  return [...byId.values()];
}
