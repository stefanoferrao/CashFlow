/**
 * Testes das novidades da versão 1.2.0: faturas somadas, rendimento dos investimentos, períodos do fluxo de caixa,
 * patrimônio ao longo do tempo, conexões repetidas, erros do Pluggy Connect, notas de atualização e dicas.
 */
import { describe, expect, it } from 'vitest';
import type { NormalizedItem } from '../../src/models/finance';
import {
  calculateCurrentBills,
  calculateInvestmentPerformance,
  calculateNetWorthHistory,
  calculateOpenBillsOverview,
  calculateProductPerformance,
  calculateProjectedBill,
  resolveCashFlowPeriod,
} from '../../src/services/financialCalculator';
import { findDuplicateItems, mergeItemData, normalizeInvestment, normalizeInvestmentMovements, type NormalizedItemData } from '../../src/services/financialDataService';
import { oauthRedirectUriFor, parseConnectError } from '../../src/pluggy/connect';
import { PluggyClient } from '../../src/pluggy/client';
import { compareVersions, normalizeVersion, parseReleases } from '../../src/services/releases';
import { renderMarkdown } from '../../src/utils/markdown';
import { placeTooltip } from '../../src/components/tooltip';
import { nextHeight, nextWidth, widthLabel } from '../../src/pages/dashboard';
import { stripRepeatedTitle } from '../../src/pages/releases';
import { account, bill, card, cardTx, investment, tx } from './fixtures';

const TODAY = '2026-09-24';

// ------------------------------------------------------------------ faturas somadas

describe('calculateOpenBillsOverview', () => {
  const cards = [
    card({ id: 'c1', name: 'Aurora', closingDate: '2026-09-28', dueDate: '2026-10-05' }),
    card({ id: 'c2', name: 'Nébula', lastFourDigits: '7390', closingDate: '2026-10-15', dueDate: '2026-10-22' }),
    card({ id: 'c3', name: 'Sem datas', lastFourDigits: '1111', closingDate: null, dueDate: null }),
  ];
  const txs = [
    cardTx({ cardId: 'c1', date: '2026-09-10', amount: -300 }),
    cardTx({ cardId: 'c1', date: '2026-09-20', amount: -200 }),
    cardTx({ cardId: 'c2', date: '2026-09-20', amount: -100 }),
  ];
  const summaries = calculateCurrentBills(cards, txs, [], TODAY);
  const proj = Object.fromEntries(summaries.map((s) => [s.card.id, calculateProjectedBill(s, TODAY)]));
  const ov = calculateOpenBillsOverview(cards, summaries, proj, [], TODAY);

  it('soma as faturas abertas de todos os cartões e mostra cada uma', () => {
    expect(ov.total).toBe(600);
    expect(ov.rows).toHaveLength(3);
    expect(ov.rows[0]!.card.id).toBe('c1');
    expect(ov.rows[0]!.total).toBe(500);
    expect(ov.rows[1]!.total).toBe(100);
    expect(ov.rows[0]!.share + ov.rows[1]!.share).toBeCloseTo(1, 6);
  });

  it('cartão sem datas aparece no fim, sem valor (não vira zero no total)', () => {
    expect(ov.rows[2]!.card.id).toBe('c3');
    expect(ov.rows[2]!.total).toBeNull();
    expect(ov.withCycle).toBe(2);
    expect(ov.withoutCycle).toBe(1);
  });

  it('primeiro vencimento e previsão no ritmo (≥ total)', () => {
    expect(ov.nextDue).toBe('2026-10-05');
    expect(ov.paceTotal).toBeGreaterThanOrEqual(ov.total);
  });

  it('fatura fechada a pagar (informada pela instituição) fica à parte', () => {
    const closed = [bill({ id: 'b-old', cardId: 'c1', dueDate: '2026-09-30', closingDate: '2026-09-20', totalAmount: 800, paidAmount: 0, isPaid: false })];
    const s2 = calculateCurrentBills([card({ id: 'c1', closingDate: '2026-10-20', dueDate: '2026-10-28' })], [], closed, TODAY);
    const o2 = calculateOpenBillsOverview([card({ id: 'c1', closingDate: '2026-10-20', dueDate: '2026-10-28' })], s2, {}, closed, TODAY);
    expect(o2.closedDueTotal).toBe(800);
    expect(o2.closedDue[0]!.due).toBe('2026-09-30');
  });

  it('outras moedas não são somadas', () => {
    const usd = [card({ id: 'u1', currency: 'USD', closingDate: '2026-09-28', dueDate: '2026-10-05' })];
    const s = calculateCurrentBills(usd, [cardTx({ cardId: 'u1', currency: 'USD', amount: -50 })], [], TODAY);
    const o = calculateOpenBillsOverview(usd, s, {}, [], TODAY);
    expect(o.total).toBe(0);
    expect(o.others.USD).toBe(50);
  });
});

