import { describe, expect, it } from 'vitest';
import { redact } from '../../src/security/redact';
import { detectRecurrences, projectRecurrence, recurrenceKey } from '../../src/services/recurrence';
import { filterTransactions, paginate, periodRange, sortTransactions, summarizeTransactions, defaultFilters } from '../../src/services/transactionQuery';
import { addMonths, weekStart } from '../../src/utils/dates';
import { capitalize, formatDate, formatMoney, formatMonthKey, formatPercent, formatSignedMoney, maskNumber, monthName } from '../../src/utils/format';
import { escapeHtml, html } from '../../src/components/dom';
import { tx } from './fixtures';

describe('formatação brasileira', () => {
  it('moeda R$ 1.234,56', () => {
    expect(formatMoney(1234.56)).toBe('R$ 1.234,56');
    expect(formatMoney(-0.5)).toBe('-R$ 0,50');
    expect(formatSignedMoney(10)).toBe('+R$ 10,00');
    expect(formatSignedMoney(-10)).toBe('−R$ 10,00');
    expect(formatMoney(null)).toBe('—');
  });
  it('datas dd/mm/aaaa e meses com inicial maiúscula', () => {
    expect(formatDate('2026-09-22')).toBe('22/09/2026');
    expect(monthName(3)).toBe('Março');
    expect(formatMonthKey('2026-01')).toBe('Janeiro de 2026');
    expect(capitalize('fevereiro')).toBe('Fevereiro');
  });
  it('percentual', () => {
    expect(formatPercent(0.42)).toBe('42%');
    expect(formatPercent(null)).toBe('—');
  });
  it('mascara números', () => {
    expect(maskNumber('0001-1234567-8')).toBe('•••• 5678');
  });
});

describe('datas', () => {
  it('addMonths preserva fim de mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
  it('semana começa na segunda', () => {
    expect(weekStart('2026-09-23')).toBe('2026-09-21');
  });
});

describe('segurança da renderização (XSS)', () => {
  it('escapa descrições vindas do banco', () => {
    const evil = '<img src=x onerror=alert(1)>';
    expect(html`<td>${evil}</td>`.value).toBe('<td>&lt;img src=x onerror=alert(1)&gt;</td>');
    expect(escapeHtml('"\'`')).toBe('&quot;&#39;&#96;');
  });
});

describe('redação de logs', () => {
  it('nunca registra segredos, tokens ou documentos', () => {
    const out = redact({ clientSecret: 'abc', apiKey: 'eyJhbGciOi.eyJzdWIiOiJ4.sig123456', note: 'CPF 123.456.789-00', 'X-API-KEY': 'k' });
    expect(out).not.toContain('abc');
    expect(out).not.toContain('123.456.789-00');
    expect(out).not.toContain('eyJhbGciOi');
    expect(out).toContain('[redigido]');
  });
});

describe('recorrências', () => {
  const monthly = [0, 1, 2, 3].map((i) => tx({ date: addMonths('2026-05-05', i), description: `NETFLIX COM ${i}`, amount: -39.9, category: 'assinaturas' }));
  it('detecta cobrança mensal e projeta a próxima', () => {
    const r = detectRecurrences(monthly, '2026-09-10');
    expect(r).toHaveLength(1);
    expect(r[0]!.cadence).toBe('monthly');
    expect(r[0]!.averageAmount).toBe(-39.9);
    expect(projectRecurrence(r[0]!, '2026-09-11', '2026-11-30')).toEqual(['2026-10-05', '2026-11-05']);
  });
  it('ignora valores muito diferentes e recorrências que pararam', () => {
    const irregular = [tx({ date: '2026-05-05', description: 'LOJA X', amount: -10 }), tx({ date: '2026-06-05', description: 'LOJA X', amount: -500 }), tx({ date: '2026-07-05', description: 'LOJA X', amount: -30 })];
    expect(detectRecurrences(irregular, '2026-07-10')).toHaveLength(0);
    expect(detectRecurrences(monthly, '2026-12-20')).toHaveLength(0);
  });
  it('chave remove números e palavras genéricas', () => {
    expect(recurrenceKey('PIX ENVIADO 123 - IMOBILIARIA LAR')).toBe('imobiliaria lar');
  });
});

describe('consulta de transações', () => {
  const list = [
    tx({ id: 'a', date: '2026-09-20', description: 'Mercado Bom Preço', amount: -200, category: 'alimentacao' }),
    tx({ id: 'b', date: '2026-09-05', description: 'Salário', amount: 5000, kind: 'income', category: 'receitas' }),
    tx({ id: 'c', date: '2026-08-10', description: 'Transferência própria', amount: -1000, kind: 'internal_transfer', category: 'transferencias' }),
    tx({ id: 'd', date: '2026-10-10', description: 'Parcela futura', amount: -100, status: 'pending' }),
  ];
  it('filtra por período, busca sem acento e tipo', () => {
    const f = { ...defaultFilters(), period: 'month' as const };
    expect(filterTransactions(list, f, '2026-09-23').map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(filterTransactions(list, { ...defaultFilters(), period: 'all', q: 'preco' }, '2026-09-23').map((t) => t.id)).toEqual(['a']);
    expect(filterTransactions(list, { ...defaultFilters(), period: 'all', type: 'out' }, '2026-09-23').map((t) => t.id).sort()).toEqual(['a', 'd']);
    expect(filterTransactions(list, { ...defaultFilters(), period: 'all', type: 'internal' }, '2026-09-23').map((t) => t.id)).toEqual(['c']);
  });
  it('"últimos 90 dias" termina hoje; tipo pendentes inclui futuras', () => {
    expect(periodRange({ period: '90', from: null, to: null }, '2026-09-23').to).toBe('2026-09-23');
    expect(filterTransactions(list, { ...defaultFilters(), type: 'pending' }, '2026-09-23').map((t) => t.id)).toEqual(['d']);
  });
  it('ordena, resume e pagina', () => {
    const sorted = sortTransactions(list, 'amount', 'asc', (c) => c);
    expect(sorted[0]!.id).toBe('c');
    const s = summarizeTransactions(list);
    expect(s.inflow).toBe(5000);
    expect(s.outflow).toBe(1300);
    const p = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(p.items).toEqual([3, 4]);
    expect(p.pages).toBe(3);
    expect(paginate([1], 9, 2).page).toBe(1);
  });
});
