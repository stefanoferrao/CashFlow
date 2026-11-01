/**
 * Categorizar manualmente: só esta transação ou todas do mesmo estabelecimento (inclusive as próximas).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCategorization, type CategoryRule } from '../../src/models/finance';
import { applyUserCategorization, countRuleReach, merchantOf, ruleMatches } from '../../src/services/categories';
import { parseUserConfig } from '../../src/services/userConfig';
import { freshApp, installFakeDom, installFakePluggy, setupUnlockedVault, uninstallFakeDom, type App } from './helpers/authHarness';
import { tx } from './fixtures';

describe('merchantOf', () => {
  it('usa o estabelecimento informado pela Pluggy', () => {
    expect(merchantOf(tx({ description: 'PAG*BARBEARIAZE 12/03', merchant: 'Barbearia do Zé LTDA' }))).toEqual({ match: 'merchant', key: 'barbearia do ze ltda', label: 'Barbearia do Zé LTDA' });
  });

  it('sem estabelecimento, usa a descrição sem números e termos genéricos', () => {
    expect(merchantOf(tx({ description: 'BARBEARIA DO ZE 0312', merchant: null }))).toMatchObject({ match: 'similar', key: 'barbearia ze' });
    expect(merchantOf(tx({ description: 'PIX 123', merchant: null }))).toBeNull();
  });
});

describe('ruleMatches', () => {
  const rule = (p: Partial<CategoryRule>): CategoryRule => ({ id: 'r', contains: '', category: 'saude', subcategory: null, ...p });

  it('estabelecimento: casa pelo nome do estabelecimento, sem diferenciar maiúsculas e acentos', () => {
    const r = rule({ match: 'merchant', contains: 'barbearia do ze ltda' });
    expect(ruleMatches(r, tx({ description: 'qualquer', merchant: 'BARBEARIA DO ZÉ LTDA' }))).toBe(true);
    expect(ruleMatches(r, tx({ description: 'BARBEARIA DO ZE LTDA', merchant: null }))).toBe(false);
  });

  it('descrição semelhante: casa com a mesma descrição com outra data/número', () => {
    const r = rule({ match: 'similar', contains: 'barbearia ze' });
    expect(ruleMatches(r, tx({ description: 'BARBEARIA DO ZE 0410' }))).toBe(true);
    expect(ruleMatches(r, tx({ description: 'BARBEARIA DO ZE CENTRO' }))).toBe(false);
  });

  it('regra antiga de "aplicar a futuras" (chave sem termos genéricos) volta a casar com a própria transação', () => {
    expect(ruleMatches(rule({ contains: 'barbearia ze' }), tx({ description: 'BARBEARIA DO ZE' }))).toBe(true);
    expect(ruleMatches(rule({ contains: 'joao silva' }), tx({ description: 'PIX ENVIADO JOAO DA SILVA' }))).toBe(true);
  });

  it('regra digitada continua buscando o texto na descrição', () => {
    expect(ruleMatches(rule({ contains: 'Uber' }), tx({ description: 'UBER *TRIP 1234' }))).toBe(true);
    expect(ruleMatches(rule({ contains: 'ifood' }), tx({ description: 'UBER *TRIP 1234' }))).toBe(false);
  });
});

describe('applyUserCategorization', () => {
  it('a regra mais recente vence', () => {
    const uc = {
      ...emptyCategorization(),
      rules: [
        { id: 'r1', contains: 'barbearia', category: 'compras' as const, subcategory: null },
        { id: 'r2', contains: 'barbearia ze', match: 'similar' as const, category: 'saude' as const, subcategory: 'Cabelo' },
      ],
    };
    const [out] = applyUserCategorization([tx({ description: 'BARBEARIA DO ZE' })], uc);
    expect(out).toMatchObject({ category: 'saude', subcategory: 'Cabelo', userCategorized: true });
  });

  it('countRuleReach conta as transações alcançadas e as que têm ajuste individual', () => {
    const a = tx({ description: 'BARBEARIA DO ZE 01' });
    const b = tx({ description: 'BARBEARIA DO ZE 02' });
    const c = tx({ description: 'MERCADO' });
    const uc = { ...emptyCategorization(), overrides: { [b.id]: { category: 'lazer' as const } } };
    expect(countRuleReach([a, b, c], { id: 'x', contains: 'barbearia ze', match: 'similar', category: 'saude', subcategory: null }, uc)).toEqual({ total: 2, keptByOverride: 1 });
  });
});

describe('categorizeTransaction', () => {
  let app: App;
  beforeEach(async () => {
    vi.stubGlobal('navigator', { onLine: true });
    installFakeDom();
    installFakePluggy();
    app = await freshApp();
    await setupUnlockedVault(app);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    uninstallFakeDom();
  });

  const cut = () => tx({ description: 'BARBEARIA DO ZE', merchant: 'Barbearia do Zé', category: 'outros' });

  it('"Só esta": ajuste individual, sem regra', async () => {
    const t = cut();
    await app.actions.categorizeTransaction(t, { category: 'saude', subcategory: 'Cabelo', ignored: false }, 'one');
    const uc = app.store.state.categorization;
    expect(uc.overrides[t.id]).toMatchObject({ category: 'saude', subcategory: 'Cabelo' });
    expect(uc.rules).toEqual([]);
  });

  it('"Todas": regra do estabelecimento, que vale para as próximas e não duplica', async () => {
    const t = cut();
    await app.actions.categorizeTransaction(t, { category: 'saude', subcategory: 'Cabelo', ignored: false }, 'one');
    await app.actions.categorizeTransaction(t, { category: 'saude', subcategory: 'Cabelo', ignored: false }, 'all');
    await app.actions.categorizeTransaction(t, { category: 'lazer', subcategory: null, ignored: false }, 'all');
    const uc = app.store.state.categorization;
    expect(uc.rules).toHaveLength(1);
    expect(uc.rules[0]).toMatchObject({ match: 'merchant', contains: 'barbearia do ze', label: 'Barbearia do Zé', category: 'lazer' });
    // A própria transação passa a seguir a regra.
    expect(uc.overrides[t.id]).toBeUndefined();
    const next = tx({ description: 'PAG*BARBEARIA 0511', merchant: 'BARBEARIA DO ZE', category: 'outros' });
    const [a, b] = applyUserCategorization([t, next], uc);
    expect(a!.category).toBe('lazer');
    expect(b!.category).toBe('lazer');
  });

  it('"Todas" mantém "ignorar nos cálculos" da própria transação', async () => {
    const t = cut();
    await app.actions.categorizeTransaction(t, { category: 'saude', subcategory: null, ignored: true }, 'all');
    expect(app.store.state.categorization.overrides[t.id]).toEqual({ ignored: true });
  });
});

describe('exportar/importar regras de estabelecimento', () => {
  it('o tipo de regra e o nome do estabelecimento sobrevivem à importação', () => {
    const f = { app: 'cashflow', kind: 'visual-config', categorization: { rules: [{ id: 'r1', contains: 'barbearia do ze', match: 'merchant', label: 'Barbearia do Zé', category: 'saude', subcategory: 'Cabelo' }, { id: 'r2', contains: 'x', match: 'outra', category: 'saude' }] } };
    const rules = parseUserConfig(JSON.stringify(f)).config.categorization!.rules;
    expect(rules[0]).toEqual({ id: 'r1', contains: 'barbearia do ze', match: 'merchant', label: 'Barbearia do Zé', category: 'saude', subcategory: 'Cabelo' });
    expect(rules[1]).toEqual({ id: 'r2', contains: 'x', category: 'saude', subcategory: null });
  });
});
