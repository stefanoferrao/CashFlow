import { describe, expect, it } from 'vitest';
import {
  buildProjectionEvents,
  calculateAssetAllocation,
  calculateCashFlow,
  calculateCategoryBreakdown,
  calculateCreditUtilization,
  calculateCurrentBills,
  calculateFutureCardCharges,
  calculateNetWorth,
  calculateNetWorthGrowth,
  calculatePeriodTotals,
  calculateProjectedBalance,
  calculateProjectedBill,
  calculateSavingsRate,
  calculateTotalBalance,
  calculateTotalInvestments,
  getCardCycle,
  reconstructBalanceHistory,
} from '../../src/services/financialCalculator';
import { account, bill, card, cardTx, investment, tx } from './fixtures';

describe('calculateTotalBalance', () => {
  it('soma somente saldos de contas bancárias na moeda base', () => {
    const t = calculateTotalBalance([account({ balance: 1000.1 }), account({ id: 'a2', balance: 250.25 })]);
    expect(t.base).toBeCloseTo(1250.35, 2);
    expect(Object.keys(t.others)).toHaveLength(0);
  });

  it('não converte nem soma outras moedas ao total base', () => {
    const t = calculateTotalBalance([account({ balance: 100 }), account({ id: 'usd', balance: 50, currency: 'USD' })]);
    expect(t.base).toBe(100);
    expect(t.others.USD).toBe(50);
  });

  it('saldo negativo (cheque especial) reduz o total de saldo', () => {
    expect(calculateTotalBalance([account({ balance: 500 }), account({ id: 'a2', balance: -200 })]).base).toBe(300);
  });

  it('lista vazia → zero', () => {
    expect(calculateTotalBalance([]).base).toBe(0);
  });
});

describe('calculateTotalInvestments', () => {
  it('soma valor líquido e ignora resgates totais', () => {
    const t = calculateTotalInvestments([
      investment({ value: 10000 }),
      investment({ id: 'i2', value: 5000.5 }),
      investment({ id: 'i3', value: 999, status: 'TOTAL_WITHDRAWAL' }),
    ]);
    expect(t.base).toBe(15000.5);
  });

  it('separa moedas estrangeiras', () => {
    const t = calculateTotalInvestments([investment({ value: 100 }), investment({ id: 'x', value: 10, currency: 'USD' })]);
    expect(t.base).toBe(100);
    expect(t.others.USD).toBe(10);
  });
});

describe('calculateNetWorth', () => {
  it('ativos = contas positivas + investimentos; passivos = dívida de cartão + cheque especial', () => {
    const nw = calculateNetWorth(
      [account({ balance: 35000 }), account({ id: 'neg', balance: -500 })],
      [investment({ value: 100000 })],
      [card({ usedLimit: 3000 })],
    );
    expect(nw.accounts).toBe(35000);
    expect(nw.investments).toBe(100000);
    expect(nw.assets).toBe(135000);
    expect(nw.cardDebt).toBe(3000);
    expect(nw.overdraft).toBe(500);
    expect(nw.liabilities).toBe(3500);
    expect(nw.netWorth).toBe(131500);
  });

  it('limite disponível do cartão NUNCA é somado como patrimônio', () => {
    const nw = calculateNetWorth([account({ balance: 1000 })], [], [card({ limit: 50000, availableLimit: 50000, usedLimit: 0 })]);
    expect(nw.assets).toBe(1000);
    expect(nw.netWorth).toBe(1000);
  });

  it('sem limite informado usa o saldo devedor da instituição como dívida', () => {
    const nw = calculateNetWorth([], [], [card({ limit: null, availableLimit: null, usedLimit: null, institutionBalance: 820 })]);
    expect(nw.cardDebt).toBe(820);
    expect(nw.netWorth).toBe(-820);
  });

  it('reporta moedas excluídas do total', () => {
    const nw = calculateNetWorth([account({ currency: 'USD' })], [], []);
    expect(nw.excludedCurrencies).toContain('USD');
    expect(nw.netWorth).toBe(0);
  });
});

