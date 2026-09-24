/**
 * MODO DEMONSTRAÇÃO — dados 100% fictícios (instituições, estabelecimentos e valores inventados),
 * gerados de forma determinística e relativos à data de hoje.
 * NUNCA são gravados nas stores de dados reais nem misturados com dados da Pluggy.
 */
import {
  type FinancialDataset,
  type NetWorthSnapshot,
  type NormalizedAccount,
  type NormalizedBill,
  type NormalizedCard,
  type NormalizedInvestment,
  type NormalizedItem,
  type NormalizedTransaction,
  type AppCategoryId,
  type TransactionKind,
  emptyDataset,
} from '../models/finance';
import { addDays, addMonths, monthKey, parseKey, todayKey, type DateKey } from '../utils/dates';
import { calculateNetWorth } from './financialCalculator';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const INST = {
  aurora: { name: 'Banco Aurora', color: '#1e3a8a', connectorId: 9001 },
  nebula: { name: 'Nébula Digital', color: '#6d28d9', connectorId: 9002 },
  horizonte: { name: 'Corretora Horizonte', color: '#0f766e', connectorId: 9003 },
} as const;

function item(id: string, inst: (typeof INST)[keyof typeof INST], lastUpdatedAt: string): NormalizedItem {
  return {
    id,
    institution: { connectorId: inst.connectorId, name: inst.name, imageUrl: null, primaryColor: inst.color, isOpenFinance: true, isSandbox: false },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    syncState: 'updated',
    lastUpdatedAt,
    nextAutoSyncAt: null,
    consentExpiresAt: null,
    message: null,
    partialProducts: [],
  };
}

/** Próximo dia `day` do mês ≥ referência. */
function nextDayOfMonth(ref: DateKey, day: number): DateKey {
  const { y, m } = parseKey(ref);
  const candidate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return candidate >= ref ? candidate : addMonths(candidate, 1);
}

