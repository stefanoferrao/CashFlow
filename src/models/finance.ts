/**
 * Modelo interno normalizado. A UI e os cálculos dependem SOMENTE destes tipos —
 * nunca dos payloads da Pluggy (ver services/financialDataService.ts).
 */
import type { DateKey, MonthKey } from '../utils/dates';

export type CurrencyCode = string;

export type DataSource = 'pluggy' | 'demo';

export type ItemSyncState = 'connected' | 'syncing' | 'updated' | 'error' | 'action_required';

export interface NormalizedInstitution {
  connectorId: number | null;
  name: string;
  imageUrl: string | null;
  primaryColor: string | null;
  isOpenFinance: boolean;
  isSandbox: boolean;
  // ---- Apresentação (preenchida pela camada de identidade — services/institutions.ts) ----
  /** Nome original do conector da Pluggy (ex.: "MeuPluggy"). */
  connectorName?: string;
  /** Conector intermediário quando o nome exibido é outro (ex.: "Meu Pluggy"). */
  via?: string | null;
  logo?: InstitutionLogo;
  icon?: string | null;
  initials?: string;
  /** Cor do texto legível sobre `primaryColor`. */
  textColor?: string;
  identitySource?: IdentitySource;
  /** Texto dos dados que permitiu identificar o banco (detecção automática). */
  detectedFrom?: string | null;
}

export type InstitutionLogo = 'image' | 'initials' | 'icon';

/**
 * De onde veio a identidade exibida:
 * - connector: nome/logo do próprio conector da Pluggy (conexão direta com o banco)
 * - detected: banco identificado automaticamente nos dados (conexões via Meu Pluggy)
 * - user: definida pelo usuário
 * - unidentified: conexão intermediária (Meu Pluggy) sem banco identificado
 */
export type IdentitySource = 'connector' | 'detected' | 'user' | 'unidentified';

/** Identidade visual definida pelo usuário para uma conexão (Item). Guardada cifrada, só neste navegador. */
export interface InstitutionIdentity {
  name: string;
  /** #RRGGBB */
  color: string;
  logo: InstitutionLogo;
  icon: string | null;
  /** Conector da Pluggy cujo logo é usado (catálogo GET /connectors). */
  connectorId: number | null;
  /** Logo: https (catálogo da Pluggy) ou imagem enviada (data:image/…). */
  imageUrl: string | null;
  /** Ícone da biblioteca local (public/banks/<slug>.svg) — tem prioridade sobre imageUrl. */
  bank?: string | null;
  updatedAt: string;
}

/** Logo próprio de uma conta ou cartão (ex.: "Nubank Ultravioleta"), em vez do da instituição. */
export interface ProductLogo {
  /** Ícone da biblioteca local. */
  bank: string | null;
  /** Imagem enviada (data:image/…). */
  imageUrl: string | null;
  /** true = usar o logo da instituição mesmo que o nome do cartão indique um produto (ex.: "Ultravioleta"). */
  inherit?: boolean;
}

/** Logo pronto para exibir (instituição ou produto). */
export interface LogoView {
  name: string;
  imageUrl: string | null;
  primaryColor: string | null;
  logo: InstitutionLogo;
  icon: string | null;
  initials: string;
  textColor: string;
}

/** Dias de fechamento/vencimento definidos pelo usuário (usados quando a instituição não informa). */
export interface CardCycleSetting {
  /** 1–31 (meses mais curtos usam o último dia). */
  closingDay: number | null;
  dueDay: number | null;
}

export interface UserLabels {
  /** Por itemId. */
  identities: Record<string, InstitutionIdentity>;
  /** Apelidos de contas e cartões, por id. */
  nicknames: Record<string, string>;
  /** Ciclo de fatura manual, por id do cartão. */
  cardCycles: Record<string, CardCycleSetting>;
  /** Logo próprio de contas e cartões, por id. */
  productLogos: Record<string, ProductLogo>;
}

export const emptyLabels = (): UserLabels => ({ identities: {}, nicknames: {}, cardCycles: {}, productLogos: {} });

/** Tolera registros salvos por versões anteriores (campos ausentes). */
export function normalizeLabels(v: Partial<UserLabels> | null | undefined): UserLabels {
  return { identities: v?.identities ?? {}, nicknames: v?.nicknames ?? {}, cardCycles: v?.cardCycles ?? {}, productLogos: v?.productLogos ?? {} };
}