describe('calculateCreditUtilization', () => {
  it('calcula limite total, usado, disponível e percentual', () => {
    const u = calculateCreditUtilization([card(), card({ id: 'c2', limit: 5000, availableLimit: 5000, usedLimit: 0 })]);
    expect(u.limit).toBe(20000);
    expect(u.available).toBe(14240);
    expect(u.used).toBe(5760);
    expect(u.utilization).toBeCloseTo(0.288, 3);
    expect(u.cardsWithData).toBe(2);
  });

  it('cartões sem limite informado ficam fora e são contados à parte', () => {
    const u = calculateCreditUtilization([card({ limit: null, availableLimit: null })]);
    expect(u.utilization).toBeNull();
    expect(u.cardsWithoutData).toBe(1);
  });
});

describe('calculatePeriodTotals / fluxo', () => {
  const txs = [
    tx({ amount: 5000, kind: 'income', date: '2026-09-05' }),
    tx({ amount: -1200, date: '2026-09-10' }),
    cardTx({ amount: -300, date: '2026-09-12' }),
    cardTx({ amount: 50, date: '2026-09-13' }), // estorno reduz despesa
    tx({ amount: -2000, kind: 'card_payment', date: '2026-09-06' }), // não é despesa
    tx({ amount: -1000, kind: 'internal_transfer', date: '2026-09-07' }),
    tx({ amount: -3000, kind: 'investment', date: '2026-09-08' }),
    tx({ amount: -999, ignored: true, date: '2026-09-09' }),
    tx({ amount: -80, currency: 'USD', date: '2026-09-09' }),
  ];

  it('exclui transferências próprias, pagamento de fatura, investimentos, ignoradas e outras moedas', () => {
    const t = calculatePeriodTotals(txs, '2026-09-01', '2026-09-30');
    expect(t.income).toBe(5000);
    expect(t.expenses).toBe(1450);
    expect(t.net).toBe(3550);
  });

  it('calculateCashFlow agrupa por mês com buckets vazios', () => {
    const cf = calculateCashFlow(txs, { granularity: 'month', start: '2026-08-01', end: '2026-09-30' });
    expect(cf).toHaveLength(2);
    expect(cf[0]!.income).toBe(0);
    expect(cf[1]!.income).toBe(5000);
    expect(cf[1]!.expenses).toBe(1450);
    expect(cf[1]!.net).toBe(3550);
  });

  it('calculateCashFlow semanal começa na segunda-feira', () => {
    const cf = calculateCashFlow([tx({ date: '2026-09-10', amount: -10 })], { granularity: 'week', start: '2026-09-07', end: '2026-09-13' });
    expect(cf).toHaveLength(1);
    expect(cf[0]!.start).toBe('2026-09-07');
    expect(cf[0]!.expenses).toBe(10);
  });

  it('pendentes só entram quando solicitado', () => {
    const list = [tx({ amount: -100, status: 'pending', date: '2026-09-20' })];
    expect(calculatePeriodTotals(list, '2026-09-01', '2026-09-30', false).expenses).toBe(0);
    expect(calculatePeriodTotals(list, '2026-09-01', '2026-09-30', true).expenses).toBe(100);
  });
});

describe('calculateSavingsRate', () => {
  it('(receitas − despesas) / receitas', () => {
    expect(calculateSavingsRate(10000, 7500)).toBeCloseTo(0.25, 5);
  });
  it('negativa quando gasta mais do que ganha', () => {
    expect(calculateSavingsRate(1000, 1500)).toBeCloseTo(-0.5, 5);
  });
  it('null sem receitas', () => {
    expect(calculateSavingsRate(0, 100)).toBeNull();
  });
});

describe('calculateCategoryBreakdown', () => {
  it('ordena por total e calcula participação', () => {
    const b = calculateCategoryBreakdown(
      [tx({ amount: -300, category: 'alimentacao' }), tx({ amount: -700, category: 'moradia' }), tx({ amount: 1000, kind: 'income', category: 'receitas' })],
      '2026-09-01',
      '2026-09-30',
    );
    expect(b[0]!.category).toBe('moradia');
    expect(b[0]!.share).toBeCloseTo(0.7, 5);
    expect(b).toHaveLength(2);
  });
});

