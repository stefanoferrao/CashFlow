/**
 * Regressões do calculador: ciclo de cartão com fechamento no fim do mês, parcelas, moeda da fatura,
 * pagamento de fatura agendado e lançamento previsto para hoje.
 */
import { describe, expect, it } from 'vitest';
import {
  buildProjectionEvents,
  calculateCurrentBills,
  calculateMonthOutlook,
  calculateProjectedBalance,
  getCardCycle,
} from '../../src/services/financialCalculator';
import { emptyCategorization, emptyDataset } from '../../src/models/finance';
import { computeAnalytics } from '../../src/services/analytics';
import { addMonthsAnchored } from '../../src/utils/dates';
import { bill, card, cardTx, tx } from './fixtures';

describe('addMonthsAnchored', () => {
  it('mantém o dia-âncora depois de um mês curto', () => {
    expect(addMonthsAnchored('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonthsAnchored('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonthsAnchored('2028-01-31', 1, 31)).toBe('2028-02-29');
    expect(addMonthsAnchored('2026-03-31', -1, 31)).toBe('2026-02-28');
    expect(addMonthsAnchored('2026-12-15', 1, 15)).toBe('2027-01-15');
  });
});

describe('getCardCycle — fechamento no fim do mês', () => {
  it('fechamento manual no dia 31: o ciclo começa no dia seguinte ao fechamento anterior', () => {
    const c = card({ closingDate: null, dueDate: null, manualClosingDay: 31, manualDueDay: 8 });
    expect(getCardCycle(c, [], '2026-04-10')).toMatchObject({ start: '2026-04-01', closing: '2026-04-30' });
    expect(getCardCycle(c, [], '2027-02-10')).toMatchObject({ start: '2027-02-01', closing: '2027-02-28' });
  });

  it('compra do dia 31 entra em uma fatura só', () => {
    const c = card({ closingDate: null, dueDate: null, manualClosingDay: 31, manualDueDay: 8 });
    const txs = [cardTx({ amount: -300, date: '2026-03-31' }), cardTx({ amount: -50, date: '2026-04-05' })];
    const march = calculateCurrentBills([c], txs, [], '2026-03-20')[0]!;
    const april = calculateCurrentBills([c], txs, [], '2026-04-10')[0]!;
    expect(march.total).toBe(300);
    expect(april.total).toBe(50);
  });

  it('ciclo informado há meses: fechamento e vencimento não encolhem a cada mês curto', () => {
    expect(getCardCycle(card({ closingDate: '2026-10-31', dueDate: '2026-11-07' }), [], '2026-12-05')).toMatchObject({ closing: '2026-12-31', due: '2027-01-07' });
    expect(getCardCycle(card({ closingDate: '2026-01-31', dueDate: '2026-02-07' }), [], '2026-04-10')).toMatchObject({ closing: '2026-04-30' });
  });

  it('pelo histórico de faturas: também mantém o dia de fechamento', () => {
    const c = card({ closingDate: null, dueDate: null });
    const b = [bill({ id: 'b1', cardId: 'card1', closingDate: '2026-08-31', dueDate: '2026-09-08' })];
    expect(getCardCycle(c, b, '2026-12-01')).toMatchObject({ closing: '2026-12-31', source: 'history' });
  });

  it('compra do dia 31 com ciclo antigo vai para a fatura aberta', () => {
    const c = card({ closingDate: '2026-10-31', dueDate: '2026-11-07' });
    const s = calculateCurrentBills([c], [cardTx({ amount: -200, date: '2026-12-31' })], [], '2026-12-05')[0]!;
    expect(s.total).toBe(200);
  });
});

describe('calculateCurrentBills — parcelas e moeda', () => {
  it('parcelas com centavos diferentes (10,50 / 10,49) são a mesma compra', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [
      cardTx({ amount: -10.5, date: '2026-08-10', description: 'LOJA X 1/3', installment: { number: 1, total: 3 } }),
      cardTx({ amount: -10.49, date: '2026-09-10', description: 'LOJA X 2/3', installment: { number: 2, total: 3 } }),
    ];
    const s = calculateCurrentBills([c], txs, [], '2026-09-15')[0]!;
    expect(s.total).toBe(10.49);
    expect(s.projected).toEqual([]);
    const nov = s.upcoming.find((u) => u.month === '2026-11');
    expect(nov?.total).toBe(10.49);
    expect(nov?.count).toBe(1);
  });

  it('duas compras "1/3" de valores próximos na mesma loja não viram uma só', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [
      cardTx({ amount: -100, date: '2026-09-10', description: 'LOJA X PARC 1/3', installment: { number: 1, total: 3 } }),
      cardTx({ amount: -100.9, date: '2026-09-12', description: 'LOJA X PARC 1/3', installment: { number: 1, total: 3 } }),
    ];
    const s = calculateCurrentBills([c], txs, [], '2026-09-15')[0]!;
    expect(s.upcoming.find((u) => u.month === '2026-11')?.total).toBe(200.9);
    expect(s.upcoming.find((u) => u.month === '2026-12')?.total).toBe(200.9);
  });

  it('compras diferentes na mesma loja seguem separadas', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [
      cardTx({ amount: -100, date: '2026-09-10', description: 'LOJA X 1/2', installment: { number: 1, total: 2 } }),
      cardTx({ amount: -40, date: '2026-09-12', description: 'LOJA X 1/2', installment: { number: 1, total: 2 } }),
    ];
    const s = calculateCurrentBills([c], txs, [], '2026-09-15')[0]!;
    expect(s.upcoming.find((u) => u.month === '2026-11')?.total).toBe(140);
  });

  it('lançamentos em outra moeda não entram no valor da fatura', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [cardTx({ amount: -100, date: '2026-09-10' }), cardTx({ amount: -50, currency: 'USD', date: '2026-09-11' })];
    const s = calculateCurrentBills([c], txs, [], '2026-09-15')[0]!;
    expect(s.launched).toBe(100);
    expect(s.total).toBe(100);
  });
});