export function buildDemoDataset(today: DateKey = todayKey()): FinancialDataset {
  const rnd = mulberry32(20260922);
  const between = (a: number, b: number) => r2(a + (b - a) * rnd());
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const nowIso = new Date().toISOString();
  const syncedAt = new Date(Date.now() - 2 * 3600_000).toISOString();

  const ds = emptyDataset('demo');
  ds.items = [item('demo-item-aurora', INST.aurora, syncedAt), item('demo-item-nebula', INST.nebula, syncedAt), item('demo-item-horizonte', INST.horizonte, syncedAt)];
  ds.fetchedAt = nowIso;

  const txs: NormalizedTransaction[] = [];
  let seq = 0;
  const push = (p: {
    date: DateKey;
    description: string;
    amount: number;
    category: AppCategoryId;
    subcategory?: string | null;
    kind?: TransactionKind;
    source?: 'bank' | 'card';
    accountId?: string | null;
    cardId?: string | null;
    itemId: string;
    institution: string;
    installment?: { number: number; total: number } | null;
  }) => {
    const source = p.source ?? 'bank';
    txs.push({
      id: `demo-tx-${++seq}`,
      date: p.date,
      description: p.description,
      amount: r2(p.amount),
      currency: 'BRL',
      kind: p.kind ?? (source === 'card' ? 'expense' : p.amount >= 0 ? 'income' : 'expense'),
      status: p.date > today ? 'pending' : 'posted',
      source,
      accountId: source === 'bank' ? p.accountId ?? null : null,
      cardId: source === 'card' ? p.cardId ?? null : null,
      itemId: p.itemId,
      institution: p.institution,
      category: p.category,
      subcategory: p.subcategory ?? null,
      providerCategory: null,
      providerCategoryId: null,
      installment: p.installment ?? null,
      billId: null,
      billForecast: null,
      merchant: null,
      paymentMethod: null,
      ignored: false,
      userCategorized: false,
    });
  };

  const start = addDays(today, -365);
  const AUR = { itemId: 'demo-item-aurora', institution: INST.aurora.name };
  const NEB = { itemId: 'demo-item-nebula', institution: INST.nebula.name };
  const cardA = 'demo-card-aurora';
  const cardN = 'demo-card-nebula';

  // ----- Lançamentos diários/mensais
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const { d: day } = parseKey(d);
    const dow = new Date(`${d}T12:00:00`).getDay();

    // Conta Aurora
    if (day === 5) push({ ...AUR, date: d, description: 'SALÁRIO - TECNOVA SERVIÇOS LTDA', amount: 14850, category: 'receitas', subcategory: 'Salário', accountId: 'demo-acc-aurora' });
    if (day === 3) push({ ...AUR, date: d, description: 'ACADEMIA MOVIMENTO', amount: -129.9, category: 'saude', subcategory: 'Academia', accountId: 'demo-acc-aurora' });
    if (day === 6) {
      push({ ...AUR, date: d, description: 'TRANSFERÊNCIA ENTRE CONTAS - POUPANÇA', amount: -1000, category: 'transferencias', subcategory: 'Entre contas próprias', kind: 'internal_transfer', accountId: 'demo-acc-aurora' });
      push({ ...AUR, date: d, description: 'TRANSFERÊNCIA ENTRE CONTAS - CORRENTE', amount: 1000, category: 'transferencias', subcategory: 'Entre contas próprias', kind: 'internal_transfer', accountId: 'demo-acc-aurora-poup' });
    }
    if (day === 7) push({ ...AUR, date: d, description: 'APLICAÇÃO CDB HORIZONTE', amount: -2000, category: 'investimentos', subcategory: 'Aplicação', kind: 'investment', accountId: 'demo-acc-aurora' });
    if (day === 8) {
      push({ ...AUR, date: d, description: 'PIX ENVIADO - MESMA TITULARIDADE NÉBULA', amount: -2500, category: 'transferencias', subcategory: 'Entre contas próprias', kind: 'internal_transfer', accountId: 'demo-acc-aurora' });
      push({ ...NEB, date: d, description: 'PIX RECEBIDO - MESMA TITULARIDADE AURORA', amount: 2500, category: 'transferencias', subcategory: 'Entre contas próprias', kind: 'internal_transfer', accountId: 'demo-acc-nebula' });
    }
    if (day === 10) {
      push({ ...AUR, date: d, description: 'PIX ENVIADO - IMOBILIÁRIA LAR DOCE LAR', amount: -3200, category: 'moradia', subcategory: 'Aluguel', accountId: 'demo-acc-aurora' });
      push({ ...AUR, date: d, description: 'BOLETO CONDOMÍNIO RESIDENCIAL JARDINS', amount: -780, category: 'moradia', subcategory: 'Condomínio', accountId: 'demo-acc-aurora' });
    }
    if (day === 12) push({ ...AUR, date: d, description: 'INTERNET FIBRA VELOZ', amount: -119.9, category: 'moradia', subcategory: 'Internet', accountId: 'demo-acc-aurora' });
    if (day === 15) push({ ...AUR, date: d, description: 'CONTA DE ENERGIA - DISTRIBUIDORA LUZ', amount: -between(168, 262), category: 'moradia', subcategory: 'Energia', accountId: 'demo-acc-aurora' });
    if (day === 20) push({ ...AUR, date: d, description: 'PLANO DE SAÚDE VIDA+', amount: -612.4, category: 'saude', subcategory: 'Plano de saúde', accountId: 'demo-acc-aurora' });
    if (day === 18 && parseKey(d).m % 2 === 0) push({ ...AUR, date: d, description: 'PIX RECEBIDO - STUDIO ÓRBITA DESIGN', amount: between(2400, 4200), category: 'receitas', subcategory: 'Freelance', accountId: 'demo-acc-aurora' });
    if (day === 1) push({ ...AUR, date: d, description: 'RENDIMENTO POUPANÇA', amount: between(95, 140), category: 'receitas', subcategory: 'Rendimentos', accountId: 'demo-acc-aurora-poup' });

    // Cartão Aurora Infinite
    if (dow === 6 || (dow === 3 && rnd() < 0.5)) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: pick(['SUPERMERCADO BOM PREÇO', 'MERCADO DA ESQUINA', 'HORTIFRUTI FRESCOR']), amount: -between(140, 520), category: 'alimentacao', subcategory: 'Supermercado' });
    if (rnd() < 0.22) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: pick(['RESTAURANTE SABOR DA VILA', 'CANTINA NONNA', 'BISTRÔ CENTRAL', 'PADARIA PÃO DOURADO']), amount: -between(38, 190), category: 'alimentacao', subcategory: 'Restaurantes' });
    if (rnd() < 0.2) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: 'APP MOBILIDADE *VIAGEM', amount: -between(16, 48), category: 'transporte', subcategory: 'Aplicativos' });
    if (day === 2 || day === 17) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: 'POSTO ESTRELA COMBUSTÍVEIS', amount: -between(190, 290), category: 'transporte', subcategory: 'Combustível' });
    if (day === 9) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: 'STREAMFLIX ASSINATURA', amount: -39.9, category: 'assinaturas', subcategory: 'Streaming' });
    if (day === 14) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: 'MUSICBOX PREMIUM', amount: -21.9, category: 'assinaturas', subcategory: 'Música' });
    if (day === 21) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: 'NUVEM+ ARMAZENAMENTO 200GB', amount: -9.9, category: 'assinaturas', subcategory: 'Nuvem' });
    if (rnd() < 0.07) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: pick(['FARMÁCIA SAÚDE JÁ', 'DROGARIA POPULAR']), amount: -between(35, 160), category: 'saude', subcategory: 'Farmácia' });
    if (rnd() < 0.05) push({ ...AUR, source: 'card', cardId: cardA, date: d, description: pick(['LOJA MODA URBANA', 'CASA & CIA UTILIDADES', 'LIVRARIA PÁGINA UM']), amount: -between(80, 640), category: 'compras', subcategory: pick(['Vestuário', 'Casa', 'Presentes']) });

    // Cartão Nébula Black
    if (rnd() < 0.12) push({ ...NEB, source: 'card', cardId: cardN, date: d, description: pick(['DELIVERY FOME ZERO', 'HAMBURGUERIA BRASA', 'SUSHI KAZE']), amount: -between(42, 138), category: 'alimentacao', subcategory: 'Delivery' });
    if (rnd() < 0.05) push({ ...NEB, source: 'card', cardId: cardN, date: d, description: pick(['CINEMA ESTAÇÃO', 'TEATRO MUNICIPAL INGRESSOS', 'PARQUE AVENTURA']), amount: -between(40, 220), category: 'lazer', subcategory: 'Cinema e shows' });
    if (day === 25) push({ ...NEB, source: 'card', cardId: cardN, date: d, description: 'EDITOR PRO SOFTWARE', amount: -54.9, category: 'assinaturas', subcategory: 'Software' });
  }

  // ----- Compras parceladas (inclui parcelas futuras, como a Pluggy retorna em alguns bancos)
  const installmentPlan = (card: string, base: { itemId: string; institution: string }, firstDate: DateKey, desc: string, total: number, n: number, category: AppCategoryId, sub: string) => {
    const each = r2(total / n);
    for (let i = 1; i <= n; i++) {
      push({ ...base, source: 'card', cardId: card, date: addMonths(firstDate, i - 1), description: `${desc} ${i}/${n}`, amount: -each, category, subcategory: sub, installment: { number: i, total: n } });
    }
  };
  installmentPlan(cardA, AUR, addMonths(today, -4), 'ELETRO CENTER NOTEBOOK', 4899, 10, 'compras', 'Eletrônicos');
  installmentPlan(cardA, AUR, addMonths(today, -2), 'HOTEL MARÉ ALTA', 1860, 3, 'lazer', 'Viagens');
  installmentPlan(cardN, NEB, addMonths(today, -1), 'ESCOLA DIGITAL - CURSO UX', 1170, 3, 'educacao', 'Cursos');
  installmentPlan(cardN, NEB, addMonths(today, -8), 'ÓTICA VISÃO CLARA', 960, 6, 'saude', 'Consultas');

  // ----- Cartões: ciclos, faturas fechadas e pagamentos
  const cardDefs = [
    { id: cardA, closeDay: 28, dueDay: 5, limit: 15000, name: 'Aurora Infinite', brand: 'VISA', level: 'INFINITE', last4: '4821', inst: INST.aurora, itemId: 'demo-item-aurora', payFrom: 'demo-acc-aurora', base: AUR },
    { id: cardN, closeDay: 15, dueDay: 22, limit: 8000, name: 'Nébula Black', brand: 'MASTERCARD', level: 'BLACK', last4: '7390', inst: INST.nebula, itemId: 'demo-item-nebula', payFrom: 'demo-acc-nebula', base: NEB },
  ];
  const bills: NormalizedBill[] = [];
  const cards: NormalizedCard[] = [];
  for (const c of cardDefs) {
    const openClosing = nextDayOfMonth(today, c.closeDay);
    const openDue = nextDayOfMonth(addDays(openClosing, 1), c.dueDay);
    // Faturas fechadas: 11 ciclos anteriores
    for (let i = 11; i >= 1; i--) {
      const closing = addMonths(openClosing, -i);
      const prevClosing = addMonths(openClosing, -i - 1);
      const due = addMonths(openDue, -i);
      const cycleTx = txs.filter((t) => t.cardId === c.id && t.date > prevClosing && t.date <= closing);
      const total = r2(cycleTx.reduce((s, t) => s - t.amount, 0));
      const billId = `demo-bill-${c.id}-${monthKey(due)}`;
      for (const t of cycleTx) t.billId = billId;
      const paid = due <= today;
      bills.push({ id: billId, cardId: c.id, dueDate: due, closingDate: closing, totalAmount: total, currency: 'BRL', minimumPayment: r2(total * 0.15), paidAmount: paid ? total : 0, isPaid: paid, financeCharges: 0 });
      if (paid && total > 0) {
        push({ ...c.base, date: due, description: `PAGAMENTO FATURA CARTÃO ${c.name.toUpperCase()}`, amount: -total, category: 'transferencias', subcategory: 'Pagamento de fatura', kind: 'card_payment', accountId: c.payFrom });
        push({ ...c.base, source: 'card', cardId: c.id, date: due, description: 'PAGAMENTO RECEBIDO', amount: total, category: 'transferencias', subcategory: 'Pagamento de fatura', kind: 'card_payment' });
      }
    }
    // Dívida atual = fatura aberta + faturas fechadas não pagas + parcelas futuras
    const openStart = addDays(addMonths(openClosing, -1), 1);
    const future = txs.filter((t) => t.cardId === c.id && t.kind === 'expense' && t.date >= openStart).reduce((s, t) => s - t.amount, 0);
    const unpaid = bills.filter((b) => b.cardId === c.id && !b.isPaid).reduce((s, b) => s + b.totalAmount, 0);
    const used = r2(future + unpaid);
    cards.push({
      id: c.id,
      itemId: c.itemId,
      institution: c.inst.name,
      institutionColor: c.inst.color,
      name: c.name,
      brand: c.brand,
      level: c.level,
      lastFourDigits: c.last4,
      currency: 'BRL',
      limit: c.limit,
      availableLimit: r2(c.limit - used),
      usedLimit: used,
      institutionBalance: used,
      minimumPayment: null,
      closingDate: openClosing,
      dueDate: openDue,
      status: 'ACTIVE',
      holderType: 'MAIN',
      isOpenFinance: true,
      updatedAt: syncedAt,
    });
  }

  // ----- Contas (saldo atual plausível)
  const accounts: NormalizedAccount[] = [
    { id: 'demo-acc-aurora', itemId: 'demo-item-aurora', institution: INST.aurora.name, name: 'Conta Corrente Aurora', type: 'checking', lastDigits: '0457', balance: 18432.17, currency: 'BRL', updatedAt: syncedAt, overdraftLimit: 5000, overdraftUsed: 0, automaticallyInvested: null, reservedTotal: null },
    { id: 'demo-acc-aurora-poup', itemId: 'demo-item-aurora', institution: INST.aurora.name, name: 'Poupança Aurora', type: 'savings', lastDigits: '0457', balance: 22915.63, currency: 'BRL', updatedAt: syncedAt, overdraftLimit: null, overdraftUsed: null, automaticallyInvested: null, reservedTotal: null },
    { id: 'demo-acc-nebula', itemId: 'demo-item-nebula', institution: INST.nebula.name, name: 'Conta Nébula', type: 'checking', lastDigits: '8812', balance: 3287.4, currency: 'BRL', updatedAt: syncedAt, overdraftLimit: null, overdraftUsed: null, automaticallyInvested: null, reservedTotal: 1500 },
  ];

  // ----- Investimentos
  const inv = (p: Partial<NormalizedInvestment> & Pick<NormalizedInvestment, 'id' | 'name' | 'type' | 'investmentClass' | 'value'>): NormalizedInvestment => ({
    itemId: 'demo-item-horizonte',
    institution: INST.horizonte.name,
    subtype: null,
    grossValue: null,
    originalValue: null,
    profit: null,
    currency: 'BRL',
    dueDate: null,
    issuer: null,
    rate: null,
    rateType: null,
    fixedAnnualRate: null,
    lastMonthRate: null,
    lastTwelveMonthsRate: null,
    status: 'ACTIVE',
    referenceDate: today,
    ...p,
  });
  const investments: NormalizedInvestment[] = [
    // Rendimento pelas movimentações (quantidade conferida): 2 aplicações e 1 resgate.
    inv({
      id: 'demo-inv-cdb', name: 'CDB Horizonte 110% CDI', type: 'FIXED_INCOME', subtype: 'CDB', investmentClass: 'renda_fixa',
      value: 48320.55, grossValue: 49410.1, originalValue: null, profit: null, dueDate: addMonths(today, 30), issuer: 'Banco Horizonte', rate: 110, rateType: 'CDI',
      quantity: 42, purchaseDate: addMonths(today, -26),
      movements: [
        { date: addMonths(today, -26), type: 'BUY', direction: 'in', amount: 30000, quantity: 30 },
        { date: addMonths(today, -14), type: 'BUY', direction: 'in', amount: 15000, quantity: 15 },
        { date: addMonths(today, -5), type: 'SELL', direction: 'out', amount: 3600, quantity: 3 },
        { date: addMonths(today, -5), type: 'TAX', direction: 'out', amount: 96.5, quantity: null },
      ],
    }),
    // Rendimento pelas movimentações (histórico desde a data da aplicação).
    inv({
      id: 'demo-inv-tesouro', name: 'Tesouro IPCA+ 2035', type: 'FIXED_INCOME', subtype: 'TREASURY', investmentClass: 'renda_fixa',
      value: 26410.2, grossValue: 26880.0, originalValue: null, profit: null, dueDate: '2035-05-15', issuer: 'Tesouro Nacional', rateType: 'IPCA', fixedAnnualRate: 6.12,
      purchaseDate: addMonths(today, -20),
      movements: [
        { date: addMonths(today, -20), type: 'BUY', direction: 'in', amount: 12000, quantity: null },
        { date: addMonths(today, -9), type: 'BUY', direction: 'in', amount: 11500, quantity: null },
      ],
    }),
    // Valor aplicado informado pela instituição.
    inv({ id: 'demo-inv-lci', name: 'LCI Aurora 95% CDI', type: 'FIXED_INCOME', subtype: 'LCI', investmentClass: 'renda_fixa', value: 15230.9, originalValue: 14000, profit: 0, dueDate: addMonths(today, 11), issuer: 'Banco Aurora', rate: 95, rateType: 'CDI', itemId: 'demo-item-aurora', institution: INST.aurora.name }),
    inv({ id: 'demo-inv-multi', name: 'Horizonte Multiestratégia FIM', type: 'MUTUAL_FUND', subtype: 'MULTIMARKET_FUND', investmentClass: 'fundos', value: 18950.7, grossValue: 19420.3, originalValue: 17000, profit: 1950.7, lastMonthRate: 0.0087, lastTwelveMonthsRate: 0.1182 }),
    // Só o lucro informado.
    inv({ id: 'demo-inv-fii', name: 'Fundo Imobiliário Renda Urbana', type: 'EQUITY', subtype: 'REAL_ESTATE_FUND', investmentClass: 'fundos', value: 6310.0, originalValue: null, profit: 310 }),
    inv({ id: 'demo-inv-acoes', name: 'Carteira de Ações Dividendos', type: 'EQUITY', subtype: 'STOCK', investmentClass: 'acoes', value: 12480.35, originalValue: 11200, profit: 1280.35 }),
    // A instituição repete o saldo como "valor aplicado": sem base confiável (fica fora, não vira zero).
    inv({ id: 'demo-inv-etf', name: 'ETF Índice Brasil Amplo', type: 'ETF', subtype: 'ETF', investmentClass: 'etfs', value: 8120.8, originalValue: 8120.8, profit: 0, purchaseDate: addMonths(today, -8) }),
    inv({ id: 'demo-inv-prev', name: 'VGBL Horizonte Previdência', type: 'SECURITY', subtype: 'RETIREMENT', investmentClass: 'previdencia', value: 15600.0 }),
  ];

  // ----- Histórico de patrimônio (registros semanais fictícios)
  const nw = calculateNetWorth(accounts, investments, cards);
  const snapshots: NetWorthSnapshot[] = [];
  const weeks = 52;
  for (let w = weeks; w >= 1; w--) {
    const date = addDays(today, -w * 7);
    const progress = 1 - w / weeks;
    const trend = 0.84 + 0.155 * progress;
    const wave = 1 + 0.006 * Math.sin(w / 3) + (rnd() - 0.5) * 0.004;
    const net = r2(nw.netWorth * trend * wave);
    const invShare = nw.investments / Math.max(1, nw.assets);
    snapshots.push({ date, accounts: r2(net * (1 - invShare)), investments: r2(net * invShare), cardDebt: r2(nw.cardDebt * (0.8 + rnd() * 0.4)), netWorth: net, currency: 'BRL' });
  }

  txs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  ds.accounts = accounts;
  ds.cards = cards;
  ds.bills = bills;
  ds.transactions = txs;
  ds.investments = investments;
  ds.snapshots = snapshots;
  return ds;
}
