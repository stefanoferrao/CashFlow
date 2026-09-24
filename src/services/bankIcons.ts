/**
 * Biblioteca local de ícones de instituições (bancos, fintechs, cartões e bandeiras),
 * vinda do projeto react-bancos (MIT) — https://github.com/henriquezolini/react-bancos.
 *
 * Os SVGs ficam em public/banks e são servidos pelo próprio site: nenhum terceiro fica sabendo
 * quais instituições você usa, funciona offline (PWA) e não depende do catálogo da Pluggy.
 * Para atualizar: scripts/update-bank-icons.mjs.
 */
import { BANK_ICONS, type BankIcon, type BankIconKind } from './bankIcons.data';

export { BANK_ICONS, type BankIcon, type BankIconKind };

const BY_SLUG = new Map(BANK_ICONS.map((b) => [b.slug, b]));

function n(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function bankIcon(slug: string | null | undefined): BankIcon | null {
  return slug ? (BY_SLUG.get(slug) ?? null) : null;
}

/** URL relativa ao index.html (funciona na raiz, em subpasta do GitHub Pages e no PWA). */
export function bankIconUrl(slug: string): string {
  return `./banks/${slug}.svg`;
}

const LOCAL_URL = /^\.\/banks\/([a-z0-9]+)\.svg$/;

export function isLocalIconUrl(url: string | null | undefined): boolean {
  const m = url ? LOCAL_URL.exec(url) : null;
  return !!m && BY_SLUG.has(m[1]!);
}

/** Ícone quadrado com fundo próprio (biblioteca local ou imagem enviada) → ocupa toda a área, sem margem. */
export function isFullBleedLogo(url: string | null | undefined): boolean {
  return !!url && (isLocalIconUrl(url) || url.startsWith('data:image/'));
}

/** Imagem enviada pelo usuário (PNG/JPEG/WebP já reduzida no navegador). */
export function isUploadedLogo(url: string | null | undefined): boolean {
  return !!url && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(url) && url.length <= 200_000;
}

/** URLs de logo aceitas: https (catálogo da Pluggy), ícone local ou imagem enviada. */
export function isAllowedLogoUrl(url: string | null | undefined): url is string {
  return !!url && (/^https:\/\/[^\s"'<>]+$/.test(url) || isLocalIconUrl(url) || isUploadedLogo(url));
}

/** Cor do ícone útil como cor da instituição (fundos brancos/quase brancos não servem para o cartão). */
export function usableIconColor(icon: BankIcon | null): string | null {
  const c = icon?.color;
  if (!c || !/^#[0-9A-F]{6}$/i.test(c)) return null;
  const v = parseInt(c.slice(1), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 225 ? null : c.toUpperCase();
}

/** Instituições detectadas automaticamente (services/institutions.ts) → ícone local. */
export const KNOWN_ICON: Readonly<Record<string, string>> = {
  nubank: 'nubank',
  inter: 'inter',
  itau: 'itau',
  bradesco: 'bradesco',
  santander: 'santander',
  bb: 'bancodobrasil',
  caixa: 'caixa',
  c6: 'c6bank',
  btg: 'btgpactual',
  xp: 'xp',
  rico: 'rico',
  mercadopago: 'mercadopago',
  picpay: 'picpay',
  pagbank: 'pagbank',
  neon: 'neon',
  original: 'original',
  sicoob: 'sicoob',
  sicredi: 'sicredi',
  banrisul: 'banrisul',
  safra: 'safra',
  pan: 'pan',
  bmg: 'bmg',
  digio: 'digio',
  will: 'willbank',
  agibank: 'agibank',
  bv: 'bv',
  next: 'next',
  toro: 'toro',
  avenue: 'avenue',
  nomad: 'nomad',
  sofisa: 'sofisa',
  daycoval: 'daycoval',
  brb: 'brb',
  mercantil: 'mercantil',
  porto: 'porto',
  unicred: 'unicred',
  cresol: 'cresol',
  ailos: 'ailos',
  stone: 'stone',
  infinitepay: 'infinitepay',
  banestes: 'banestes',
  banpara: 'banpara',
  banese: 'banese',
  bnb: 'bancodonordeste',
  basa: 'bancodaamazonia',
  cora: 'cora',
  efi: 'efibank',
  warren: 'warren',
  citi: 'citibank',
  bs2: 'bs2',
  wise: 'wise',
  n26: 'n26',
};

/** Ordem de destaque na galeria (bancos mais usados primeiro). */
const POPULAR = [
  'nubank', 'inter', 'itau', 'bradesco', 'bancodobrasil', 'caixa', 'santander', 'c6bank', 'btgpactual', 'xp', 'banrisul',
  'mercadopago', 'picpay', 'pagbank', 'sicredi', 'sicoob', 'neon', 'next', 'original', 'safra', 'bv', 'pan', 'willbank',
  'agibank', 'rico', 'toro', 'avenue', 'nomad', 'porto', 'digio', 'bmg', 'daycoval', 'sofisa', 'brb', 'mercantil', 'unicred',
  'cresol', 'ailos', 'stone', 'infinitepay', 'banestes', 'banpara', 'banese', 'bancodonordeste', 'cora', 'efibank', 'warren',
];
const POP_RANK = new Map(POPULAR.map((s, i) => [s, i]));

export const BANK_ICON_GROUPS: ReadonlyArray<{ kind: BankIconKind; label: string }> = [
  { kind: 'bank', label: 'Bancos, corretoras e fintechs' },
  { kind: 'card', label: 'Cartões e bandeiras' },
  { kind: 'other', label: 'Carteiras, benefícios e outros' },
];

/** Ícones ordenados para a galeria: populares primeiro, depois alfabética. */
export function sortedBankIcons(list: readonly BankIcon[] = BANK_ICONS): BankIcon[] {
  return [...list].sort((a, b) => (POP_RANK.get(a.slug) ?? 999) - (POP_RANK.get(b.slug) ?? 999) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Busca por nome, slug ou código COMPE ("inter", "itaú", "077"). */
export function searchBankIcons(query: string, list: readonly BankIcon[] = BANK_ICONS): BankIcon[] {
  const q = n(query);
  if (!q) return sortedBankIcons(list);
  const compact = q.replace(/\s+/g, '');
  const hits = list.filter((b) => n(b.name).includes(q) || b.slug.includes(compact) || (b.compe ?? '') === compact.padStart(3, '0'));
  // Exato (slug/código) → nome começa com a busca → populares → alfabética.
  const rank = (b: BankIcon) => (b.slug === compact || b.compe === compact.padStart(3, '0') ? 0 : n(b.name).startsWith(q) || b.slug.startsWith(compact) ? 1 : 2);
  return sortedBankIcons(hits).sort((a, b) => rank(a) - rank(b));
}

/** Ícone local para um nome de instituição (ex.: conector "Nubank", "Banco Inter"). */
export function bankIconByName(name: string | null | undefined): BankIcon | null {
  const q = n(name);
  if (!q) return null;
  return BANK_ICONS.find((b) => b.kind === 'bank' && (n(b.name) === q || n(b.name) === `banco ${q}` || `banco ${n(b.name)}` === q)) ?? null;
}

// ------------------------------------------------------------------ produtos (cartões de um banco)

const BASE_OVERRIDE: Record<string, string> = { btgultrablue: 'btgpactual', c6carbon: 'c6bank' };
const IGNORE = new Set(['banco', 'do', 'da', 'de', 'the', 'cartao', 'visa', 'mastercard', 'ourocard', 'metal', 'bank']);

interface Variant {
  icon: BankIcon;
  tokens: string[];
}

const VARIANTS = new Map<string, Variant[]>();
for (const v of BANK_ICONS) {
  if (v.kind !== 'card') continue;
  const baseSlug = BASE_OVERRIDE[v.slug] ?? BANK_ICONS.filter((b) => b.kind === 'bank' && v.slug.startsWith(b.slug) && v.slug !== b.slug).sort((a, b) => b.slug.length - a.slug.length)[0]?.slug;
  if (!baseSlug) continue;
  const base = BY_SLUG.get(baseSlug)!;
  const baseWords = new Set(n(base.name).split(' '));
  const tokens = n(v.name)
    .split(' ')
    .filter((w) => w && !baseWords.has(w) && !IGNORE.has(w));
  if (!tokens.length) continue;
  const list = VARIANTS.get(baseSlug) ?? [];
  list.push({ icon: v, tokens });
  VARIANTS.set(baseSlug, list);
}

/**
 * Ícone do PRODUTO de um cartão (ex.: Nubank Ultravioleta, Itaú Black) quando o banco já é conhecido
 * e o nome/nível do cartão traz a palavra do produto. Todas as palavras do produto precisam aparecer.
 */
export function productIconFor(bankSlug: string | null | undefined, text: string): BankIcon | null {
  if (!bankSlug) return null;
  const words = new Set(n(text).split(' '));
  let best: Variant | null = null;
  for (const v of VARIANTS.get(bankSlug) ?? []) {
    if (v.tokens.every((t) => words.has(t)) && (!best || v.tokens.length > best.tokens.length)) best = v;
  }
  return best?.icon ?? null;
}

/** Variantes (cartões) de um banco — sugeridas primeiro na galeria de um cartão. */
export function variantsOf(bankSlug: string | null | undefined): BankIcon[] {
  return bankSlug ? (VARIANTS.get(bankSlug) ?? []).map((v) => v.icon) : [];
}
