/**
 * Identidade das instituições — nome, logo/ícone e cor exibidos em TODO o app.
 *
 * Problema que resolve: conexões feitas pelo Meu Pluggy chegam com o conector "MeuPluggy",
 * sem dizer de qual banco são. Esta camada:
 *  1. detecta o banco a partir dos próprios dados (nome da conta, instituição/emissor dos investimentos);
 *  2. usa o catálogo oficial de conectores da Pluggy (GET /connectors) para logo e cor, quando disponível;
 *  3. aplica o que o usuário definir (nome, aparência, apelidos de contas e cartões), com prioridade.
 *
 * É apresentação: não altera nenhum valor financeiro. Funções puras.
 */
import { APP_CONFIG } from '../config/app.config';
import {
  ACCOUNT_TYPE_LABEL,
  type ConnectorInfo,
  type FinancialDataset,
  type IdentitySource,
  type InstitutionLogo,
  type NormalizedAccount,
  type NormalizedCard,
  type NormalizedInstitution,
  type NormalizedItem,
  type UserLabels,
} from '../models/finance';
import { memoizeLast } from '../utils/async';

// ------------------------------------------------------------------ texto

/** minúsculas, sem acentos, só letras/dígitos separados por um espaço. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ catálogo de instituições conhecidas

export interface KnownInstitution {
  key: string;
  /** Nome curto exibido por padrão. */
  name: string;
  /** Testados contra o texto normalizado (norm) de nomes de contas, cartões e investimentos. */
  patterns: RegExp[];
  /** Testado contra o nome normalizado dos conectores da Pluggy (para logo e cor). */
  connector: RegExp;
}

const K = (key: string, name: string, patterns: RegExp[], connector: RegExp): KnownInstitution => ({ key, name, patterns, connector });

export const KNOWN_INSTITUTIONS: readonly KnownInstitution[] = [
  K('nubank', 'Nubank', [/\bnubank\b/, /\bnu (pagamentos|financeira|invest|investimentos|holdings)\b/], /^nubank\b/),
  K('inter', 'Inter', [/\bbanco inter\b/, /\binter (dtvm|distribuidora|co|pf|pj)\b/, /\binter and co\b/], /^(banco )?inter\b/),
  K('itau', 'Itaú', [/\bitau\b/, /\bunibanco\b/], /^itau\b/),
  K('bradesco', 'Bradesco', [/\bbradesco\b/], /^bradesco\b/),
  K('santander', 'Santander', [/\bsantander\b/], /^santander\b/),
  K('bb', 'Banco do Brasil', [/\bbanco do brasil\b/, /\bbb (dtvm|asset|gestao|seguridade)\b/], /^banco do brasil\b/),
  K('caixa', 'Caixa', [/\bcaixa economica\b/], /^caixa\b/),
  K('c6', 'C6 Bank', [/\bc6\b/], /^c6\b/),
  K('btg', 'BTG Pactual', [/\bbtg\b/], /^btg\b/),
  K('xp', 'XP', [/\bxp (investimentos|inc|cctvm)\b/, /\bbanco xp\b/], /^xp\b/),
  K('rico', 'Rico', [/\brico (investimentos|corretora|cctvm)\b/], /^rico\b/),
  K('clear', 'Clear', [/\bclear (corretora|ctvm)\b/], /^clear\b/),
  K('mercadopago', 'Mercado Pago', [/\bmercado ?pago\b/], /^mercado ?pago\b/),
  K('picpay', 'PicPay', [/\bpicpay\b/], /^picpay\b/),
  K('pagbank', 'PagBank', [/\bpag ?bank\b/, /\bpag ?seguro\b/], /^pag ?(bank|seguro)\b/),
  K('neon', 'Neon', [/\bneon (pagamentos|bank|financeira)\b/, /\bbanco neon\b/], /^neon\b/),
  K('original', 'Banco Original', [/\bbanco original\b/], /^(banco )?original\b/),
  K('sicoob', 'Sicoob', [/\bsicoob\b/, /\bbancoob\b/], /^sicoob\b/),
  K('sicredi', 'Sicredi', [/\bsicredi\b/], /^sicredi\b/),
  K('banrisul', 'Banrisul', [/\bbanrisul\b/], /^banrisul\b/),
  K('safra', 'Safra', [/\bbanco safra\b/, /\bsafra (asset|corretora)\b/], /^(banco )?safra\b/),
  K('pan', 'Banco Pan', [/\bbanco pan\b/], /^(banco )?pan\b/),
  K('bmg', 'BMG', [/\bbanco bmg\b/, /\bbmg\b/], /^(banco )?bmg\b/),
  K('digio', 'Digio', [/\bdigio\b/], /^digio\b/),
  K('will', 'Will Bank', [/\bwill ?bank\b/], /^will\b/),
  K('agibank', 'Agibank', [/\bagibank\b/, /\bagiplan\b/], /^agibank\b/),
  K('bv', 'Banco BV', [/\bbanco bv\b/, /\bbv financeira\b/, /\bbanco votorantim\b/], /^(banco )?bv\b/),
  K('next', 'Next', [/\bbanco next\b/, /\bnext (conta|bank)\b/], /^next\b/),
  K('iti', 'iti', [/\biti (itau|pagamentos)\b/], /^iti\b/),
  K('modal', 'Modal', [/\bbanco modal\b/, /\bmodal ?mais\b/], /^modal/),
  K('genial', 'Genial', [/\bgenial investimentos\b/, /\bbanco genial\b/], /^genial\b/),
  K('toro', 'Toro', [/\btoro (investimentos|corretora|cctvm)\b/], /^toro\b/),
  K('avenue', 'Avenue', [/\bavenue securities\b/], /^avenue\b/),
  K('nomad', 'Nomad', [/\bnomad\b/], /^nomad\b/),
  K('sofisa', 'Sofisa', [/\bsofisa\b/], /^sofisa\b/),
  K('daycoval', 'Daycoval', [/\bdaycoval\b/], /^daycoval\b/),
  K('brb', 'BRB', [/\bbrb\b/, /\bbanco de brasilia\b/], /^brb\b/),
  K('mercantil', 'Mercantil', [/\bmercantil do brasil\b/], /^mercantil\b/),
  K('porto', 'Porto Bank', [/\bporto (seguro|bank)\b/], /^porto\b/),
  K('credicard', 'Credicard', [/\bcredicard\b/], /^credicard\b/),
  K('unicred', 'Unicred', [/\bunicred\b/], /^unicred\b/),
  K('cresol', 'Cresol', [/\bcresol\b/], /^cresol\b/),
  K('ailos', 'Ailos', [/\bailos\b/], /^ailos\b/),
  K('stone', 'Stone', [/\bstone (pagamentos|instituicao)\b/], /^stone\b/),
  K('infinitepay', 'InfinitePay', [/\binfinitepay\b/, /\bcloudwalk\b/], /^infinitepay\b/),
];

