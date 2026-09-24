import { describe, expect, it } from 'vitest';
import type { PluggyAccount, PluggyCategory, PluggyTransaction } from '../../src/pluggy/types';
import { CategoryResolver, applyUserCategorization } from '../../src/services/categories';
import { investmentClassOf, normalizeBill, normalizeCard, normalizeTransaction } from '../../src/services/financialDataService';
import { apiDateToKey } from '../../src/utils/dates';
import { emptyCategorization } from '../../src/models/finance';

const categories: PluggyCategory[] = [
  { id: '01000000', description: 'Income', descriptionTranslated: 'Renda' },
  { id: '01010000', description: 'Salary', descriptionTranslated: 'Salário', parentId: '01000000' },
  { id: '04000000', description: 'Same person transfer', descriptionTranslated: 'Transferência mesma titularidade' },
  { id: '05000000', description: 'Transfers', descriptionTranslated: 'Transferências' },
  { id: '05100000', description: 'Credit card payment', descriptionTranslated: 'Pagamento de cartão', parentId: '05000000' },
  { id: '05070000', description: 'Transfer - PIX', descriptionTranslated: 'Transferência - PIX', parentId: '05000000' },
  { id: '11000000', description: 'Food and drinks', descriptionTranslated: 'Alimentação' },
  { id: '11010000', description: 'Restaurants', descriptionTranslated: 'Restaurantes', parentId: '11000000' },
  { id: '03000000', description: 'Investments', descriptionTranslated: 'Investimentos' },
];
const resolver = new CategoryResolver(categories);

function ptx(p: Partial<PluggyTransaction>): PluggyTransaction {
  return {
    id: 't1',
    accountId: 'a1',
    date: '2026-09-10T00:00:00.000Z',
    description: 'COMPRA',
    descriptionRaw: null,
    type: 'DEBIT',
    amount: -50,
    amountInAccountCurrency: null,
    balance: 0,
    currencyCode: 'BRL',
    category: null,
    categoryId: null,
    status: 'POSTED',
    creditCardMetadata: null,
    operationType: null,
    providerId: null,
    ...p,
  };
}

const bankCtx = { source: 'bank' as const, accountId: 'a1', accountCurrency: 'BRL', itemId: 'i1', institution: 'Banco', resolver };
const cardCtx = { source: 'card' as const, accountId: 'c1', accountCurrency: 'BRL', itemId: 'i1', institution: 'Banco', resolver };

