/**
 * Categorização: Pluggy → categorias do app, + regras e ajustes locais do usuário.
 *
 * A Pluggy devolve `category` (descrição da categoria mais específica, em inglês) e `categoryId` (8 dígitos).
 * Com GET /categories montamos a árvore (parentId) para achar a categoria raiz e a tradução (descriptionTranslated).
 * Categorização é recurso premium após o trial: `category` pode vir null → "Outros" (ou regra do usuário).
 */
import type { PluggyCategory } from '../pluggy/types';
import {
  type AppCategoryId,
  type NormalizedTransaction,
  type TransactionKind,
  type UserCategorization,
} from '../models/finance';

/** Raízes documentadas da árvore de categorias da Pluggy → categorias do app. */
const ROOT_MAP: Record<string, AppCategoryId> = {
  income: 'receitas',
  'loans and financing': 'outros',
  investments: 'investimentos',
  'same person transfer': 'transferencias',
  transfers: 'transferencias',
  'legal obligations': 'outros',
  services: 'outros',
  shopping: 'compras',
  'digital services': 'assinaturas',
  groceries: 'alimentacao',
  'food and drinks': 'alimentacao',
  travel: 'lazer',
  donations: 'outros',
  gambling: 'lazer',
  taxes: 'outros',
  'bank fees': 'outros',
  housing: 'moradia',
  healthcare: 'saude',
  transportation: 'transporte',
  insurance: 'outros',
  leisure: 'lazer',
  education: 'educacao',
};

/** Palavras-chave usadas só quando a árvore de categorias não está disponível. */
const KEYWORD_MAP: Array<[RegExp, AppCategoryId]> = [
  [/same person transfer/i, 'transferencias'],
  [/credit card payment/i, 'transferencias'],
  [/salary|income|wage|pension|proceeds|dividend|interest received/i, 'receitas'],
  [/invest|savings|fixed income|variable income/i, 'investimentos'],
  [/transfer|pix|ted|doc\b/i, 'transferencias'],
  [/grocer|supermarket|food|restaurant|drink|bakery|delivery/i, 'alimentacao'],
  [/rent|housing|electricity|water|gas\b|condomin|utilities|internet|telephone|telecom/i, 'moradia'],
  [/taxi|ride|uber|fuel|gas station|parking|toll|public transport|transport|vehicle/i, 'transporte'],
  [/pharmac|drugstore|health|hospital|clinic|doctor|dent|optic|laborator/i, 'saude'],
  [/school|educat|course|universit|book/i, 'educacao'],
  [/streaming|subscription|video|music|software|digital/i, 'assinaturas'],
  [/travel|hotel|airline|flight|leisure|entertain|cinema|sport|game|gambl/i, 'lazer'],
  [/shopping|clothing|electronics|store|department|online shopping/i, 'compras'],
];

interface CatNode {
  id: string;
  description: string;
  translated: string | null;
  parentId: string | null;
}

export interface ResolvedCategory {
  app: AppCategoryId;
  subcategory: string | null;
  providerLabel: string | null;
  rootDescription: string | null;
  leafDescription: string | null;
}

export class CategoryResolver {
  private readonly nodes = new Map<string, CatNode>();

  constructor(categories: PluggyCategory[] = []) {
    for (const c of categories) {
      this.nodes.set(c.id, { id: c.id, description: c.description, translated: c.descriptionTranslated ?? null, parentId: c.parentId ?? null });
    }
  }

  get hasTree(): boolean {
    return this.nodes.size > 0;
  }

  private root(node: CatNode): CatNode {
    let cur = node;
    for (let guard = 0; guard < 10 && cur.parentId; guard++) {
      const p = this.nodes.get(cur.parentId);
      if (!p) break;
      cur = p;
    }
    if (cur.parentId === null) return cur;
    // Fallback: ids hierárquicos de 8 dígitos (2 dígitos por nível).
    const guessId = `${cur.id.slice(0, 2)}000000`;
    return this.nodes.get(guessId) ?? cur;
  }

  resolve(category: string | null, categoryId: string | null): ResolvedCategory {
    const leaf = categoryId ? this.nodes.get(categoryId) : undefined;
    if (leaf) {
      const root = this.root(leaf);
      const app = ROOT_MAP[root.description.toLowerCase()] ?? keywordCategory(`${root.description} ${leaf.description}`) ?? 'outros';
      const sub = leaf.id !== root.id ? leaf.translated ?? leaf.description : null;
      return {
        app,
        subcategory: sub,
        providerLabel: leaf.translated ?? leaf.description,
        rootDescription: root.description,
        leafDescription: leaf.description,
      };
    }
    if (category) {
      const app = ROOT_MAP[category.toLowerCase()] ?? keywordCategory(category) ?? 'outros';
      return { app, subcategory: null, providerLabel: category, rootDescription: null, leafDescription: category };
    }
    return { app: 'outros', subcategory: null, providerLabel: null, rootDescription: null, leafDescription: null };
  }
}

