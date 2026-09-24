/**
 * Tipos dos payloads da API Pluggy — subconjunto usado pelo CashFlow.
 * Fonte: SDK oficial `pluggy-sdk` (github.com/pluggyai/pluggy-node, src/types, v0.90.0).
 * Datas chegam como strings ISO 8601 no JSON. Campos opcionais/nulos são tratados como tal.
 * NÃO adicionar campos que não existam no SDK/documentação oficial.
 */

export interface PageResponse<T> {
  results: T[];
  page: number;
  total: number;
  totalPages: number;
}

export interface CursorPageResponse<T> {
  results: T[];
  /** Query string pronta para a próxima página (usar como está) ou null. */
  next: string | null;
}

export interface PluggyApiError {
  code: number;
  codeDescription?: string;
  message?: string;
}

export type PluggyItemStatus = 'UPDATED' | 'UPDATING' | 'WAITING_USER_INPUT' | 'WAITING_USER_ACTION' | 'MERGING' | 'LOGIN_ERROR' | 'OUTDATED';

export interface PluggyConnector {
  id: number;
  name: string;
  institutionUrl?: string;
  imageUrl?: string;
  primaryColor?: string;
  type?: string;
  country?: string;
  isOpenFinance?: boolean;
  isSandbox?: boolean;
  products?: string[];
  health?: { status?: 'ONLINE' | 'OFFLINE' | 'UNSTABLE'; stage?: string | null };
}

export interface PluggyItemProductState {
  isUpdated: boolean;
  lastUpdatedAt: string | null;
  warnings?: Array<{ code: string; message: string; providerMessage?: string }>;
}

export interface PluggyItem {
  id: string;
  connector: PluggyConnector;
  status: PluggyItemStatus;
  statusDetail: Record<string, PluggyItemProductState | null> | null;
  error: { code: string; message: string; providerMessage?: string } | null;
  executionStatus: string;
  createdAt: string;
  updatedAt: string;
  lastUpdatedAt: string | null;
  nextAutoSyncAt?: string | null;
  consentExpiresAt?: string | null;
  clientUserId?: string | null;
}

export interface PluggyBankData {
  transferNumber: string | null;
  closingBalance: number | null;
  automaticallyInvestedBalance: number | null;
  overdraftContractedLimit: number | null;
  overdraftUsedLimit: number | null;
  unarrangedOverdraftAmount: number | null;
  hasReservedBalance?: boolean | null;
  reservedBalances?: Array<{ name: string | null; identification: string; availableAmounts: Array<{ amount: number; currencyCode: string }> }> | null;
}

export interface PluggyCreditData {
  level: string | null;
  brand: string | null;
  brandAdditionalInfo?: string;
  balanceCloseDate: string | null;
  balanceDueDate: string | null;
  availableCreditLimit: number | null;
  balanceForeignCurrency: number | null;
  minimumPayment: number | null;
  creditLimit: number | null;
  isLimitFlexible: boolean | null;
  status: 'ACTIVE' | 'BLOCKED' | 'CANCELLED' | null;
  holderType: 'MAIN' | 'ADDITIONAL' | null;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: 'BANK' | 'CREDIT';
  subtype: 'SAVINGS_ACCOUNT' | 'CHECKING_ACCOUNT' | 'CREDIT_CARD';
  number: string;
  balance: number;
  name: string;
  marketingName: string | null;
  owner: string | null;
  taxNumber: string | null;
  currencyCode: string;
  bankData: PluggyBankData | null;
  creditData: PluggyCreditData | null;
}

export interface PluggyCreditCardMetadata {
  installmentNumber?: number;
  totalInstallments?: number;
  totalAmount?: number;
  payeeMCC?: number;
  purchaseDate?: string;
  billId?: string;
  cardNumber?: string;
  billForecastDate?: string;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw: string | null;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  amountInAccountCurrency: number | null;
  balance: number;
  currencyCode: string;
  category: string | null;
  categoryId: string | null;
  status?: 'PENDING' | 'POSTED';
  providerCode?: string;
  paymentData?: { paymentMethod?: string; referenceNumber?: string; reason?: string } | null;
  creditCardMetadata: PluggyCreditCardMetadata | null;
  merchant?: { name?: string; businessName: string; category?: string } | null;
  operationType: string | null;
  providerId: string | null;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  billClosingDate: string | null;
  totalAmount: number;
  totalAmountCurrencyCode: string;
  minimumPaymentAmount: number | null;
  allowsInstallments: boolean | null;
  financeCharges: Array<{ id: string; type: string; amount: number; currencyCode: string; additionalInfo: string | null }>;
  payments: Array<{ id: string; valueType: string; paymentDate: string; paymentMode: string | null; amount: number; currencyCode: string }>;
}

export interface PluggyInvestment {
  id: string;
  code: string | null;
  isin: string | null;
  itemId: string;
  type: 'MUTUAL_FUND' | 'SECURITY' | 'EQUITY' | 'COE' | 'FIXED_INCOME' | 'ETF' | 'OTHER';
  subtype: string | null;
  name: string;
  currencyCode: string;
  date: string | null;
  value: number | null;
  quantity: number | null;
  balance: number;
  amount: number | null;
  amountWithdrawal: number | null;
  amountProfit: number | null;
  amountOriginal: number | null;
  dueDate: string | null;
  issuer: string | null;
  issueDate: string | null;
  rate: number | null;
  rateType: string | null;
  fixedAnnualRate: number | null;
  lastMonthRate: number | null;
  annualRate: number | null;
  lastTwelveMonthsRate: number | null;
  status: 'ACTIVE' | 'PENDING' | 'TOTAL_WITHDRAWAL' | null;
  institution: { name: string | null; number: string | null } | null;
}

export interface PluggyCategory {
  id: string;
  description: string;
  descriptionTranslated?: string;
  parentId?: string;
  parentDescription?: string;
}

/** Conector (GET /connectors) — somente os campos usados (tipo `Connector` do SDK oficial). */
export interface PluggyConnector {
  id: number;
  name: string;
  institutionUrl?: string;
  imageUrl?: string;
  primaryColor?: string;
  type?: string;
  country?: string;
  isOpenFinance?: boolean;
}

/** Dados brutos coletados de um Item numa sincronização (existem só em memória, durante a normalização). */
export interface RawItemBundle {
  item: PluggyItem;
  accounts: PluggyAccount[];
  transactionsByAccount: Record<string, PluggyTransaction[]>;
  billsByAccount: Record<string, PluggyBill[]>;
  investments: PluggyInvestment[];
  warnings: string[];
}