describe('normalizeTransaction — convenção de sinal (documentação Pluggy)', () => {
  it('conta: negativo = saída, positivo = entrada', () => {
    expect(normalizeTransaction(ptx({ amount: -50 }), bankCtx)!.amount).toBe(-50);
    const inc = normalizeTransaction(ptx({ amount: 3000, type: 'CREDIT', categoryId: '01010000', category: 'Salary' }), bankCtx)!;
    expect(inc.amount).toBe(3000);
    expect(inc.kind).toBe('income');
    expect(inc.category).toBe('receitas');
    expect(inc.subcategory).toBe('Salário');
  });

  it('cartão: positivo = compra (vira saída), negativo = estorno (reduz despesa)', () => {
    const buy = normalizeTransaction(ptx({ amount: 120, categoryId: '11010000', category: 'Restaurants' }), cardCtx)!;
    expect(buy.amount).toBe(-120);
    expect(buy.kind).toBe('expense');
    expect(buy.category).toBe('alimentacao');
    expect(buy.cardId).toBe('c1');
    expect(buy.accountId).toBeNull();
    const refund = normalizeTransaction(ptx({ amount: -30, description: 'ESTORNO LOJA' }), cardCtx)!;
    expect(refund.amount).toBe(30);
    expect(refund.kind).toBe('expense');
  });

  it('pagamento de fatura não é despesa (nem no banco, nem no cartão)', () => {
    const bank = normalizeTransaction(ptx({ amount: -2000, categoryId: '05100000', category: 'Credit card payment' }), bankCtx)!;
    expect(bank.kind).toBe('card_payment');
    const bankByDesc = normalizeTransaction(ptx({ amount: -2000, description: 'PAGTO FATURA CARTAO' }), bankCtx)!;
    expect(bankByDesc.kind).toBe('card_payment');
    const card = normalizeTransaction(ptx({ amount: -2000, description: 'PAGAMENTO RECEBIDO' }), cardCtx)!;
    expect(card.kind).toBe('card_payment');
  });

  it('transferência entre contas do mesmo titular é neutra', () => {
    const t = normalizeTransaction(ptx({ amount: -500, categoryId: '04000000', category: 'Same person transfer' }), bankCtx)!;
    expect(t.kind).toBe('internal_transfer');
    expect(t.category).toBe('transferencias');
  });

  it('PIX para terceiros continua sendo despesa', () => {
    const t = normalizeTransaction(ptx({ amount: -800, categoryId: '05070000', category: 'Transfer - PIX' }), bankCtx)!;
    expect(t.kind).toBe('expense');
    expect(t.category).toBe('transferencias');
  });

  it('aplicação em investimento é movimento de patrimônio', () => {
    const t = normalizeTransaction(ptx({ amount: -1000, categoryId: '03000000', category: 'Investments' }), bankCtx)!;
    expect(t.kind).toBe('investment');
  });

  it('usa amountInAccountCurrency em compras internacionais', () => {
    const t = normalizeTransaction(ptx({ amount: 20, currencyCode: 'USD', amountInAccountCurrency: 110.5 }), cardCtx)!;
    expect(t.amount).toBe(-110.5);
    expect(t.currency).toBe('BRL');
  });

  it('parcelas e previsão de fatura (Open Finance)', () => {
    const t = normalizeTransaction(ptx({ amount: 100, status: 'PENDING', creditCardMetadata: { installmentNumber: 2, totalInstallments: 10, billForecastDate: '2026-11', billId: 'b9' } }), cardCtx)!;
    expect(t.installment).toEqual({ number: 2, total: 10 });
    expect(t.status).toBe('pending');
    expect(t.billForecast).toBe('2026-11');
    expect(t.billId).toBe('b9');
  });

  it('sem categorização (plano sem o recurso) → Outros, sem inventar', () => {
    const t = normalizeTransaction(ptx({ amount: -10 }), { ...bankCtx, resolver: new CategoryResolver([]) })!;
    expect(t.category).toBe('outros');
    expect(t.providerCategory).toBeNull();
  });
});

describe('datas da API', () => {
  it('data "pura" à meia-noite UTC mantém o dia', () => {
    expect(apiDateToKey('2026-09-01T00:00:00.000Z')).toBe('2026-09-01');
  });
  it('string YYYY-MM-DD é aceita', () => {
    expect(apiDateToKey('2026-09-01')).toBe('2026-09-01');
  });
  it('valores inválidos → null', () => {
    expect(apiDateToKey(null)).toBeNull();
    expect(apiDateToKey('lixo')).toBeNull();
  });
});

describe('normalizeCard', () => {
  const acc: PluggyAccount = {
    id: 'c1',
    itemId: 'i1',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    number: '4821',
    balance: 1234.5,
    name: 'Cartão',
    marketingName: 'Visa Infinite',
    owner: 'Fulano',
    taxNumber: '123.456.789-00',
    currencyCode: 'BRL',
    bankData: null,
    creditData: {
      level: 'INFINITE',
      brand: 'VISA',
      balanceCloseDate: '2026-09-28T00:00:00.000Z',
      balanceDueDate: '2026-10-05T00:00:00.000Z',
      availableCreditLimit: 9240,
      balanceForeignCurrency: null,
      minimumPayment: 200,
      creditLimit: 15000,
      isLimitFlexible: false,
      status: 'ACTIVE',
      holderType: 'MAIN',
    },
  };
  it('calcula limite utilizado e descarta dados pessoais', () => {
    const c = normalizeCard(acc, 'Banco', '#112233', true, null);
    expect(c.usedLimit).toBe(5760);
    expect(c.lastFourDigits).toBe('4821');
    expect(c.closingDate).toBe('2026-09-28');
    expect(c.dueDate).toBe('2026-10-05');
    expect(JSON.stringify(c)).not.toContain('123.456.789-00');
    expect(JSON.stringify(c)).not.toContain('Fulano');
  });
  it('sem limite informado → null (nada estimado)', () => {
    const c = normalizeCard({ ...acc, creditData: { ...acc.creditData!, creditLimit: null } }, 'Banco', null, false, null);
    expect(c.usedLimit).toBeNull();
    expect(c.limit).toBeNull();
  });
});