// ------------------------------------------------------------------ rendimento

describe('calculateProductPerformance', () => {
  it('usa as movimentações quando a quantidade confere com a posição', () => {
    const i = investment({
      originalValue: null,
      profit: null,
      value: 48320.55,
      grossValue: 49410.1,
      quantity: 42,
      movements: [
        { date: '2024-07-24', type: 'BUY', direction: 'in', amount: 30000, quantity: 30 },
        { date: '2025-07-24', type: 'BUY', direction: 'in', amount: 15000, quantity: 15 },
        { date: '2026-04-24', type: 'SELL', direction: 'out', amount: 3600, quantity: 3 },
        { date: '2026-04-24', type: 'TAX', direction: 'out', amount: 96.5, quantity: null },
      ],
    });
    const { perf } = calculateProductPerformance(i, TODAY);
    expect(perf!.source).toBe('movements');
    expect(perf!.applied).toBe(45000);
    expect(perf!.withdrawn).toBe(3600);
    expect(perf!.profit).toBeCloseTo(49410.1 + 3600 - 45000, 2);
    expect(perf!.profitNet).toBeCloseTo(perf!.profit - (49410.1 - 48320.55), 2);
    expect(perf!.rate).toBeCloseTo(perf!.profit / 45000, 6);
  });

  it('não usa movimentações incompletas (histórico começa depois da aplicação)', () => {
    const i = investment({ originalValue: null, profit: null, purchaseDate: '2024-01-10', movements: [{ date: '2025-10-01', type: 'BUY', direction: 'in', amount: 1000, quantity: null }] });
    const r = calculateProductPerformance(i, TODAY);
    expect(r.perf).toBeNull();
    expect(r.reason).toContain('incompletas');
  });

  it('valor aplicado informado × valor atual bruto (mesmo com lucro informado = 0)', () => {
    const i = investment({ value: 15230.9, grossValue: null, originalValue: 14000, profit: 0 });
    const { perf } = calculateProductPerformance(i, TODAY);
    expect(perf!.source).toBe('original');
    expect(perf!.profit).toBe(1230.9);
  });

  it('valor aplicado igual ao atual em aplicação antiga = sem base (não é rendimento zero)', () => {
    const i = investment({ value: 8120.8, grossValue: null, originalValue: 8120.8, profit: 0, purchaseDate: '2026-01-10' });
    expect(calculateProductPerformance(i, TODAY).perf).toBeNull();
  });

  it('aplicação recente com valor igual ao atual = rendimento zero legítimo', () => {
    const i = investment({ value: 1000, grossValue: null, originalValue: 1000, profit: 0, purchaseDate: '2026-09-22' });
    expect(calculateProductPerformance(i, TODAY).perf!.profit).toBe(0);
  });

  it('só o lucro informado → aplicado = líquido − lucro', () => {
    const i = investment({ value: 6310, grossValue: null, originalValue: null, profit: 310 });
    const { perf } = calculateProductPerformance(i, TODAY);
    expect(perf!.source).toBe('profit');
    expect(perf!.applied).toBe(6000);
    expect(perf!.profit).toBe(310);
  });

  it('formato da Pluggy (auditoria): bruto − aplicado; líquido bate com amountProfit', () => {
    const i = investment({ value: 20000, grossValue: 20500, originalValue: 18000, profit: 2000 });
    const { perf } = calculateProductPerformance(i, TODAY);
    expect(perf!.profit).toBe(2500);
    expect(perf!.profitNet).toBe(2000);
  });
});