/** Subconjunto do catálogo de conectores da Pluggy (GET /connectors) usado para logo e cor. */
export interface ConnectorInfo {
  id: number;
  name: string;
  imageUrl: string | null;
  primaryColor: string | null;
  type: string | null;
  isOpenFinance: boolean;
}

export interface NormalizedItem {
  id: string;
  institution: NormalizedInstitution;
  /** Status bruto da Pluggy (UPDATED, UPDATING, LOGIN_ERROR, OUTDATED, ...). */
  status: string;
  executionStatus: string;
  syncState: ItemSyncState;
  /** Última sincronização da Pluggy com a instituição. */
  lastUpdatedAt: string | null;
  nextAutoSyncAt: string | null;
  consentExpiresAt: string | null;
  /** Mensagem amigável quando há erro/ação necessária. */
  message: string | null;
  /** Produtos que falharam em PARTIAL_SUCCESS. */
  partialProducts: string[];
}

export type AccountKind = 'checking' | 'savings' | 'other';

export const ACCOUNT_TYPE_LABEL: Record<AccountKind, string> = { checking: 'Conta corrente', savings: 'Poupança', other: 'Conta' };

export interface NormalizedAccount {
  id: string;
  itemId: string;
  institution: string;
  name: string;
  type: AccountKind;
  /** Últimos dígitos apenas (nunca o número completo). */
  lastDigits: string | null;
  balance: number;
  currency: CurrencyCode;
  updatedAt: string | null;
  overdraftLimit: number | null;
  overdraftUsed: number | null;
  /** Saldo aplicado automaticamente (informativo; NÃO é somado — pode já estar no saldo). */
  automaticallyInvested: number | null;
  /** Soma de saldos reservados ("caixinhas") informada pela instituição (informativo). */
  reservedTotal: number | null;
  // ---- Apresentação (camada de identidade) ----
  /** Nome original informado pela instituição, quando o exibido é outro. */
  rawName?: string;
  nickname?: string | null;
  /** "Instituição · Nome" — para contextos em que a instituição não aparece ao lado. */
  label?: string;
  /** Logo próprio desta conta (quando diferente do da instituição). */
  logo?: LogoView | null;
}

export interface NormalizedCard {
  id: string;
  itemId: string;
  institution: string;
  institutionColor: string | null;
  name: string;
  brand: string | null;
  level: string | null;
  lastFourDigits: string | null;
  currency: CurrencyCode;
  limit: number | null;
  availableLimit: number | null;
  /** limit − availableLimit quando ambos existem. */
  usedLimit: number | null;
  /** `balance` bruto da Pluggy (significado varia por tipo de conector — ver auditoria). */
  institutionBalance: number;
  minimumPayment: number | null;
  closingDate: DateKey | null;
  dueDate: DateKey | null;
  status: string | null;
  holderType: string | null;
  isOpenFinance: boolean;
  updatedAt: string | null;
  // ---- Apresentação (camada de identidade) ----
  rawName?: string;
  nickname?: string | null;
  label?: string;
  /** Dias definidos pelo usuário — têm prioridade sobre as datas da instituição. */
  manualClosingDay?: number | null;
  manualDueDay?: number | null;
  /** Logo próprio deste cartão (produto, ex.: "Nubank Ultravioleta"), quando diferente do da instituição. */
  logo?: LogoView | null;
  /** De onde veio o logo do cartão: escolhido pelo usuário ou reconhecido pelo nome/nível do cartão. */
  logoSource?: 'user' | 'detected' | null;
}

export interface NormalizedBill {
  id: string;
  cardId: string;
  dueDate: DateKey;
  closingDate: DateKey | null;
  totalAmount: number;
  currency: CurrencyCode;
  minimumPayment: number | null;
  paidAmount: number;
  /** true quando a soma dos pagamentos informados cobre o total. */
  isPaid: boolean;
  financeCharges: number;
}