function keywordCategory(text: string): AppCategoryId | null {
  for (const [re, cat] of KEYWORD_MAP) if (re.test(text)) return cat;
  return null;
}

export function isSamePersonTransfer(r: ResolvedCategory): boolean {
  return /same person transfer/i.test(`${r.rootDescription ?? ''} ${r.leafDescription ?? ''}`);
}

const CARD_PAYMENT_DESC = /(pag(amento|to)?\.?\s*(de\s+)?(fat(ura)?|cart[aã]o))|(fatura\s+(do\s+)?cart)|pagamento\s+(recebido|efetuado)|credit card payment|payment received/i;

export function isCardPayment(r: ResolvedCategory, description: string): boolean {
  return /credit card payment/i.test(`${r.leafDescription ?? ''}`) || CARD_PAYMENT_DESC.test(description);
}

/** Remove acentos e baixa a caixa (busca e regras). */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export const SUBCATEGORY_INTERNAL_TRANSFER = 'Entre contas próprias';
export const SUBCATEGORY_CARD_PAYMENT = 'Pagamento de fatura';

/** Subcategorias sugeridas (o usuário pode criar outras). */
export const DEFAULT_SUBCATEGORIES: Partial<Record<AppCategoryId, string[]>> = {
  moradia: ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet', 'Manutenção'],
  alimentacao: ['Supermercado', 'Restaurantes', 'Delivery', 'Padaria'],
  transporte: ['Combustível', 'Aplicativos', 'Transporte público', 'Estacionamento', 'Manutenção'],
  saude: ['Farmácia', 'Consultas', 'Plano de saúde', 'Academia'],
  educacao: ['Cursos', 'Livros', 'Mensalidade'],
  lazer: ['Viagens', 'Cinema e shows', 'Hobbies'],
  assinaturas: ['Streaming', 'Música', 'Software', 'Nuvem'],
  compras: ['Vestuário', 'Eletrônicos', 'Casa', 'Presentes'],
  investimentos: ['Aplicação', 'Resgate'],
  transferencias: [SUBCATEGORY_INTERNAL_TRANSFER, SUBCATEGORY_CARD_PAYMENT, 'PIX/TED para terceiros'],
  receitas: ['Salário', 'Freelance', 'Rendimentos', 'Reembolsos'],
  outros: ['Tarifas', 'Impostos', 'Seguros', 'Doações'],
};

/** Deriva a natureza da transação a partir da categoria (usado quando o usuário recategoriza). */
export function kindFor(tx: Pick<NormalizedTransaction, 'amount' | 'source'>, category: AppCategoryId, subcategory: string | null, fallback: TransactionKind): TransactionKind {
  if (subcategory === SUBCATEGORY_INTERNAL_TRANSFER) return 'internal_transfer';
  if (subcategory === SUBCATEGORY_CARD_PAYMENT) return 'card_payment';
  if (category === 'investimentos' && tx.source === 'bank') return 'investment';
  if (fallback === 'internal_transfer' || fallback === 'card_payment' || fallback === 'investment') {
    // Usuário moveu para outra categoria: volta a contar como entrada/saída.
    return tx.amount >= 0 ? (tx.source === 'card' ? 'expense' : 'income') : 'expense';
  }
  return fallback;
}

/**
 * Aplica regras e ajustes locais. Ordem: ajuste individual > regra (primeira que casar) > categoria da Pluggy.
 * Retorna NOVOS objetos (não muta o dataset).
 */
export function applyUserCategorization(transactions: NormalizedTransaction[], uc: UserCategorization): NormalizedTransaction[] {
  if (!uc.rules.length && !Object.keys(uc.overrides).length) return transactions;
  const rules = uc.rules.map((r) => ({ ...r, needle: normalizeText(r.contains.trim()) })).filter((r) => r.needle.length > 0);
  return transactions.map((tx) => {
    const ov = uc.overrides[tx.id];
    let category = tx.category;
    let subcategory = tx.subcategory;
    let changed = false;
    if (ov?.category) {
      category = ov.category;
      subcategory = ov.subcategory ?? null;
      changed = true;
    } else if (rules.length) {
      const desc = normalizeText(tx.description);
      const rule = rules.find((r) => desc.includes(r.needle));
      if (rule) {
        category = rule.category;
        subcategory = rule.subcategory;
        changed = true;
      }
    }
    const ignored = ov?.ignored ?? tx.ignored;
    if (!changed && ignored === tx.ignored) return tx;
    const kind = changed ? kindFor(tx, category, subcategory, tx.kind) : tx.kind;
    return { ...tx, category, subcategory, kind, ignored, userCategorized: changed || tx.userCategorized };
  });
}
