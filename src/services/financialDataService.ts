/**
 * FinancialDataService — camada ÚNICA de normalização: payloads Pluggy → modelo interno.
 * A UI nunca toca nos tipos da Pluggy. Dados pessoais desnecessários (CPF, nome do titular,
 * dados de pagador/recebedor, número completo da conta) são descartados aqui.
 */
import {
  type FinancialDataset,
  type InvestmentClass,
  type NormalizedAccount,
  type NormalizedBill,
  type NormalizedCard,
  type NormalizedInstitution,
  type NormalizedInvestment,
  type NormalizedItem,
  type NormalizedTransaction,
  type TransactionKind,
  emptyDataset,
} from '../models/finance';
import { describeItemExecution } from '../pluggy/errors';
import type { PluggyAccount, PluggyBill, PluggyInvestment, PluggyItem, PluggyTransaction, RawItemBundle } from '../pluggy/types';
import { apiDateToKey } from '../utils/dates';
import {
  CategoryResolver,
  SUBCATEGORY_CARD_PAYMENT,
  SUBCATEGORY_INTERNAL_TRANSFER,
  isCardPayment,
  isSamePersonTransfer,
} from './categories';

const round2 = (n: number) => Math.round(n * 100) / 100;

function lastDigits(value: string | null | undefined, n = 4): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits ? digits.slice(-n) : null;
}

export function normalizeInstitution(item: PluggyItem): NormalizedInstitution {
  const c = item.connector ?? ({} as PluggyItem['connector']);
  return {
    connectorId: typeof c.id === 'number' ? c.id : null,
    name: c.name ?? 'Instituição',
    imageUrl: typeof c.imageUrl === 'string' && /^https:\/\//.test(c.imageUrl) ? c.imageUrl : null,
    primaryColor: typeof c.primaryColor === 'string' && /^#?[0-9a-f]{3,8}$/i.test(c.primaryColor) ? (c.primaryColor.startsWith('#') ? c.primaryColor : `#${c.primaryColor}`) : null,
    isOpenFinance: !!c.isOpenFinance,
    isSandbox: !!c.isSandbox,
  };
}

export function normalizeItem(item: PluggyItem): NormalizedItem {
  const desc = describeItemExecution(item.status, item.executionStatus, item.error?.code ?? null);
  const partialProducts = item.statusDetail
    ? Object.entries(item.statusDetail)
        .filter(([, v]) => v && v.isUpdated === false)
        .map(([k]) => k)
    : [];
  return {
    id: item.id,
    institution: normalizeInstitution(item),
    status: item.status,
    executionStatus: item.executionStatus,
    syncState: desc.state,
    lastUpdatedAt: item.lastUpdatedAt ?? null,
    nextAutoSyncAt: item.nextAutoSyncAt ?? null,
    consentExpiresAt: item.consentExpiresAt ?? null,
    message: desc.message,
    partialProducts,
  };
}

/** Algumas instituições usam o nome do titular como nome da conta/cartão: não guardamos o nome do titular. */
export function isHolderName(name: string, owner: string | null | undefined): boolean {
  if (!owner) return false;
  const words = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
  const a = words(name);
  const b = words(owner);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  // Nome abreviado do titular ("STEFANO L FERRAO" para "Stefano Luiz Ferrao"): mesmo primeiro e último nome,
  // e cada palavra do meio é um nome do titular ou a inicial dele, na ordem.
  if (a.length < 2 || a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1]) return false;
  let j = 1;
  for (let i = 1; i < a.length - 1; i++) {
    const w = a[i]!;
    while (j < b.length - 1 && !(b[j] === w || (w.length === 1 && b[j]![0] === w))) j++;
    if (j >= b.length - 1) return false;
    j++;
  }
  return true;
}

function accountName(acc: PluggyAccount, fallback: string): string {
  const name = acc.marketingName || acc.name || fallback;
  return isHolderName(name, acc.owner) ? fallback : name;
}