describe('calculateInvestmentPerformance', () => {
  it('soma só os produtos com base e informa a cobertura', () => {
    const s = calculateInvestmentPerformance(
      [
        investment({ id: 'a', value: 1100, grossValue: null, originalValue: 1000, profit: null }),
        investment({ id: 'b', value: 900, grossValue: null, originalValue: null, profit: null }),
        investment({ id: 'c', value: 500, status: 'TOTAL_WITHDRAWAL' }),
      ],
      TODAY,
    );
    expect(s.productsTotal).toBe(2);
    expect(s.productsCovered).toBe(1);
    expect(s.profit).toBe(100);
    expect(s.rate).toBeCloseTo(0.1, 6);
    expect(s.coverage).toBeCloseTo(1100 / 2000, 6);
    expect(s.uncovered[0]!.id).toBe('b');
  });

  it('sem nenhuma base → rate null (nunca "0%")', () => {
    const s = calculateInvestmentPerformance([investment({ originalValue: null, profit: null })], TODAY);
    expect(s.rate).toBeNull();
    expect(s.productsCovered).toBe(0);
  });
});

describe('normalização de investimentos (1.2.0)', () => {
  const raw = {
    id: 'i1', code: null, isin: null, itemId: 'it', type: 'MUTUAL_FUND' as const, subtype: 'MULTIMARKET_FUND', name: 'Fundo', currencyCode: 'BRL',
    date: '2026-09-20', value: 1.23, quantity: 10, balance: 1000, amount: 1010, amountWithdrawal: null, amountProfit: 10, amountOriginal: 1000,
    dueDate: null, issuer: null, issueDate: '2025-01-02T00:00:00.000Z', rate: null, rateType: null, fixedAnnualRate: null,
    lastMonthRate: 0.87, annualRate: 11, lastTwelveMonthsRate: 11.82, status: 'ACTIVE' as const, institution: null, purchaseDate: '2025-01-03T00:00:00.000Z',
  };
  it('taxas da Pluggy vêm em percentual → fração', () => {
    const n = normalizeInvestment(raw, 'X');
    expect(n.lastMonthRate).toBeCloseTo(0.0087, 6);
    expect(n.lastTwelveMonthsRate).toBeCloseTo(0.1182, 6);
    expect(n.purchaseDate).toBe('2025-01-03');
    expect(n.quantity).toBe(10);
    expect(n.movements).toBeNull();
  });
  it('movimentações: sentido pelo tipo; transferência pelo movementType', () => {
    const mv = normalizeInvestmentMovements([
      { type: 'BUY', date: '2025-01-03', amount: 1000, quantity: 10 },
      { type: 'TRANSFER', movementType: 'DEBIT', date: '2025-02-03', amount: 100, quantity: 1 },
      { type: 'TRANSFER', date: '2025-03-03', amount: 50, quantity: null },
      { type: 'SELL', date: '2025-04-03', amount: -200, quantity: -2 },
    ])!;
    expect(mv.map((m) => m.direction)).toEqual(['in', 'out', null, 'out']);
    expect(mv[3]!.amount).toBe(200);
    expect(mv[3]!.quantity).toBe(2);
  });
});

// ------------------------------------------------------------------ fluxo de caixa por período

