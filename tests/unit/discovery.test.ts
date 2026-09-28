import { describe, expect, it } from 'vitest';
import { MAX_AUTO_ITEMS, isDiscoveryUnavailable, planDiscovery } from '../../src/pluggy/discovery';
import type { PluggyItem } from '../../src/pluggy/types';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function item(n: number, over: Partial<PluggyItem> & { sandbox?: boolean } = {}): PluggyItem {
  const { sandbox, ...rest } = over;
  return {
    id: uuid(n),
    connector: { id: 201, name: `Banco ${n}`, isSandbox: !!sandbox } as PluggyItem['connector'],
    status: 'UPDATED',
    statusDetail: null,
    error: null,
    executionStatus: 'SUCCESS',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    lastUpdatedAt: null,
    ...rest,
  } as PluggyItem;
}

describe('planDiscovery — quais Items da Pluggy entram no app', () => {
  it('adiciona os Items novos e ignora os que já estão no app', () => {
    const plan = planDiscovery([item(1), item(2), item(3)], [uuid(2)], { includeSandbox: false });
    expect(plan.add.sort()).toEqual([uuid(1), uuid(3)]);
    expect(plan).toMatchObject({ found: 3, alreadyKnown: 1, skippedSandbox: 0, truncated: 0 });
  });

  it('não repete Items que a listagem devolve duas vezes nem diferencia maiúsculas', () => {
    const upper = { ...item(1), id: uuid(1).toUpperCase() };
    const plan = planDiscovery([item(1), upper, item(2)], [], { includeSandbox: false });
    expect(plan.add).toHaveLength(2);
    expect(plan.found).toBe(2);
    expect(planDiscovery([upper], [uuid(1)], { includeSandbox: false })).toMatchObject({ add: [], alreadyKnown: 1 });
  });

  it('ignora conectores de teste, a menos que a opção esteja ligada', () => {
    const list = [item(1), item(2, { sandbox: true })];
    expect(planDiscovery(list, [], { includeSandbox: false })).toMatchObject({ add: [uuid(1)], skippedSandbox: 1 });
    expect(planDiscovery(list, [], { includeSandbox: true }).add.sort()).toEqual([uuid(1), uuid(2)]);
  });

  it('lista vazia não adiciona nada', () => {
    expect(planDiscovery([], [], { includeSandbox: false })).toEqual({ add: [], found: 0, alreadyKnown: 0, skippedSandbox: 0, truncated: 0 });
  });

  it('ignora entradas sem ID', () => {
    const broken = { ...item(1), id: '' } as PluggyItem;
    expect(planDiscovery([broken, item(2)], [], { includeSandbox: false })).toMatchObject({ add: [uuid(2)], found: 1 });
  });

  it('respeita o teto e mantém as conexões mais recentes', () => {
    const list = Array.from({ length: 30 }, (_, i) => item(i + 1, { updatedAt: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` }));
    const plan = planDiscovery(list, [], { includeSandbox: false });
    expect(plan.add).toHaveLength(MAX_AUTO_ITEMS);
    expect(plan.truncated).toBe(10);
    const newest = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_AUTO_ITEMS).map((i) => i.id);
    expect(plan.add).toEqual(newest);
    expect(planDiscovery(list, [], { includeSandbox: false, max: 5 }).add).toHaveLength(5);
  });
});

describe('isDiscoveryUnavailable — recurso opt-in ausente não é falha', () => {
  it('403 (não habilitado) e 404 (rota ausente) significam "indisponível"', () => {
    expect(isDiscoveryUnavailable('forbidden')).toBe(true);
    expect(isDiscoveryUnavailable('not_found')).toBe(true);
  });

  it('erros de rede, limite e credenciais são falhas de verdade', () => {
    for (const k of ['offline', 'timeout', 'rate_limit', 'server', 'cors', 'token_expired', 'invalid_credentials', 'unknown'] as const) {
      expect(isDiscoveryUnavailable(k), k).toBe(false);
    }
  });
});
