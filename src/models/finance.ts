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
  lastMonthRate: number | null;
  lastTwelveMonthsRate: number | null;
  status: string | null;
  referenceDate: DateKey | null;
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