/**
 * Natureza da transação para fins de cálculo (evita dupla contagem):
 * - income / expense: entram no fluxo de caixa
 * - internal_transfer: entre contas do próprio titular (não é receita nem despesa)
 * - card_payment: pagamento de fatura (a despesa real já está nas compras do cartão)
 * - investment: aplicação/resgate (movimento de patrimônio, não despesa)
 */
export type TransactionKind = 'income' | 'expense' | 'internal_transfer' | 'card_payment' | 'investment';

export interface NormalizedTransaction {
  id: string;
  date: DateKey;
  description: string;
  /** Valor na perspectiva do usuário: positivo = entrou dinheiro, negativo = saiu (compras no cartão são negativas). */
  amount: number;
  currency: CurrencyCode;
  kind: TransactionKind;
  status: 'posted' | 'pending';
  source: 'bank' | 'card';
  accountId: string | null;
  cardId: string | null;
  itemId: string;
  institution: string;
  category: AppCategoryId;
  subcategory: string | null;
  /** Categoria original da Pluggy (PT quando disponível). */
  providerCategory: string | null;
  providerCategoryId: string | null;
  installment: { number: number; total: number } | null;
  /** Data da compra original (parcelas) — ajuda a saber se `date` é a data da compra ou da parcela. */
  purchaseDate?: DateKey | null;
  billId: string | null;
  /** 'YYYY-MM' — só em conectores Open Finance. */
  billForecast: MonthKey | null;
  merchant: string | null;
  paymentMethod: string | null;
  /** Usuário marcou "ignorar nos cálculos". */
  ignored: boolean;
  /** Categoria alterada localmente pelo usuário. */
  userCategorized: boolean;
}

export type InvestmentClass = 'renda_fixa' | 'fundos' | 'acoes' | 'etfs' | 'previdencia' | 'outros';

export interface NormalizedInvestment {
  id: string;
  itemId: string;
  institution: string;
  name: string;
  type: string;
  subtype: string | null;
  investmentClass: InvestmentClass;
  /** Valor líquido atual (Pluggy `balance`). */
  value: number;
  /** Valor bruto (Pluggy `amount`) — pode não existir. */
  grossValue: number | null;
  originalValue: number | null;
  profit: number | null;
  currency: CurrencyCode;
  dueDate: DateKey | null;
  issuer: string | null;
  rate: number | null;
  rateType: string | null;
  fixedAnnualRate: number | null;
  /** Rentabilidade do último mês informada pela instituição (fração: 0,0087 = 0,87%). */
  lastMonthRate: number | null;
  /** Rentabilidade dos últimos 12 meses informada pela instituição (fração). */
  lastTwelveMonthsRate: number | null;
  status: string | null;
  referenceDate: DateKey | null;
  /** Data da aplicação, quando a instituição informa. */
  purchaseDate?: DateKey | null;
  /** Data de emissão do título. */
  issueDate?: DateKey | null;
  /** Quantidade de cotas/títulos na posição. */
  quantity?: number | null;
  /**
   * Movimentações do produto (GET /investments/{id}/transactions): aplicações, resgates, rendimentos pagos, impostos.
   * null = não disponibilizadas pela instituição.
   */
  movements?: InvestmentMovement[] | null;
}

export type InvestmentMovementType = 'BUY' | 'SELL' | 'TAX' | 'TRANSFER' | 'INTEREST' | 'AMORTIZATION' | 'OTHER';

export interface InvestmentMovement {
  date: DateKey;
  type: InvestmentMovementType;
  /** in = dinheiro entrou no investimento; out = saiu (resgate, juros/amortização pagos, imposto). null = não informado. */
  direction: 'in' | 'out' | null;
  /** Valor bruto da operação (sempre positivo). */
  amount: number;
  quantity: number | null;
}

export interface NetWorthSnapshot {
  date: DateKey;
  accounts: number;
  investments: number;
  cardDebt: number;
  netWorth: number;
  currency: CurrencyCode;
}

export interface FinancialDataset {
  source: DataSource;
  items: NormalizedItem[];
  accounts: NormalizedAccount[];
  cards: NormalizedCard[];
  bills: NormalizedBill[];
  transactions: NormalizedTransaction[];
  investments: NormalizedInvestment[];
  snapshots: NetWorthSnapshot[];
  fetchedAt: string | null;
  /** Avisos de dados parciais/indisponíveis por item. */
  warnings: string[];
  /**
   * Conexões repetidas (mesmo conector e mesmas contas/cartões de outra conexão mais recente).
   * Os dados delas ficam FORA do dataset para não somar o mesmo dinheiro duas vezes.
   */
  duplicates?: DuplicateItem[];
}