describe('resolveCashFlowPeriod', () => {
  it('mês atual: do dia 1 até hoje, por dia', () => {
    const p = resolveCashFlowPeriod('month', 0, TODAY, '2025-09-25');
    expect(p.start).toBe('2026-09-01');
    expect(p.end).toBe(TODAY);
    expect(p.granularity).toBe('day');
    expect(p.ongoing).toBe(true);
    expect(p.canNext).toBe(false);
  });
  it('mês anterior completo', () => {
    const p = resolveCashFlowPeriod('month', -1, TODAY, '2025-09-25');
    expect(p.start).toBe('2026-08-01');
    expect(p.end).toBe('2026-08-31');
    expect(p.ongoing).toBe(false);
    expect(p.canNext).toBe(true);
  });
  it('trimestre: calendário, por semana', () => {
    const p = resolveCashFlowPeriod('quarter', 0, TODAY, null);
    expect(p.start).toBe('2026-07-01');
    expect(p.quarter).toBe(3);
    expect(p.granularity).toBe('week');
    const prev = resolveCashFlowPeriod('quarter', -3, TODAY, null);
    expect(prev.start).toBe('2025-10-01');
    expect(prev.end).toBe('2025-12-31');
    expect(prev.quarter).toBe(4);
  });
  it('ano e todo o período', () => {
    expect(resolveCashFlowPeriod('year', -1, TODAY, null).start).toBe('2025-01-01');
    const all = resolveCashFlowPeriod('all', 0, TODAY, '2025-09-25');
    expect(all.start).toBe('2025-09-25');
    expect(all.granularity).toBe('month');
  });
  it('não navega para antes do histórico disponível', () => {
    expect(resolveCashFlowPeriod('month', -12, TODAY, '2025-09-25').canPrev).toBe(false);
    expect(resolveCashFlowPeriod('month', -3, TODAY, '2025-09-25').canPrev).toBe(true);
  });
});

// ------------------------------------------------------------------ patrimônio ao longo do tempo

describe('calculateNetWorthHistory', () => {
  const accounts = [account({ id: 'a1', itemId: 'i1', balance: 1500 }), account({ id: 'a2', itemId: 'i2', balance: 300 })];
  const txs = [tx({ accountId: 'a1', date: '2026-09-01', amount: 1000 }), tx({ accountId: 'a1', date: '2026-09-20', amount: -500 })];
  const snaps = [{ date: '2026-09-10', accounts: 1000, investments: 5000, cardDebt: 200, netWorth: 5800, currency: 'BRL' }];

  it('reconstrói o saldo só das contas com transações e só a partir da primeira transação', () => {
    const h = calculateNetWorthHistory(accounts, txs, snaps, TODAY);
    expect(h.includedAccounts).toBe(1);
    expect(h.excludedAccounts).toBe(1);
    expect(h.accountsFrom).toBe('2026-09-01');
    const first = h.points.find((p) => p.date === '2026-09-01')!;
    expect(first.accounts).toBe(2000); // 1500 hoje, antes da saída de 500 em 20/09
    expect(h.points.find((p) => p.date === TODAY)!.accounts).toBe(1500);
    expect(h.accountsChange!.change).toBe(-500);
  });

  it('patrimônio completo só nos dias registrados (investimentos não são inventados)', () => {
    const h = calculateNetWorthHistory(accounts, txs, snaps, TODAY);
    const withNw = h.points.filter((p) => p.netWorth !== null);
    expect(withNw).toHaveLength(1);
    expect(withNw[0]!.date).toBe('2026-09-10');
    expect(h.points.filter((p) => p.investments !== null)).toHaveLength(1);
    expect(h.recordedChange).toBeNull();
  });
});

// ------------------------------------------------------------------ conexões repetidas

function part(itemId: string, connectorId: number, lastUpdatedAt: string, accDigits: string[], cardDigits: string[] = []): NormalizedItemData {
  const item = {
    id: itemId,
    institution: { connectorId, name: 'Banco', imageUrl: null, primaryColor: null, isOpenFinance: true, isSandbox: false },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    syncState: 'updated',
    lastUpdatedAt,
    nextAutoSyncAt: null,
    consentExpiresAt: null,
    message: null,
    partialProducts: [],
  } satisfies NormalizedItem;
  return {
    item,
    accounts: accDigits.map((d, k) => account({ id: `${itemId}-a${k}`, itemId, lastDigits: d, balance: 100 })),
    cards: cardDigits.map((d, k) => card({ id: `${itemId}-c${k}`, itemId, lastFourDigits: d })),
    bills: [],
    transactions: [],
    investments: [],
    warnings: [],
    fetchedAt: lastUpdatedAt,
  };
}