export function matchKnown(text: string | null | undefined): KnownInstitution | null {
  const t = norm(text);
  if (!t) return null;
  for (const k of KNOWN_INSTITUTIONS) if (k.patterns.some((p) => p.test(t))) return k;
  return null;
}

export interface Evidence {
  text: string;
  /**
   * strong: nome de conta/cartão ou instituição custodiante do investimento — dizem ONDE está o dinheiro.
   * weak: emissor/nome do produto — numa corretora, o CDB pode ser de outro banco.
   */
  strength: 'strong' | 'weak';
  /** Agrupa as evidências fracas de um mesmo produto (id do investimento). */
  group?: string;
}

export interface Detection {
  known: KnownInstitution;
  /** Trecho original que permitiu identificar (mostrado ao usuário). */
  from: string;
}

/**
 * Identifica o banco de uma conexão a partir dos próprios dados. Conservador de propósito:
 *  - com evidência forte, uma instituição precisa dominar (≥ 60% das evidências fortes reconhecidas);
 *  - só com evidência fraca, TODOS os produtos (mínimo 2) precisam apontar para a mesma instituição.
 * Na dúvida, não identifica — o usuário nomeia a conexão.
 */
export function detectInstitution(evidence: Evidence[]): Detection | null {
  const strong = new Map<string, { known: KnownInstitution; count: number; from: string }>();
  for (const e of evidence) {
    if (e.strength !== 'strong') continue;
    const k = matchKnown(e.text);
    if (!k) continue;
    const cur = strong.get(k.key) ?? { known: k, count: 0, from: e.text };
    cur.count++;
    strong.set(k.key, cur);
  }
  if (strong.size) {
    const ranked = [...strong.values()].sort((a, b) => b.count - a.count);
    const total = ranked.reduce((s, r) => s + r.count, 0);
    const top = ranked[0]!;
    return top.count >= total * 0.6 ? { known: top.known, from: top.from.trim().slice(0, 80) } : null;
  }
  const byGroup = new Map<string, { known: KnownInstitution | null; from: string }>();
  for (const e of evidence) {
    if (e.strength !== 'weak' || !e.group) continue;
    const prev = byGroup.get(e.group);
    if (prev?.known) continue;
    const k = matchKnown(e.text);
    byGroup.set(e.group, { known: k, from: k ? e.text : (prev?.from ?? e.text) });
  }
  const groups = [...byGroup.values()];
  if (groups.length < 2) return null;
  const first = groups[0]!.known;
  if (!first || !groups.every((g) => g.known?.key === first.key)) return null;
  return { known: first, from: groups[0]!.from.trim().slice(0, 80) };
}