export function normalizeAccount(acc: PluggyAccount, institution: string, updatedAt: string | null): NormalizedAccount {
  const bd = acc.bankData;
  const reserved = bd?.reservedBalances?.reduce((s, r) => s + r.availableAmounts.reduce((a, x) => a + (x.amount ?? 0), 0), 0) ?? null;
  return {
    id: acc.id,
    itemId: acc.itemId,
    institution,
    name: accountName(acc, acc.subtype === 'CHECKING_ACCOUNT' ? 'Conta corrente' : acc.subtype === 'SAVINGS_ACCOUNT' ? 'Poupança' : 'Conta'),
    type: acc.subtype === 'CHECKING_ACCOUNT' ? 'checking' : acc.subtype === 'SAVINGS_ACCOUNT' ? 'savings' : 'other',
    lastDigits: lastDigits(acc.number),
    balance: round2(acc.balance ?? 0),
    currency: acc.currencyCode || 'BRL',
    updatedAt,
    overdraftLimit: bd?.overdraftContractedLimit ?? null,
    overdraftUsed: bd?.overdraftUsedLimit ?? null,
    automaticallyInvested: bd?.automaticallyInvestedBalance ?? null,
    reservedTotal: reserved === null ? null : round2(reserved),
  };
}

export function normalizeCard(acc: PluggyAccount, institution: string, color: string | null, isOpenFinance: boolean, updatedAt: string | null): NormalizedCard {
  const cd = acc.creditData;
  const limit = cd?.creditLimit ?? null;
  const available = cd?.availableCreditLimit ?? null;
  const used = limit !== null && available !== null ? round2(Math.max(0, limit - available)) : null;
  return {
    id: acc.id,
    itemId: acc.itemId,
    institution,
    institutionColor: color,
    name: accountName(acc, [cd?.brand, cd?.level].filter(Boolean).join(' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) || 'Cartão de crédito'),
    brand: cd?.brand ?? null,
    level: cd?.level ?? null,
    lastFourDigits: lastDigits(acc.number),
    currency: acc.currencyCode || 'BRL',
    limit,
    availableLimit: available,
    usedLimit: used,
    institutionBalance: round2(acc.balance ?? 0),
    minimumPayment: cd?.minimumPayment ?? null,
    closingDate: apiDateToKey(cd?.balanceCloseDate ?? null),
    dueDate: apiDateToKey(cd?.balanceDueDate ?? null),
    status: cd?.status ?? null,
    holderType: cd?.holderType ?? null,
    isOpenFinance,
    updatedAt,
  };
}

interface TxContext {
  source: 'bank' | 'card';
  accountId: string;
  accountCurrency: string;
  itemId: string;
  institution: string;
  resolver: CategoryResolver;
}

export function normalizeTransaction(tx: PluggyTransaction, ctx: TxContext): NormalizedTransaction | null {
  const date = apiDateToKey(tx.date);
  if (!date) return null;
  // Valor na moeda da conta quando for compra internacional.
  const useAccountCurrency = typeof tx.amountInAccountCurrency === 'number';
  const raw = useAccountCurrency ? (tx.amountInAccountCurrency as number) : tx.amount;
  const currency = useAccountCurrency ? ctx.accountCurrency : tx.currencyCode || ctx.accountCurrency;
  // Convenção documentada: banco (+ entrada / − saída); cartão (+ compra / − pagamento/estorno).
  const amount = round2(ctx.source === 'card' ? -raw : raw);

  const resolved = ctx.resolver.resolve(tx.category, tx.categoryId);
  const description = (tx.description || tx.descriptionRaw || 'Sem descrição').trim();
  let category = resolved.app;
  let subcategory = resolved.subcategory;
  let kind: TransactionKind;

  if (isSamePersonTransfer(resolved)) {
    kind = 'internal_transfer';
    category = 'transferencias';
    subcategory = SUBCATEGORY_INTERNAL_TRANSFER;
  } else if (isCardPayment(resolved, description) && (ctx.source === 'bank' ? amount < 0 : amount > 0)) {
    // Banco: saída para pagar fatura. Cartão: crédito do pagamento. Nenhum dos dois é despesa.
    kind = 'card_payment';
    category = 'transferencias';
    subcategory = SUBCATEGORY_CARD_PAYMENT;
  } else if (ctx.source === 'bank' && category === 'investimentos') {
    kind = 'investment';
  } else if (ctx.source === 'card') {
    // Compras (negativas) e estornos (positivos) contam como despesa (estorno reduz a despesa).
    kind = 'expense';
  } else {
    kind = amount >= 0 ? 'income' : 'expense';
    if (kind === 'income' && category === 'outros' && !resolved.providerLabel) category = 'receitas';
  }

  const ccm = tx.creditCardMetadata;
  const installment =
    ccm && typeof ccm.installmentNumber === 'number' && typeof ccm.totalInstallments === 'number' && ccm.totalInstallments > 1
      ? { number: ccm.installmentNumber, total: ccm.totalInstallments }
      : null;

  return {
    id: tx.id,
    date,
    description,
    amount,
    currency,
    kind,
    status: tx.status === 'PENDING' ? 'pending' : 'posted',
    source: ctx.source,
    accountId: ctx.source === 'bank' ? ctx.accountId : null,
    cardId: ctx.source === 'card' ? ctx.accountId : null,
    itemId: ctx.itemId,
    institution: ctx.institution,
    category,
    subcategory,
    providerCategory: resolved.providerLabel,
    providerCategoryId: tx.categoryId ?? null,
    installment,
    billId: ccm?.billId ?? null,
    billForecast: ccm?.billForecastDate && /^\d{4}-\d{2}$/.test(ccm.billForecastDate) ? ccm.billForecastDate : null,
    merchant: tx.merchant?.name ?? tx.merchant?.businessName ?? null,
    paymentMethod: tx.paymentData?.paymentMethod ?? null,
    ignored: false,
    userCategorized: false,
  };
}

export function normalizeBill(b: PluggyBill, cardId: string): NormalizedBill | null {
  const due = apiDateToKey(b.dueDate);
  if (!due) return null;
  const paid = round2((b.payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0));
  const charges = round2((b.financeCharges ?? []).reduce((s, c) => s + (c.amount ?? 0), 0));
  const total = round2(b.totalAmount ?? 0);
  return {
    id: b.id,
    cardId,
    dueDate: due,
    closingDate: apiDateToKey(b.billClosingDate),
    totalAmount: total,
    currency: b.totalAmountCurrencyCode || 'BRL',
    minimumPayment: b.minimumPaymentAmount ?? null,
    paidAmount: paid,
    isPaid: total <= 0 || paid >= total - 0.01,
    financeCharges: charges,
  };
}

export function investmentClassOf(type: string, subtype: string | null): InvestmentClass {
  switch (type) {
    case 'FIXED_INCOME':
      return 'renda_fixa';
    case 'MUTUAL_FUND':
      return 'fundos';
    case 'ETF':
      return 'etfs';
    case 'SECURITY':
      return 'previdencia';
    case 'EQUITY':
      if (subtype === 'ETF') return 'etfs';
      if (subtype === 'REAL_ESTATE_FUND') return 'fundos';
      if (subtype === 'STOCK' || subtype === 'BDR' || subtype === null) return 'acoes';
      return 'outros';
    default:
      return 'outros';
  }
}

export function normalizeInvestment(inv: PluggyInvestment, fallbackInstitution: string): NormalizedInvestment {
  return {
    id: inv.id,
    itemId: inv.itemId,
    institution: inv.institution?.name || fallbackInstitution,
    name: inv.name || inv.code || 'Investimento',
    type: inv.type,
    subtype: inv.subtype ?? null,
    investmentClass: investmentClassOf(inv.type, inv.subtype ?? null),
    value: round2(inv.balance ?? 0),
    grossValue: inv.amount ?? null,
    originalValue: inv.amountOriginal ?? null,
    profit: inv.amountProfit ?? null,
    currency: inv.currencyCode || 'BRL',
    dueDate: apiDateToKey(inv.dueDate),
    issuer: inv.issuer ?? null,
    rate: inv.rate ?? null,
    rateType: inv.rateType ?? null,
    fixedAnnualRate: inv.fixedAnnualRate ?? null,
    lastMonthRate: inv.lastMonthRate ?? null,
    lastTwelveMonthsRate: inv.lastTwelveMonthsRate ?? null,
    status: inv.status ?? null,
    referenceDate: apiDateToKey(inv.date),
  };
}

export interface NormalizedItemData {
  item: NormalizedItem;
  accounts: NormalizedAccount[];
  cards: NormalizedCard[];
  bills: NormalizedBill[];
  transactions: NormalizedTransaction[];
  investments: NormalizedInvestment[];
  warnings: string[];
  fetchedAt: string;
}

export function normalizeBundle(bundle: RawItemBundle, resolver: CategoryResolver): NormalizedItemData {
  const item = normalizeItem(bundle.item);
  const inst = item.institution;
  const updatedAt = bundle.item.lastUpdatedAt ?? null;
  const accounts: NormalizedAccount[] = [];
  const cards: NormalizedCard[] = [];
  const bills: NormalizedBill[] = [];
  const transactions: NormalizedTransaction[] = [];

  for (const acc of bundle.accounts) {
    const source = acc.type === 'CREDIT' ? 'card' : 'bank';
    if (source === 'card') cards.push(normalizeCard(acc, inst.name, inst.primaryColor, inst.isOpenFinance, updatedAt));
    else accounts.push(normalizeAccount(acc, inst.name, updatedAt));
    for (const tx of bundle.transactionsByAccount[acc.id] ?? []) {
      const n = normalizeTransaction(tx, { source, accountId: acc.id, accountCurrency: acc.currencyCode || 'BRL', itemId: acc.itemId, institution: inst.name, resolver });
      if (n) transactions.push(n);
    }
    for (const b of bundle.billsByAccount[acc.id] ?? []) {
      const nb = normalizeBill(b, acc.id);
      if (nb) bills.push(nb);
    }
  }
  const investments = bundle.investments.map((i) => normalizeInvestment(i, inst.name));
  return { item, accounts, cards, bills, transactions, investments, warnings: bundle.warnings, fetchedAt: new Date().toISOString() };
}

/** Junta dados de vários Items num único dataset, sem duplicar IDs. */
export function mergeItemData(parts: NormalizedItemData[], snapshots: FinancialDataset['snapshots'] = []): FinancialDataset {
  const ds = emptyDataset('pluggy');
  const seen = { acc: new Set<string>(), card: new Set<string>(), bill: new Set<string>(), tx: new Set<string>(), inv: new Set<string>() };
  let latest: string | null = null;
  for (const p of parts) {
    ds.items.push(p.item);
    for (const a of p.accounts) if (!seen.acc.has(a.id)) (seen.acc.add(a.id), ds.accounts.push(a));
    for (const c of p.cards) if (!seen.card.has(c.id)) (seen.card.add(c.id), ds.cards.push(c));
    for (const b of p.bills) if (!seen.bill.has(b.id)) (seen.bill.add(b.id), ds.bills.push(b));
    for (const t of p.transactions) if (!seen.tx.has(t.id)) (seen.tx.add(t.id), ds.transactions.push(t));
    for (const i of p.investments) if (!seen.inv.has(i.id)) (seen.inv.add(i.id), ds.investments.push(i));
    ds.warnings.push(...p.warnings);
    if (!latest || p.fetchedAt > latest) latest = p.fetchedAt;
  }
  ds.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  ds.snapshots = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  ds.fetchedAt = latest;
  return ds;
}

/** Fachada com o nome pedido na especificação. */
export const FinancialDataService = {
  normalizeInstitution,
  normalizeItem,
  normalizeAccount,
  normalizeCard,
  normalizeTransaction,
  normalizeBill,
  normalizeInvestment,
  normalizeBundle,
  mergeItemData,
  investmentClassOf,
};