describe('findDuplicateItems / mergeItemData', () => {
  it('mesma conexão conectada duas vezes: fica a mais recente e a antiga sai dos totais', () => {
    const parts = [part('old', 200, '2026-09-20T10:00:00Z', ['1234'], ['4821']), part('new', 200, '2026-09-24T10:00:00Z', ['1234'], ['4821'])];
    expect(findDuplicateItems(parts)).toEqual([{ itemId: 'old', duplicateOf: 'new' }]);
    const ds = mergeItemData(parts);
    expect(ds.items).toHaveLength(2);
    expect(ds.accounts).toHaveLength(1);
    expect(ds.accounts[0]!.itemId).toBe('new');
    expect(ds.duplicates).toHaveLength(1);
  });
  it('conectores diferentes ou contas diferentes não são repetidas', () => {
    expect(findDuplicateItems([part('a', 200, '1', ['1234']), part('b', 200, '2', ['9999'])])).toHaveLength(0);
    expect(findDuplicateItems([part('a', 200, '1', ['1234']), part('b', 612, '2', ['1234'])])).toHaveLength(0);
  });
  it('sem número de conta não afirma que é repetida', () => {
    const p1 = part('a', 200, '1', ['1234']);
    p1.accounts[0]!.lastDigits = null;
    const p2 = part('b', 200, '2', ['1234']);
    p2.accounts[0]!.lastDigits = null;
    expect(findDuplicateItems([p1, p2])).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ Pluggy Connect

describe('Pluggy Connect', () => {
  it('erro de conexão repetida traz os IDs existentes', () => {
    const e = parseConnectError({ message: 'ITEM_USER_ALREADY_EXISTS', data: { items: ['5E9F8F8F-F8F8-4F8F-8F8F-8F8F8F8F8F8F', { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }] } });
    expect(e.duplicate).toBe(true);
    expect(e.code).toBe('ITEM_USER_ALREADY_EXISTS');
    expect(e.existingItemIds).toEqual(['5e9f8f8f-f8f8-4f8f-8f8f-8f8f8f8f8f8f', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee']);
  });
  it('erro genérico não é tratado como repetido', () => {
    const e = parseConnectError({ message: 'Um erro inesperado ocorreu' });
    expect(e.duplicate).toBe(false);
    expect(e.existingItemIds).toHaveLength(0);
  });
  it('endereço de retorno só em https (nunca localhost)', () => {
    expect(oauthRedirectUriFor({ protocol: 'https:', hostname: 'stefanoferrao.github.io', origin: 'https://stefanoferrao.github.io', pathname: '/CashFlow/' })).toBe('https://stefanoferrao.github.io/CashFlow/');
    expect(oauthRedirectUriFor({ protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:5173', pathname: '/' })).toBeUndefined();
    expect(oauthRedirectUriFor({ protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', pathname: '/' })).toBeUndefined();
  });
  it('connect_token envia clientUserId, avoidDuplicates e oauthRedirectUri', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/auth')) return new Response(JSON.stringify({ apiKey: 'k' }), { status: 200 });
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ accessToken: 't' }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new PluggyClient({ baseUrl: 'https://api.pluggy.ai', isProxy: false, credentials: (fn) => fn({ clientId: 'x', clientSecret: 'y' }), fetchImpl });
    await c.createConnectToken({ clientUserId: 'cashflow-abc', oauthRedirectUri: 'https://a.b/' });
    await c.createConnectToken({ itemId: 'i1', clientUserId: 'cashflow-abc' });
    expect(bodies[0]).toEqual({ options: { clientUserId: 'cashflow-abc', avoidDuplicates: true, oauthRedirectUri: 'https://a.b/' } });
    expect(bodies[1]).toEqual({ options: { clientUserId: 'cashflow-abc', avoidDuplicates: true }, itemId: 'i1' });
  });
});

// ------------------------------------------------------------------ notas de atualização

describe('Notas de Atualização', () => {
  it('versões', () => {
    expect(normalizeVersion('v1.2.0')).toBe('1.2.0');
    expect(normalizeVersion('1.0')).toBe('1.0.0');
    expect(compareVersions('1.2.0', '1.0.2')).toBeGreaterThan(0);
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0);
  });
  it('releases: ignora rascunhos, ordena pela versão e só aceita links do GitHub', () => {
    const r = parseReleases([
      { tag_name: '1.0.1', name: 'a', body: 'x', html_url: 'https://github.com/s/c/releases/tag/1.0.1' },
      { tag_name: '1.0.2', name: '', body: null, html_url: 'https://evil.example/x' },
      { tag_name: '2.0.0', draft: true },
    ]);
    expect(r.map((x) => x.version)).toEqual(['1.0.2', '1.0.1']);
    expect(r[0]!.url).toContain('github.com/stefanoferrao/CashFlow');
    expect(r[0]!.name).toBe('CashFlow 1.0.2');
  });
  it('markdown seguro: escapa HTML e recusa links javascript:', () => {
    const out = renderMarkdown('## Título\n\n- **negrito** e `code`\n- [ok](https://github.com) [x](javascript:alert(1)) <img src=x onerror=alert(1)>').value;
    expect(out).toContain('<h4>Título</h4>');
    expect(out).toContain('<strong>negrito</strong>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('href="https://github.com"');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
  it('remove do corpo o título repetido', () => {
    expect(stripRepeatedTitle('# Notas de Atualização — v1.0.2\n\nTexto', 'Notas de Atualização — v1.0.2').trim()).toBe('Texto');
    expect(stripRepeatedTitle('# Outro\n\nTexto', 'Notas')).toContain('# Outro');
  });
});

// ------------------------------------------------------------------ dicas e personalização

describe('placeTooltip', () => {
  const vp = { width: 1000, height: 800 };
  it('abre acima quando há espaço e nunca sai da tela', () => {
    const p = placeTooltip({ top: 300, left: 990, width: 20, height: 20 }, { width: 260, height: 60 }, vp);
    expect(p.side).toBe('top');
    expect(p.left + 260).toBeLessThanOrEqual(1000 - 8);
  });
  it('perto do topo, abre abaixo', () => {
    const p = placeTooltip({ top: 20, left: 500, width: 20, height: 20 }, { width: 200, height: 60 }, vp);
    expect(p.side).toBe('bottom');
    expect(p.top).toBeGreaterThanOrEqual(48);
  });
  it('preferência "bottom" (barra superior)', () => {
    expect(placeTooltip({ top: 300, left: 500, width: 20, height: 20 }, { width: 200, height: 60 }, vp, 'bottom').side).toBe('bottom');
  });
});

describe('tamanho dos cards (Personalizar)', () => {
  it('larguras em passos redondos respeitando o mínimo', () => {
    expect(nextWidth(4, 1, 3)).toBe(6);
    expect(nextWidth(6, -1, 3)).toBe(4);
    expect(nextWidth(4, -1, 4)).toBe(4);
    expect(nextWidth(5, -1, 4)).toBe(4);
    expect(nextWidth(12, 1, 3)).toBe(12);
    expect(widthLabel(4)).toBe('1/3');
    expect(widthLabel(12)).toBe('Inteira');
    expect(widthLabel(7)).toBe('7/12');
  });
  it('altura entre o mínimo e 14', () => {
    expect(nextHeight(4, -1, 4)).toBe(4);
    expect(nextHeight(14, 1, 3)).toBe(14);
    expect(nextHeight(5, 1, 3)).toBe(6);
  });
});