// ------------------------------------------------------------------ conectores

export function isAggregatorConnector(inst: Pick<NormalizedInstitution, 'connectorId' | 'name'>): boolean {
  return inst.connectorId === APP_CONFIG.pluggy.meuPluggyConnectorId || /^meu ?pluggy$/.test(norm(inst.name));
}

/** "MeuPluggy" → "Meu Pluggy" (só para exibição). */
export function prettyConnectorName(name: string): string {
  return /^meu ?pluggy$/.test(norm(name)) ? 'Meu Pluggy' : name;
}

const BUSINESS = /\b(empresas|empresa|pj|business|corporate)\b/;

/** Melhor conector do catálogo para uma instituição conhecida (prefere pessoa física e Open Finance). */
export function findConnector(k: KnownInstitution, list: readonly ConnectorInfo[]): ConnectorInfo | null {
  const cands = list.filter((c) => k.connector.test(norm(c.name)) && c.imageUrl);
  if (!cands.length) return null;
  const rank = (c: ConnectorInfo) => (BUSINESS.test(norm(c.name)) ? 4 : 0) + (c.type === 'PERSONAL_BANK' ? 0 : 2) + (c.isOpenFinance ? 0 : 1);
  return [...cands].sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length)[0] ?? null;
}

/** Busca no catálogo (tela de personalização). Um resultado por nome. */
export function searchConnectors(query: string, list: readonly ConnectorInfo[], limit = 8): ConnectorInfo[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const out: ConnectorInfo[] = [];
  const scored = list
    .filter((c) => c.imageUrl && norm(c.name).includes(q))
    .sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)) || Number(!a.isOpenFinance) - Number(!b.isOpenFinance) || a.name.length - b.name.length);
  for (const c of scored) {
    const key = norm(c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

// ------------------------------------------------------------------ cores e iniciais

export const IDENTITY_COLORS: readonly { value: string; label: string }[] = [
  { value: '#820AD1', label: 'Roxo' },
  { value: '#FF7A00', label: 'Laranja' },
  { value: '#E11D2E', label: 'Vermelho' },
  { value: '#9F1239', label: 'Vinho' },
  { value: '#DB2777', label: 'Rosa' },
  { value: '#1D4ED8', label: 'Azul' },
  { value: '#0B2A4A', label: 'Azul-marinho' },
  { value: '#0891B2', label: 'Ciano' },
  { value: '#0F766E', label: 'Verde-petróleo' },
  { value: '#16A34A', label: 'Verde' },
  { value: '#EAB308', label: 'Amarelo' },
  { value: '#111827', label: 'Grafite' },
];

export const IDENTITY_ICONS: readonly { value: string; label: string }[] = [
  { value: 'bank', label: 'Banco' },
  { value: 'wallet', label: 'Carteira' },
  { value: 'card', label: 'Cartão' },
  { value: 'trending', label: 'Investimentos' },
  { value: 'pie', label: 'Carteira de ativos' },
  { value: 'target', label: 'Objetivo' },
  { value: 'home', label: 'Casa' },
  { value: 'bag', label: 'Compras' },
  { value: 'zap', label: 'Digital' },
  { value: 'shield', label: 'Reserva' },
  { value: 'sparkle', label: 'Destaque' },
  { value: 'user', label: 'Pessoal' },
];

export function isHexColor(c: string | null | undefined): c is string {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
}

/** Aceita "820ad1", "#820AD1" ou "#abc"; devolve #RRGGBB ou null. */
export function toHexColor(c: string | null | undefined): string | null {
  if (!c) return null;
  let h = c.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((x) => x + x).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toUpperCase()}` : null;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** Texto branco ou grafite — o que tiver mais contraste sobre a cor. */
export function readableTextOn(hex: string): string {
  if (!isHexColor(hex)) return '#FFFFFF';
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#111827') ? '#FFFFFF' : '#111827';
}

/** Cor estável derivada do nome (quando a Pluggy não informa uma). */
export function fallbackColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return IDENTITY_COLORS[h % IDENTITY_COLORS.length]!.value;
}

const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 's', 'a', 'sa', 'the', 'bank']);

export function initialsOf(name: string): string {
  const words = norm(name).split(' ').filter(Boolean);
  const meaningful = words.filter((w) => !STOP.has(w));
  const base = meaningful.length ? meaningful : words;
  if (!base.length) return '?';
  if (base.length === 1) return base[0]!.slice(0, 2).toUpperCase();
  return (base[0]![0]! + base[1]![0]!).toUpperCase();
}

// ------------------------------------------------------------------ nomes de contas e cartões

const LEGAL_ENTITY = /\bs a\b|\bltda\b|\binstituicao de pagamento\b|\bsociedade de credito\b|\bdtvm\b|\bcctvm\b|\bscfi\b|\bbanco multiplo\b/;

/** Nome "de razão social" (ex.: "Nu Pagamentos S.A. - Instituição de Pagamento") não ajuda a reconhecer a conta. */
export function looksLikeInstitutionName(name: string, connectorName?: string): boolean {
  const t = norm(name);
  if (!t) return true;
  if (LEGAL_ENTITY.test(t)) return true;
  if (connectorName && t === norm(connectorName)) return true;
  // Só o nome do banco ("Nubank", "Banco Inter") — mas "Nubank Ultravioleta" é um nome útil.
  const k = matchKnown(name);
  return !!k && (t === norm(k.name) || t === `banco ${norm(k.name)}` || t === k.key);
}

/** "croma-platinum" → "Croma Platinum". */
export function prettifySlug(name: string): string {
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(name.trim())) return name;
  return name
    .trim()
    .split(/[-_]/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export function defaultAccountName(acc: Pick<NormalizedAccount, 'name' | 'type'>, connectorName?: string): string {
  return looksLikeInstitutionName(acc.name, connectorName) ? ACCOUNT_TYPE_LABEL[acc.type] : prettifySlug(acc.name);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export function defaultCardName(card: Pick<NormalizedCard, 'name' | 'brand' | 'level'>, connectorName?: string): string {
  if (looksLikeInstitutionName(card.name, connectorName)) {
    const bl = [card.brand, card.level].filter(Boolean).join(' ');
    return bl ? titleCase(bl) : 'Cartão de crédito';
  }
  return prettifySlug(card.name);
}

export function validDay(d: number | null | undefined): number | null {
  return typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 31 ? d : null;
}

// ------------------------------------------------------------------ identidade resolvida

export interface ResolvedIdentity {
  name: string;
  color: string;
  textColor: string;
  logo: InstitutionLogo;
  icon: string | null;
  imageUrl: string | null;
  initials: string;
  connectorName: string;
  via: string | null;
  source: IdentitySource;
  detectedFrom: string | null;
  /** Sugestão automática (mesmo quando o usuário já personalizou) — usada no editor. */
  suggestion: { name: string; connector: ConnectorInfo | null; from: string } | null;
}

/** Evidências de um Item para a detecção (a partir dos dados ORIGINAIS, antes de qualquer rótulo). */
export function evidenceFor(ds: FinancialDataset, item: NormalizedItem): Evidence[] {
  const connectorName = item.institution.name;
  const ev: Evidence[] = [];
  for (const a of ds.accounts) if (a.itemId === item.id) ev.push({ text: a.name, strength: 'strong' });
  for (const c of ds.cards) if (c.itemId === item.id) ev.push({ text: c.name, strength: 'strong' });
  for (const i of ds.investments) {
    if (i.itemId !== item.id) continue;
    if (i.institution && norm(i.institution) !== norm(connectorName)) ev.push({ text: i.institution, strength: 'strong' });
    if (i.issuer) ev.push({ text: i.issuer, strength: 'weak', group: i.id });
    ev.push({ text: i.name, strength: 'weak', group: i.id });
  }
  return ev;
}

export function resolveIdentity(item: NormalizedItem, evidence: Evidence[], labels: UserLabels, connectors: readonly ConnectorInfo[]): ResolvedIdentity {
  const inst = item.institution;
  const connectorName = inst.name;
  const aggregator = isAggregatorConnector(inst);
  const det = aggregator ? detectInstitution(evidence) : null;
  const detConnector = det ? findConnector(det.known, connectors) : null;
  const suggestion = det ? { name: det.known.name, connector: detConnector, from: det.from } : null;
  const via = aggregator ? prettyConnectorName(connectorName) : null;

  const user = labels.identities[item.id];
  if (user && user.name.trim()) {
    const color = toHexColor(user.color) ?? fallbackColor(user.name);
    const imageUrl = user.imageUrl && /^https:\/\//.test(user.imageUrl) ? user.imageUrl : null;
    const logo: InstitutionLogo = user.logo === 'image' && !imageUrl ? 'initials' : user.logo;
    return {
      name: user.name.trim(),
      color,
      textColor: readableTextOn(color),
      logo,
      icon: user.icon,
      imageUrl,
      initials: initialsOf(user.name),
      connectorName,
      via: via ?? (norm(user.name) !== norm(connectorName) ? connectorName : null),
      source: 'user',
      detectedFrom: null,
      suggestion,
    };
  }

  if (det) {
    const color = toHexColor(detConnector?.primaryColor) ?? fallbackColor(det.known.name);
    return {
      name: det.known.name,
      color,
      textColor: readableTextOn(color),
      logo: detConnector?.imageUrl ? 'image' : 'initials',
      icon: null,
      imageUrl: detConnector?.imageUrl ?? null,
      initials: initialsOf(det.known.name),
      connectorName,
      via,
      source: 'detected',
      detectedFrom: det.from,
      suggestion,
    };
  }

  const name = aggregator ? prettyConnectorName(connectorName) : connectorName;
  const color = toHexColor(inst.primaryColor) ?? fallbackColor(connectorName);
  return {
    name,
    color,
    textColor: readableTextOn(color),
    logo: inst.imageUrl ? 'image' : 'initials',
    icon: null,
    imageUrl: inst.imageUrl,
    initials: initialsOf(name),
    connectorName,
    via: null,
    source: aggregator ? 'unidentified' : 'connector',
    detectedFrom: null,
    suggestion,
  };
}

function presentInstitution(inst: NormalizedInstitution, id: ResolvedIdentity): NormalizedInstitution {
  return {
    ...inst,
    name: id.name,
    imageUrl: id.logo === 'image' ? id.imageUrl : null,
    primaryColor: id.color,
    connectorName: id.connectorName,
    via: id.via,
    logo: id.logo,
    icon: id.logo === 'icon' ? id.icon : null,
    initials: id.initials,
    textColor: id.textColor,
    identitySource: id.source,
    detectedFrom: id.detectedFrom,
  };
}

function applyIdentitiesImpl(ds: FinancialDataset, labels: UserLabels, connectors: readonly ConnectorInfo[]): FinancialDataset {
  if (!ds.items.length && !Object.keys(labels.nicknames).length && !Object.keys(labels.cardCycles).length) return ds;
  const ids = new Map<string, ResolvedIdentity>();
  for (const item of ds.items) ids.set(item.id, resolveIdentity(item, evidenceFor(ds, item), labels, connectors));
  const instOf = (itemId: string, fallback: string) => ids.get(itemId)?.name ?? fallback;
  const connOf = (itemId: string) => ids.get(itemId)?.connectorName;
  const nick = (id: string) => labels.nicknames[id]?.trim() || null;

  const accounts = ds.accounts.map((a) => {
    const institution = instOf(a.itemId, a.institution);
    const nickname = nick(a.id);
    const name = nickname ?? defaultAccountName(a, connOf(a.itemId));
    return { ...a, institution, name, rawName: a.name, nickname, label: `${institution} · ${name}` };
  });
  const cards = ds.cards.map((c) => {
    const institution = instOf(c.itemId, c.institution);
    const nickname = nick(c.id);
    const name = nickname ?? defaultCardName(c, connOf(c.itemId));
    const color = ids.get(c.itemId)?.color ?? c.institutionColor;
    const cyc = labels.cardCycles[c.id];
    return {
      ...c,
      institution,
      institutionColor: color,
      name,
      rawName: c.name,
      nickname,
      label: `${institution} · ${name}`,
      manualClosingDay: validDay(cyc?.closingDay),
      manualDueDay: validDay(cyc?.dueDay),
    };
  });
  return {
    ...ds,
    items: ds.items.map((it) => ({ ...it, institution: presentInstitution(it.institution, ids.get(it.id)!) })),
    accounts,
    cards,
    transactions: ds.transactions.map((t) => {
      const institution = instOf(t.itemId, t.institution);
      return institution === t.institution ? t : { ...t, institution };
    }),
    investments: ds.investments.map((i) => {
      const institution = instOf(i.itemId, i.institution);
      return institution === i.institution ? i : { ...i, institution };
    }),
  };
}

/** Aplica identidades e apelidos ao dataset (memoizado pelas três referências). */
export const applyIdentities = memoizeLast(applyIdentitiesImpl);

/** Identidade resolvida de um Item (para o editor). */
export function identityForItem(base: FinancialDataset, itemId: string, labels: UserLabels, connectors: readonly ConnectorInfo[]): ResolvedIdentity | null {
  const item = base.items.find((i) => i.id === itemId);
  return item ? resolveIdentity(item, evidenceFor(base, item), labels, connectors) : null;
}
