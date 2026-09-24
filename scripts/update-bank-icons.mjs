#!/usr/bin/env node
/**
 * Atualiza a biblioteca local de ícones de instituições a partir do projeto react-bancos (MIT):
 *   https://github.com/henriquezolini/react-bancos
 *
 * Uso:
 *   git clone --depth 1 https://github.com/henriquezolini/react-bancos /tmp/react-bancos
 *   node scripts/update-bank-icons.mjs /tmp/react-bancos
 *
 * Gera:
 *   public/banks/<slug>.svg          — SVGs originais, só sem espaços/comentários (servidos pelo próprio site)
 *   public/banks/LICENSE.txt         — licença MIT do react-bancos + aviso de marcas
 *   src/services/bankIcons.data.ts   — metadados (slug, nome, código COMPE, cor, grupo)
 *
 * Os ícones são carregados como <img> do mesmo domínio: não executam scripts e não
 * fazem requisições a terceiros (a CSP já cobre com img-src 'self').
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'icons'))) {
  console.error('Informe o caminho de um clone do react-bancos: node scripts/update-bank-icons.mjs <pasta>');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'banks');

const dataTs = fs.readFileSync(path.join(src, 'src', 'data.ts'), 'utf8');
const rows = [...dataTs.matchAll(/\{ slug: "([^"]+)", name: "([^"]+)", compe: (null|"\d+"), color: (null|"#[0-9a-fA-F]{3,8}") \}/g)].map((m) => ({
  slug: m[1],
  name: m[2],
  compe: m[3] === 'null' ? null : m[3].slice(1, -1),
  color: m[4] === 'null' ? null : m[4].slice(1, -1).toUpperCase(),
}));
if (rows.length < 50) throw new Error(`Poucos ícones encontrados em data.ts (${rows.length}) — o formato mudou?`);

const NETWORKS = new Set(['amex', 'dinersclub', 'discover', 'elo', 'hipercard', 'jcb', 'maestro', 'mastercard', 'unionpay', 'visa', 'visaelectron']);
const OTHER = new Set([
  'applepay', 'googlepay', 'paypal', 'cashapp', 'venmo', 'zelle', 'skrill', 'neteller', 'payoneer', 'paycash', 'recargapay', '99pay',
  'alelo', 'caju', 'flash', 'ifood', 'pluxee', 'swile', 'ticket', 'vrbeneficios', 'edenred',
  'binance', 'bitget', 'bitso', 'bybit', 'coinbase', 'cryptocom', 'mercadobitcoin', 'okx', 'ripio',
  'adyen', 'stripe', 'square', 'sumup', 'pagarme', 'iugu', 'dock', 'klavi', 'qive', 'onfly', 'transfeera', 'pluggy', 'outros',
]);
const CARD = /^cart[aã]o\b|\binfinite\b|black|ultravioleta|croma|carbon|ultrablue|the one|unique|elite|gold|platinum|iridium|ourocard/i;
const kindOf = (r) => (NETWORKS.has(r.slug) || CARD.test(r.name) ? 'card' : OTHER.has(r.slug) ? 'other' : 'bank');

/** Minificação conservadora: não mexe em ids, classes, estilos nem caminhos. */
function minify(svg) {
  return svg
    .replace(/<\?xml[^?]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(\/?>)/g, '$1')
    .trim();
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
let bytes = 0;
const kept = [];
for (const r of rows) {
  const file = path.join(src, 'icons', `${r.slug}.svg`);
  if (!fs.existsSync(file)) continue;
  const svg = minify(fs.readFileSync(file, 'utf8'));
  if (/<script|javascript:|\bon[a-z]+=|<foreignObject|(?:xlink:)?href="(?!#)/i.test(svg)) {
    console.warn(`ignorado (conteúdo ativo ou referência externa): ${r.slug}`);
    continue;
  }
  fs.writeFileSync(path.join(outDir, `${r.slug}.svg`), svg);
  bytes += svg.length;
  kept.push({ ...r, kind: kindOf(r) });
}
fs.writeFileSync(
  path.join(outDir, 'LICENSE.txt'),
  `Ícones de instituições: react-bancos — https://github.com/henriquezolini/react-bancos\n\n${fs.readFileSync(path.join(src, 'LICENSE'), 'utf8')}`,
);

const rev = (() => {
  try {
    const head = fs.readFileSync(path.join(src, '.git', 'HEAD'), 'utf8').trim();
    return head.startsWith('ref:') ? fs.readFileSync(path.join(src, '.git', head.slice(5)), 'utf8').trim() : head;
  } catch {
    return 'desconhecida';
  }
})();
const body = kept.map((r) => `  { slug: ${JSON.stringify(r.slug)}, name: ${JSON.stringify(r.name)}, compe: ${JSON.stringify(r.compe)}, color: ${JSON.stringify(r.color)}, kind: '${r.kind}' },`).join('\n');
fs.writeFileSync(
  path.join(root, 'src', 'services', 'bankIcons.data.ts'),
  `// Gerado por scripts/update-bank-icons.mjs a partir do react-bancos (MIT, commit ${rev.slice(0, 12)}) — não editar à mão.
// Os logos são marcas de seus titulares, usados só para identificar as instituições.
export type BankIconKind = 'bank' | 'card' | 'other';

export interface BankIcon {
  /** Nome do arquivo em public/banks/<slug>.svg */
  slug: string;
  name: string;
  /** Código de compensação do Bacen, quando houver. */
  compe: string | null;
  /** Cor de fundo do ícone (#RRGGBB). */
  color: string | null;
  kind: BankIconKind;
}

export const BANK_ICONS: readonly BankIcon[] = [
${body}
];
`,
);
console.log(`${kept.length} ícones (${(bytes / 1024).toFixed(0)} KB) → public/banks; metadados → src/services/bankIcons.data.ts`);