describe('normalizeBill', () => {
  it('soma pagamentos e marca fatura paga', () => {
    const b = normalizeBill(
      {
        id: 'b1',
        dueDate: '2026-09-05T00:00:00.000Z',
        billClosingDate: '2026-08-28T00:00:00.000Z',
        totalAmount: 1000,
        totalAmountCurrencyCode: 'BRL',
        minimumPaymentAmount: 150,
        allowsInstallments: true,
        financeCharges: [{ id: 'f', type: 'IOF', amount: 3.2, currencyCode: 'BRL', additionalInfo: null }],
        payments: [{ id: 'p', valueType: 'FULL_PAYMENT', paymentDate: '2026-09-05', paymentMode: 'PIX', amount: 1000, currencyCode: 'BRL' }],
      },
      'c1',
    )!;
    expect(b.isPaid).toBe(true);
    expect(b.financeCharges).toBe(3.2);
    expect(b.closingDate).toBe('2026-08-28');
  });
});

describe('investmentClassOf', () => {
  it('mapeia tipos/subtipos da Pluggy para as classes do app', () => {
    expect(investmentClassOf('FIXED_INCOME', 'CDB')).toBe('renda_fixa');
    expect(investmentClassOf('MUTUAL_FUND', 'MULTIMARKET_FUND')).toBe('fundos');
    expect(investmentClassOf('EQUITY', 'STOCK')).toBe('acoes');
    expect(investmentClassOf('EQUITY', 'ETF')).toBe('etfs');
    expect(investmentClassOf('EQUITY', 'REAL_ESTATE_FUND')).toBe('fundos');
    expect(investmentClassOf('ETF', 'ETF')).toBe('etfs');
    expect(investmentClassOf('SECURITY', 'RETIREMENT')).toBe('previdencia');
    expect(investmentClassOf('COE', 'STRUCTURED_NOTE')).toBe('outros');
  });
});

describe('categorização do usuário', () => {
  const base = normalizeTransaction(ptx({ id: 'x1', amount: -45, description: 'UBER *TRIP 123' }), bankCtx)!;
  it('regra por descrição e ajuste individual (prioridade do ajuste)', () => {
    const uc = { ...emptyCategorization(), rules: [{ id: 'r', contains: 'uber', category: 'transporte' as const, subcategory: 'Aplicativos' }] };
    const [r1] = applyUserCategorization([base], uc);
    expect(r1!.category).toBe('transporte');
    expect(r1!.userCategorized).toBe(true);
    const uc2 = { ...uc, overrides: { x1: { category: 'lazer' as const, subcategory: null } } };
    expect(applyUserCategorization([base], uc2)[0]!.category).toBe('lazer');
  });
  it('marcar como "Entre contas próprias" torna a transação neutra', () => {
    const uc = { ...emptyCategorization(), overrides: { x1: { category: 'transferencias' as const, subcategory: 'Entre contas próprias' } } };
    expect(applyUserCategorization([base], uc)[0]!.kind).toBe('internal_transfer');
  });
  it('ignorar nos cálculos', () => {
    const uc = { ...emptyCategorization(), overrides: { x1: { ignored: true } } };
    expect(applyUserCategorization([base], uc)[0]!.ignored).toBe(true);
  });
});
