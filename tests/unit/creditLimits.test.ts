import { describe, expect, it } from 'vitest';
import type { PluggyAccount, PluggyCreditData, PluggyDisaggregatedCreditLimit } from '../../src/pluggy/types';
import { normalizeCard } from '../../src/services/financialDataService';
import { calculateCreditUtilization, calculateNetWorth, dedupeSharedLimits } from '../../src/services/financialCalculator';
import { resolveCardLimits, totalCreditLine } from '../../src/services/creditLimits';
import { account, card } from './fixtures';

function creditData(over: Partial<PluggyCreditData> = {}): PluggyCreditData {
  return {
    level: 'PLATINUM',
    brand: 'MASTERCARD',
    balanceCloseDate: null,
    balanceDueDate: null,
    availableCreditLimit: 8750.5,
    balanceForeignCurrency: null,
    minimumPayment: null,
    creditLimit: 9150,
    isLimitFlexible: false,
    status: 'ACTIVE',
    holderType: 'MAIN',
    ...over,
  };
}

const line = (over: Partial<PluggyDisaggregatedCreditLimit> = {}): PluggyDisaggregatedCreditLimit => ({
  creditLineLimitType: 'LIMITE_CREDITO_TOTAL',
  consolidationType: 'INDIVIDUAL',
  identificationNumber: '1000',
  lineName: 'CREDITO_A_VISTA',
  limitAmount: 9150,
  usedAmount: 399.5,
  availableAmount: 8750.5,
  ...over,
});

const OF = { itemId: 'item-1', openFinanceData: true };
const DIRECT = { itemId: 'item-1', openFinanceData: false };

describe('resolveCardLimits — limite utilizado do cartão', () => {
  it('conector direto: limite − disponível (o saldo é o da fatura e não entra na conta)', () => {
    const r = resolveCardLimits(creditData({ availableCreditLimit: 3000 }), 399.5, DIRECT);
    expect(r).toMatchObject({ limit: 9150, available: 3000, used: 6150, source: 'available', note: null, sharedKey: null });
  });

  it('Open Finance coerente: mesmos valores, sem aviso', () => {
    const r = resolveCardLimits(creditData(), 399.5, OF);
    expect(r).toMatchObject({ limit: 9150, available: 8750.5, used: 399.5, source: 'available', note: null });
  });

  it('CASO REAL (Nubank via Meu Pluggy): disponível informado de R$ 4.725,97, mas o saldo do cartão é R$ 418,73', () => {
    // Números da tela do usuário: limite R$ 9.150,00 · disponível R$ 4.725,97 (uso aparente R$ 4.424,03, "48,4%") ·
    // saldo informado pela instituição R$ 418,73 · fatura atual calculada R$ 399,50 e nenhuma parcela futura.
    const r = resolveCardLimits(creditData({ availableCreditLimit: 4725.97 }), 418.73, OF);
    expect(r.limit).toBe(9150);
    expect(r.used).toBe(418.73);
    expect(r.available).toBe(8731.27);
    expect(r.source).toBe('balance');
    expect(r.used! / r.limit!).toBeLessThan(0.05); // ~4,6%, não 48,4%
    expect(r.note).toContain('R$ 418,73');
    expect(r.note).toContain('R$ 4.424,03');
    expect(r.note).toContain('R$ 4.725,97');
  });

  it('Open Finance sem saldo (zero): não inventa uso, cai em limite − disponível', () => {
    const r = resolveCardLimits(creditData({ availableCreditLimit: 5000 }), 0, OF);
    expect(r).toMatchObject({ used: 4150, source: 'available', note: null });
  });

  it('Open Finance sem o disponível: o saldo do cartão é o uso', () => {
    const r = resolveCardLimits(creditData({ availableCreditLimit: null }), 399.5, OF);
    expect(r).toMatchObject({ limit: 9150, used: 399.5, available: 8750.5, source: 'balance', note: null });
  });

  it('o saldo maior que o limite é limitado ao limite', () => {
    const r = resolveCardLimits(creditData({ availableCreditLimit: 9000 }), 20000, OF);
    expect(r).toMatchObject({ used: 9150, available: 0, source: 'balance' });
  });

  it('sem limite informado: nada é estimado', () => {
    expect(resolveCardLimits(creditData({ creditLimit: null }), 399.5, OF)).toMatchObject({ limit: null, used: null, source: null });
    expect(resolveCardLimits(null, 100, OF)).toMatchObject({ limit: null, used: null, available: null, source: null });
  });
});

