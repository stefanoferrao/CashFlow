import type {
  NormalizedAccount,
  NormalizedBill,
  NormalizedCard,
  NormalizedInvestment,
  NormalizedTransaction,
} from '../../src/models/finance';

export function account(p: Partial<NormalizedAccount> = {}): NormalizedAccount {
  return {
    id: 'acc1',
    itemId: 'item1',
    institution: 'Banco Teste',
    name: 'Conta corrente',
    type: 'checking',
    lastDigits: '1234',
    balance: 1000,
    currency: 'BRL',
    updatedAt: null,
    overdraftLimit: null,
    overdraftUsed: null,
    automaticallyInvested: null,
    reservedTotal: null,
    ...p,
  };
}

export function card(p: Partial<NormalizedCard> = {}): NormalizedCard {
  return {
    id: 'card1',
    itemId: 'item1',
    institution: 'Banco Teste',
    institutionColor: null,
    name: 'Cartão Teste',
    brand: 'VISA',
    level: 'INFINITE',
    lastFourDigits: '4821',
    currency: 'BRL',
    limit: 15000,
    availableLimit: 9240,
    usedLimit: 5760,
    institutionBalance: 5760,
    minimumPayment: null,
    closingDate: '2026-09-28',
    dueDate: '2026-10-05',
    status: 'ACTIVE',
    holderType: 'MAIN',
    isOpenFinance: true,
    updatedAt: null,
    ...p,
  };
}

let seq = 0;
export function tx(p: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  seq++;
  return {
    id: `tx${seq}`,
    date: '2026-09-10',
    description: 'Compra',
    amount: -100,
    currency: 'BRL',
    kind: 'expense',
    status: 'posted',
    source: 'bank',
    accountId: 'acc1',
    cardId: null,
    itemId: 'item1',
    institution: 'Banco Teste',
    category: 'outros',
    subcategory: null,
    providerCategory: null,
    providerCategoryId: null,
    installment: null,
    billId: null,
    billForecast: null,
    merchant: null,
    paymentMethod: null,
    ignored: false,
    userCategorized: false,
    ...p,
  };
}

export function cardTx(p: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return tx({ source: 'card', accountId: null, cardId: 'card1', ...p });
}

export function investment(p: Partial<NormalizedInvestment> = {}): NormalizedInvestment {
  return {
    id: 'inv1',
    itemId: 'item1',
    institution: 'Corretora',
    name: 'CDB',
    type: 'FIXED_INCOME',
    subtype: 'CDB',
    investmentClass: 'renda_fixa',
    value: 10000,
    grossValue: 10200,
    originalValue: 9000,
    profit: 1000,
    currency: 'BRL',
    dueDate: null,
    issuer: null,
    rate: null,
    rateType: null,
    fixedAnnualRate: null,
    lastMonthRate: null,
    lastTwelveMonthsRate: null,
    status: 'ACTIVE',
    referenceDate: null,
    ...p,
  };
}

export function bill(p: Partial<NormalizedBill> = {}): NormalizedBill {
  return {
    id: 'bill1',
    cardId: 'card1',
    dueDate: '2026-09-05',
    closingDate: '2026-08-28',
    totalAmount: 2000,
    currency: 'BRL',
    minimumPayment: null,
    paidAmount: 2000,
    isPaid: true,
    financeCharges: 0,
    ...p,
  };
}