describe('calculateAssetAllocation', () => {
  it('cada recurso aparece uma única vez e cartões não entram como ativo', () => {
    const a = calculateAssetAllocation([account({ balance: 35000 })], [investment({ value: 60000 }), investment({ id: 'f', value: 40000, investmentClass: 'fundos' })]);
    expect(a.total).toBe(135000);
    expect(a.slices.map((s) => s.key)).toEqual(['contas', 'renda_fixa', 'fundos']);
    const sum = a.slices.reduce((s, x) => s + x.share, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('faturas: ciclo, fatura atual e previsão', () => {
  const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
  const bills = [bill({ closingDate: '2026-08-28', dueDate: '2026-09-05' })];

  it('ciclo começa no dia seguinte ao último fechamento', () => {
    const cycle = getCardCycle(c, bills, '2026-09-15')!;
    expect(cycle.start).toBe('2026-08-29');
    expect(cycle.closing).toBe('2026-09-28');
    expect(cycle.due).toBe('2026-10-05');
    expect(cycle.estimated).toBe(false);
  });

  it('projeta o próximo ciclo quando o informado já fechou', () => {
    const cycle = getCardCycle(card({ closingDate: '2026-08-28', dueDate: '2026-09-05' }), [], '2026-09-15')!;
    expect(cycle.closing).toBe('2026-09-28');
    expect(cycle.estimated).toBe(true);
  });

  it('separa já lançado de compras futuras e ignora pagamentos/faturas fechadas', () => {
    const txs = [
      cardTx({ amount: -500, date: '2026-09-01' }),
      cardTx({ amount: -700, date: '2026-09-05' }),
      cardTx({ amount: -900, date: '2026-09-10' }),
      cardTx({ amount: 100, date: '2026-09-11' }), // estorno
      cardTx({ amount: -300, date: '2026-09-20', status: 'pending' }), // parcela futura no ciclo
      cardTx({ amount: 2000, kind: 'card_payment', date: '2026-09-05' }),
      cardTx({ amount: -400, date: '2026-08-20', billId: 'bill1' }),
      cardTx({ amount: -250, date: '2026-10-10', status: 'pending' }), // próximo ciclo
    ];
    const [s] = calculateCurrentBills([c], txs, bills, '2026-09-15');
    expect(s!.launched).toBe(2000);
    expect(s!.future).toBe(300);
    expect(s!.total).toBe(2300);

    const p = calculateProjectedBill(s!, '2026-09-15');
    expect(p.forecast).toBe(2300);
    // 18 dias decorridos (29/08→15/09), 13 restantes
    expect(p.daysElapsed).toBe(18);
    expect(p.daysRemaining).toBe(13);
    // compras novas até hoje: 500+700+900−100 = 2000 → 111,11/dia
    expect(p.dailyAverage).toBeCloseTo(111.11, 2);
    expect(p.paceForecast).toBeCloseTo(2300 + 111.111 * 13, 0);
    expect(p.series[0]!.date).toBe('2026-08-29');
    expect(p.series[p.series.length - 1]!.date).toBe('2026-09-28');
  });

  it('usa billForecast (Open Finance) quando disponível', () => {
    const txs = [cardTx({ amount: -123, date: '2026-10-02', billForecast: '2026-10', status: 'pending' })];
    const [s] = calculateCurrentBills([c], txs, bills, '2026-09-15');
    expect(s!.total).toBe(123);
  });
});

describe('calculateProjectedBalance', () => {
  it('saldo atual + receitas − despesas − faturas', () => {
    const events = [
      { date: '2026-09-20', amount: 5000, label: 'Salário', kind: 'income' as const, certainty: 'estimated' as const, origin: 'recurrence' as const },
      { date: '2026-09-25', amount: -1500, label: 'Aluguel', kind: 'expense' as const, certainty: 'confirmed' as const, origin: 'planned' as const },
      { date: '2026-10-05', amount: -2300, label: 'Fatura', kind: 'bill' as const, certainty: 'confirmed' as const, origin: 'bill' as const },
      { date: '2026-12-01', amount: -9999, label: 'Fora do horizonte', kind: 'expense' as const, certainty: 'confirmed' as const, origin: 'planned' as const },
    ];
    const p = calculateProjectedBalance(1000, '2026-09-15', 30, events);
    expect(p.income).toBe(5000);
    expect(p.expenses).toBe(1500);
    expect(p.bills).toBe(2300);
    expect(p.end).toBe(2200);
    expect(p.series).toHaveLength(31);
    expect(p.min).toBe(1000);
  });

  it('detecta o menor saldo do período', () => {
    const p = calculateProjectedBalance(100, '2026-09-15', 7, [
      { date: '2026-09-16', amount: -300, label: 'x', kind: 'expense', certainty: 'confirmed', origin: 'planned' },
      { date: '2026-09-18', amount: 500, label: 'y', kind: 'income', certainty: 'confirmed', origin: 'planned' },
    ]);
    expect(p.min).toBe(-200);
    expect(p.minDate).toBe('2026-09-16');
  });

  it('buildProjectionEvents inclui fatura aberta no vencimento e respeita includeEstimates', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [cardTx({ amount: -800, date: '2026-09-10' })];
    const summaries = calculateCurrentBills([c], txs, [], '2026-09-15');
    const rec = [{ key: 'k', label: 'Salário', category: 'receitas' as const, source: 'bank' as const, averageAmount: 5000, intervalDays: 30, cadence: 'monthly' as const, lastDate: '2026-09-05', nextDate: '2026-10-05', occurrences: 5 }];
    const withEst = buildProjectionEvents({ today: '2026-09-15', days: 30, transactions: txs, billSummaries: summaries, bills: [], recurrences: rec, planned: [], includeEstimates: true });
    expect(withEst.some((e) => e.kind === 'bill' && e.amount === -800 && e.date === '2026-10-05')).toBe(true);
    expect(withEst.some((e) => e.origin === 'recurrence' && e.date === '2026-10-05')).toBe(true);
    const noEst = buildProjectionEvents({ today: '2026-09-15', days: 30, transactions: txs, billSummaries: summaries, bills: [], recurrences: rec, planned: [], includeEstimates: false });
    expect(noEst.some((e) => e.origin === 'recurrence')).toBe(false);
  });
});

describe('histórico', () => {
  it('reconstrói saldo diário a partir das transações', () => {
    const h = reconstructBalanceHistory(
      [account({ balance: 1000 })],
      [tx({ date: '2026-09-14', amount: -200 }), tx({ date: '2026-09-15', amount: 500, kind: 'income' })],
      '2026-09-13',
      '2026-09-15',
    );
    expect(h.map((x) => x.balance)).toEqual([700, 500, 1000]);
  });

  it('crescimento patrimonial usa o snapshot mais próximo do início do período', () => {
    const g = calculateNetWorthGrowth(
      [
        { date: '2026-08-10', accounts: 0, investments: 0, cardDebt: 0, netWorth: 100000, currency: 'BRL' },
        { date: '2026-08-20', accounts: 0, investments: 0, cardDebt: 0, netWorth: 110000, currency: 'BRL' },
      ],
      121000,
      '2026-09-15',
      30,
    )!;
    expect(g.from).toBe('2026-08-20');
    expect(g.change).toBe(11000);
    expect(g.pct).toBeCloseTo(0.1, 5);
  });

  it('sem histórico suficiente → null (nada inventado)', () => {
    expect(calculateNetWorthGrowth([], 1000, '2026-09-15', 30)).toBeNull();
  });
});

describe('faturas: fatura aberta informada pela instituição, billId e parcelas', () => {
  // Cenário do Inter (Open Finance): a lista de faturas da instituição já traz a fatura ABERTA (fecha no futuro)
  // e as transações do ciclo apontam para ela via billId.
  const inter = card({ id: 'inter', closingDate: null, dueDate: null });
  const closedAug = bill({ id: 'b-set', cardId: 'inter', closingDate: '2026-08-31', dueDate: '2026-09-10', totalAmount: 1500, paidAmount: 1500, isPaid: true });
  const openOct = bill({ id: 'b-out', cardId: 'inter', closingDate: '2026-09-30', dueDate: '2026-10-10', totalAmount: 0, paidAmount: 0, isPaid: false });
  const itx = (p: Parameters<typeof cardTx>[0]) => cardTx({ cardId: 'inter', ...p });

  it('fatura aberta da lista não é tratada como fechada (o total não zera)', () => {
    const txs = [
      itx({ amount: -200, date: '2026-09-05', billId: 'b-out' }),
      itx({ amount: -300, date: '2026-09-12', billId: 'b-out' }),
      itx({ amount: -999, date: '2026-08-20', billId: 'b-set' }), // fatura fechada
    ];
    const [s] = calculateCurrentBills([inter], txs, [closedAug, openOct], '2026-09-24');
    expect(s!.cycle.closing).toBe('2026-09-30');
    expect(s!.cycle.due).toBe('2026-10-10');
    expect(s!.cycle.source).toBe('institution');
    expect(s!.total).toBe(500);
  });

  it('com dias do usuário, as transações da fatura aberta continuam no ciclo', () => {
    const c = { ...inter, manualClosingDay: 30, manualDueDay: 10 };
    const txs = [itx({ amount: -200, date: '2026-09-05', billId: 'b-out' }), itx({ amount: -50, date: '2026-09-20' })];
    const [s] = calculateCurrentBills([c], txs, [closedAug, openOct], '2026-09-24');
    expect(s!.cycle.source).toBe('user');
    expect(s!.total).toBe(250);
  });

  it('usa o valor informado pela instituição quando é maior que a soma das transações', () => {
    const txs = [itx({ amount: -200, date: '2026-09-05' })];
    const [s] = calculateCurrentBills([inter], txs, [closedAug, { ...openOct, totalAmount: 870 }], '2026-09-24');
    expect(s!.total).toBe(870);
    expect(s!.totalSource).toBe('institution');
    const p = calculateProjectedBill(s!, '2026-09-24');
    expect(p.forecast).toBe(870);
    expect(p.series[p.series.length - 1]!.projected).toBeGreaterThanOrEqual(870);
  });

  it('projeta as próximas parcelas de compras parceladas (fatura aberta e seguintes)', () => {
    const txs = [
      // 3/10 numa fatura fechada (set.) → 4/10 é esperada na aberta (out.) e 5/10 na de novembro
      itx({ amount: -100, date: '2026-08-15', description: 'LOJA X 03/10', installment: { number: 3, total: 10 }, billId: 'b-set' }),
      // 2/2 já lançada na aberta → nada a projetar
      itx({ amount: -40, date: '2026-09-02', description: 'CURSO 2/2', installment: { number: 2, total: 2 }, billId: 'b-out' }),
    ];
    const [s] = calculateCurrentBills([inter], txs, [closedAug, openOct], '2026-09-24');
    expect(s!.projected.map((p) => `${p.number}/${p.total}`)).toEqual(['4/10']);
    expect(s!.projectedAmount).toBe(100);
    expect(s!.total).toBe(140);
    const next = calculateFutureCardCharges(s!, 12);
    expect(next[0]!.month).toBe('2026-11');
    expect(next[0]!.total).toBe(100);
    expect(next[0]!.projected).toBe(100);
    expect(next).toHaveLength(6); // 5/10 … 10/10
  });

  it('parcela já lançada no futuro não é projetada de novo', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    const txs = [
      cardTx({ amount: -100, date: '2026-09-10', description: 'TV 1/3', installment: { number: 1, total: 3 } }),
      cardTx({ amount: -100, date: '2026-10-10', description: 'TV 2/3', installment: { number: 2, total: 3 }, status: 'pending' }),
    ];
    const [s] = calculateCurrentBills([c], txs, [], '2026-09-15');
    const next = calculateFutureCardCharges(s!, 6);
    expect(next.map((f) => [f.month, f.total, f.projected])).toEqual([
      ['2026-11', 100, 0],
      ['2026-12', 100, 100],
    ]);
  });

  it('billForecast com outro mês de referência é calibrado pelas compras à vista', () => {
    const c = card({ closingDate: '2026-09-28', dueDate: '2026-10-05' });
    // Instituição informa o mês do FECHAMENTO (09) em vez do vencimento (10).
    const txs = [5, 9, 12, 20].map((d) => cardTx({ amount: -10, date: `2026-09-${String(d).padStart(2, '0')}`, billForecast: '2026-09' }));
    const [s] = calculateCurrentBills([c], txs, [], '2026-09-24');
    expect(s!.total).toBe(40);
  });

  it('projeção de saldo não conta duas vezes a fatura aberta informada pela instituição', () => {
    const txs = [itx({ amount: -200, date: '2026-09-05', billId: 'b-out' })];
    const open = { ...openOct, totalAmount: 200 };
    const summaries = calculateCurrentBills([inter], txs, [closedAug, open], '2026-09-24');
    const ev = buildProjectionEvents({ today: '2026-09-24', days: 30, transactions: txs, billSummaries: summaries, bills: [closedAug, open], recurrences: [], planned: [], includeEstimates: false });
    expect(ev.filter((e) => e.kind === 'bill').map((e) => e.amount)).toEqual([-200]);
  });
});