describe('resolveCardLimits — linhas de limite (disaggregatedCreditLimits)', () => {
  it('a linha de limite TOTAL da instituição vale mais que os campos gerais', () => {
    const cd = creditData({ availableCreditLimit: 3000, disaggregatedCreditLimits: [line()] });
    const r = resolveCardLimits(cd, 5000, DIRECT);
    expect(r).toMatchObject({ limit: 9150, used: 399.5, available: 8750.5, source: 'credit-line' });
    expect(r.note).toContain('linha de limite total');
  });

  it('linhas por modalidade não entram; a linha total é a que conta', () => {
    const cd = creditData({
      disaggregatedCreditLimits: [
        line({ creditLineLimitType: 'LIMITE_CREDITO_MODALIDADE_OPERACAO', lineName: 'CREDITO_PARCELADO', limitAmount: 2000, usedAmount: 1900, availableAmount: 100 }),
        line(),
      ],
    });
    expect(resolveCardLimits(cd, 0, OF)).toMatchObject({ limit: 9150, used: 399.5, source: 'credit-line' });
  });

  it('com mais de uma linha total, vale a mais restritiva (menos limite disponível)', () => {
    const lines = [line({ identificationNumber: 'a', limitAmount: 9150, usedAmount: 399.5, availableAmount: 8750.5 }), line({ identificationNumber: 'b', consolidationType: 'CONSOLIDADO', limitAmount: 12000, usedAmount: 11000, availableAmount: 1000 })];
    expect(totalCreditLine(lines)?.identificationNumber).toBe('b');
  });

  it('usa limitAmount como limite (o "personalizado" não muda o limite total)', () => {
    const cd = creditData({ disaggregatedCreditLimits: [line({ customizedLimitAmount: 2000 })] });
    expect(resolveCardLimits(cd, 0, OF).limit).toBe(9150);
  });

  it('linha só com o disponível: o uso é limite − disponível', () => {
    const cd = creditData({ disaggregatedCreditLimits: [line({ usedAmount: null, availableAmount: 8750.5 })] });
    expect(resolveCardLimits(cd, 0, OF)).toMatchObject({ used: 399.5, available: 8750.5, source: 'credit-line' });
  });

  it('linha inválida (sem limite) é ignorada', () => {
    const cd = creditData({ availableCreditLimit: 8750.5, disaggregatedCreditLimits: [line({ limitAmount: null }), line({ limitAmount: 0 })] });
    expect(totalCreditLine(cd.disaggregatedCreditLimits)).toBeNull();
    expect(resolveCardLimits(cd, 399.5, OF)).toMatchObject({ used: 399.5, source: 'available' });
  });

  it('linha consolidada (compartilhada) gera uma chave de limite; a individual não', () => {
    const shared = resolveCardLimits(creditData({ disaggregatedCreditLimits: [line({ consolidationType: 'CONSOLIDADO' })] }), 0, OF);
    expect(shared.sharedKey).toBe('item-1|1000|9150');
    expect(resolveCardLimits(creditData({ disaggregatedCreditLimits: [line()] }), 0, OF).sharedKey).toBeNull();
  });
});

describe('normalizeCard aplica o limite do Open Finance / Meu Pluggy', () => {
  const acc = (over: Partial<PluggyAccount> = {}): PluggyAccount => ({
    id: 'nu-1',
    itemId: 'item-nu',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    number: '1234',
    balance: 399.5,
    name: 'Nubank',
    marketingName: null,
    owner: null,
    taxNumber: null,
    currencyCode: 'BRL',
    bankData: null,
    creditData: creditData({ availableCreditLimit: 3000 }),
    ...over,
  });

  it('Meu Pluggy (não marcado como Open Finance no conector): o saldo é o limite utilizado', () => {
    const c = normalizeCard(acc({ balance: 418.73, creditData: creditData({ availableCreditLimit: 4725.97 }) }), 'Nubank', null, false, null, true);
    expect(c).toMatchObject({ limit: 9150, usedLimit: 418.73, availableLimit: 8731.27, limitSource: 'balance' });
    expect(c.limitNote).toContain('R$ 4.424,03');
    expect(c.institutionBalance).toBe(418.73); // o valor bruto da Pluggy segue guardado
  });

  it('conector direto: continua limite − disponível', () => {
    const c = normalizeCard(acc(), 'Banco', null, false, null);
    expect(c).toMatchObject({ usedLimit: 6150, availableLimit: 3000, limitSource: 'available', limitNote: null });
  });

  it('linhas de limite detalhadas contam mesmo sem o conector ser marcado como Open Finance', () => {
    const c = normalizeCard(acc({ creditData: creditData({ availableCreditLimit: 3000, disaggregatedCreditLimits: [line()] }) }), 'Banco', null, false, null);
    expect(c).toMatchObject({ usedLimit: 399.5, limitSource: 'credit-line' });
  });
});

describe('cartões que dividem o mesmo limite entram uma vez nos totais', () => {
  const a = card({ id: 'a', limit: 9150, availableLimit: 8750.5, usedLimit: 399.5, sharedLimitKey: 'item-1|1000|9150' });
  const b = card({ id: 'b', limit: 9150, availableLimit: 8750.5, usedLimit: 399.5, sharedLimitKey: 'item-1|1000|9150' });
  const other = card({ id: 'c', limit: 5000, availableLimit: 4000, usedLimit: 1000 });

  it('dedupeSharedLimits mantém o primeiro e os cartões sem limite compartilhado', () => {
    expect(dedupeSharedLimits([a, b, other]).map((c) => c.id)).toEqual(['a', 'c']);
    expect(dedupeSharedLimits([a, b]).map((c) => c.id)).toEqual(['a']);
  });

  it('limite total, utilizado e disponível', () => {
    const u = calculateCreditUtilization([a, b, other]);
    expect(u).toMatchObject({ limit: 14150, used: 1399.5, available: 12750.5, cardsWithData: 2 });
    expect(u.utilization).toBeCloseTo(1399.5 / 14150, 6);
  });

  it('dívida no patrimônio: o mesmo limite não é somado duas vezes', () => {
    const nw = calculateNetWorth([account({ balance: 1000 })], [], [a, b]);
    expect(nw.cardDebt).toBe(399.5);
  });

  it('cada cartão continua com o próprio limite (só os totais agrupam)', () => {
    expect(a.usedLimit).toBe(399.5);
    expect(b.usedLimit).toBe(399.5);
  });
});