describe('projeção de saldo e mês', () => {
  it('pagamento de fatura já agendado no banco não desconta a fatura duas vezes', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [cardTx({ amount: -1000, date: '2026-09-10' }), tx({ kind: 'card_payment', amount: -1000, date: '2026-10-05', status: 'pending', description: 'PAGTO FATURA' })];
    const s = calculateCurrentBills([c], txs, [], '2026-09-15');
    const ev = buildProjectionEvents({ today: '2026-09-15', days: 30, transactions: txs, billSummaries: s, bills: [], recurrences: [], planned: [], includeEstimates: false });
    expect(calculateProjectedBalance(5000, '2026-09-15', 30, ev).end).toBe(4000);
  });

  it('pagamento agendado de outro valor (outro cartão) continua no saldo previsto', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [cardTx({ amount: -1000, date: '2026-09-10' }), tx({ kind: 'card_payment', amount: -300, date: '2026-10-04', status: 'pending', description: 'PAGTO FATURA OUTRO' })];
    const s = calculateCurrentBills([c], txs, [], '2026-09-15');
    const ev = buildProjectionEvents({ today: '2026-09-15', days: 30, transactions: txs, billSummaries: s, bills: [], recurrences: [], planned: [], includeEstimates: false });
    expect(calculateProjectedBalance(5000, '2026-09-15', 30, ev).end).toBe(3700);
  });

  it('lançamento previsto para hoje entra no esperado do mês', () => {
    const o = calculateMonthOutlook({ today: '2026-09-15', transactions: [], recurrences: [], planned: [{ id: 'p', description: 'Freela', amount: 500, date: '2026-09-15', recurrence: 'none' }], includeEstimates: true });
    expect(o.expectedIncome).toBe(500);
  });
});

describe('comparativo de despesas do mês', () => {
  it('compara o realizado com pendentes com o mesmo período anterior também com pendentes', () => {
    const ds = { ...emptyDataset('pluggy'), transactions: [tx({ amount: -100, date: '2026-08-10' }), tx({ amount: -100, date: '2026-09-10', status: 'pending' })] };
    const a = computeAnalytics(ds, emptyCategorization(), [], false, '2026-09-15');
    expect(a.outlook.realizedExpenses).toBe(100);
    expect(a.previousMonthToDateWithPending.expenses).toBe(100);
    // O indicador de despesas lançadas segue comparando lançadas com lançadas.
    expect(a.month.expenses).toBe(0);
    expect(a.previousMonthToDate.expenses).toBe(100);
  });
});