export interface DuplicateItem {
  itemId: string;
  /** Conexão mantida (mais recente). */
  duplicateOf: string;
}

export const emptyDataset = (source: DataSource = 'pluggy'): FinancialDataset => ({
  source,
  items: [],
  accounts: [],
  cards: [],
  bills: [],
  transactions: [],
  investments: [],
  snapshots: [],
  fetchedAt: null,
  warnings: [],
});

// ---------------- Categorias do app ----------------

export type AppCategoryId =
  | 'moradia'
  | 'alimentacao'
  | 'transporte'
  | 'saude'
  | 'educacao'
  | 'lazer'
  | 'assinaturas'
  | 'compras'
  | 'investimentos'
  | 'transferencias'
  | 'receitas'
  | 'outros';

export interface AppCategory {
  id: AppCategoryId;
  label: string;
  /** Índice na paleta categórica (charts). */
  colorIndex: number;
  icon: string;
}

export const APP_CATEGORIES: readonly AppCategory[] = [
  { id: 'moradia', label: 'Moradia', colorIndex: 0, icon: 'home' },
  { id: 'alimentacao', label: 'Alimentação', colorIndex: 1, icon: 'food' },
  { id: 'transporte', label: 'Transporte', colorIndex: 2, icon: 'car' },
  { id: 'saude', label: 'Saúde', colorIndex: 3, icon: 'heart' },
  { id: 'educacao', label: 'Educação', colorIndex: 4, icon: 'book' },
  { id: 'lazer', label: 'Lazer', colorIndex: 5, icon: 'sparkle' },
  { id: 'assinaturas', label: 'Assinaturas', colorIndex: 6, icon: 'repeat' },
  { id: 'compras', label: 'Compras', colorIndex: 7, icon: 'bag' },
  { id: 'investimentos', label: 'Investimentos', colorIndex: 8, icon: 'trending' },
  { id: 'transferencias', label: 'Transferências', colorIndex: 9, icon: 'swap' },
  { id: 'receitas', label: 'Receitas', colorIndex: 10, icon: 'arrowDown' },
  { id: 'outros', label: 'Outros', colorIndex: 11, icon: 'dots' },
] as const;

export const CATEGORY_BY_ID: Record<AppCategoryId, AppCategory> = Object.fromEntries(
  APP_CATEGORIES.map((c) => [c.id, c]),
) as Record<AppCategoryId, AppCategory>;

export const INVESTMENT_CLASS_LABEL: Record<InvestmentClass, string> = {
  renda_fixa: 'Renda fixa',
  fundos: 'Fundos',
  acoes: 'Ações',
  etfs: 'ETFs',
  previdencia: 'Previdência',
  outros: 'Outros',
};

export const TRANSACTION_KIND_LABEL: Record<TransactionKind, string> = {
  income: 'Entrada',
  expense: 'Saída',
  internal_transfer: 'Transferência própria',
  card_payment: 'Pagamento de fatura',
  investment: 'Investimento',
};

// ---------------- Categorização local do usuário ----------------

export interface CategoryOverride {
  category?: AppCategoryId;
  subcategory?: string | null;
  ignored?: boolean;
}

export interface CategoryRule {
  id: string;
  /** Texto buscado (sem diferenciar maiúsculas/acentos) na descrição. */
  contains: string;
  category: AppCategoryId;
  subcategory: string | null;
}

export interface UserCategorization {
  overrides: Record<string, CategoryOverride>;
  rules: CategoryRule[];
  /** Subcategorias criadas pelo usuário, por categoria. */
  customSubcategories: Partial<Record<AppCategoryId, string[]>>;
}

export const emptyCategorization = (): UserCategorization => ({ overrides: {}, rules: [], customSubcategories: {} });

// ---------------- Lançamentos previstos manuais ----------------

export interface PlannedEntry {
  id: string;
  description: string;
  /** positivo = receita, negativo = despesa */
  amount: number;
  date: DateKey;
  recurrence: 'none' | 'monthly';
}
