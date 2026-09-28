import { describe, expect, it } from 'vitest';
import { emptyCategorization, emptyLabels, type PlannedEntry, type UserCategorization, type UserLabels } from '../../src/models/finance';
import {
  CONFIG_VERSION,
  MAX_CONFIG_BYTES,
  buildUserConfig,
  describeUserConfig,
  mergeCategorization,
  mergeLabels,
  mergePlanned,
  parseUserConfig,
  type UserConfigSource,
} from '../../src/services/userConfig';

const ITEM = '4114bd90-aaaa-4bbb-8ccc-000000006a55';
const CARD = 'b3115ef6-aaaa-4bbb-8ccc-0000000066cf';
const ACCOUNT = '65c33f2a-aaaa-4bbb-8ccc-000000000ba4';
const UPLOAD = 'data:image/png;base64,iVBORw0KGgo=';

function source(over: Partial<UserConfigSource> = {}): UserConfigSource {
  const labels: UserLabels = {
    identities: {
      [ITEM]: { name: 'Meu Inter', color: '#ff7a00', logo: 'image', icon: null, connectorId: null, imageUrl: null, bank: 'inter', updatedAt: '2026-09-01T00:00:00.000Z' },
    },
    nicknames: { [CARD]: 'Cartão da casa', [ACCOUNT]: 'Conta do salário' },
    cardCycles: { [CARD]: { closingDay: 25, dueDay: 5 } },
    productLogos: { [CARD]: { bank: 'nubank', imageUrl: null }, [ACCOUNT]: { bank: null, imageUrl: UPLOAD } },
  };
  const categorization: UserCategorization = {
    overrides: { 'tx-1': { category: 'alimentacao', subcategory: 'Feira' }, 'tx-2': { ignored: true } },
    rules: [{ id: 'rule-1', contains: 'padaria', category: 'alimentacao', subcategory: null }],
    customSubcategories: { alimentacao: ['Feira'] },
  };
  const planned: PlannedEntry[] = [{ id: 'plan-1', description: 'Aluguel', amount: -1500, date: '2026-10-05', recurrence: 'monthly' }];
  return {
    theme: 'dark',
    preferences: { hideValues: true, includeEstimates: false, cacheTtlHours: 6 },
    layout: { version: 1, widgets: [{ id: 'patrimonio', x: 0, y: 0, w: 6, h: 4, visible: true, pinned: false }], mobileOrder: ['patrimonio', 'fluxo'] },
    labels,
    categorization,
    planned,
    ...over,
  };
}

const roundTrip = (src: UserConfigSource = source()) => parseUserConfig(JSON.stringify(buildUserConfig(src)));

describe('exportar → importar copia as personalizações do usuário', () => {
  it('nomes das contas e dos cartões', () => {
    expect(roundTrip().config.labels?.nicknames).toEqual({ [CARD]: 'Cartão da casa', [ACCOUNT]: 'Conta do salário' });
  });

  it('datas de fechamento e vencimento dos cartões', () => {
    expect(roundTrip().config.labels?.cardCycles).toEqual({ [CARD]: { closingDay: 25, dueDay: 5 } });
  });

  it('aparência (nome, cor, logo) da instituição e ícones dos cartões e contas', () => {
    const labels = roundTrip().config.labels!;
    expect(labels.identities[ITEM]).toMatchObject({ name: 'Meu Inter', color: '#FF7A00', logo: 'image', bank: 'inter' });
    expect(labels.productLogos[CARD]).toEqual({ bank: 'nubank', imageUrl: null });
    expect(labels.productLogos[ACCOUNT]).toEqual({ bank: null, imageUrl: UPLOAD });
  });

  it('organização dos cards do dashboard, no computador e no celular', () => {
    const layout = roundTrip().config.layout!;
    expect(layout.widgets).toEqual([{ id: 'patrimonio', x: 0, y: 0, w: 6, h: 4, visible: true, pinned: false }]);
    expect(layout.mobileOrder).toEqual(['patrimonio', 'fluxo']);
  });

  it('tema, preferências, categorização e lançamentos previstos', () => {
    const { config } = roundTrip();
    expect(config.theme).toBe('dark');
    expect(config.preferences).toEqual({ hideValues: true, includeEstimates: false, cacheTtlHours: 6 });
    expect(config.categorization?.rules).toHaveLength(1);
    expect(config.categorization?.overrides['tx-1']).toEqual({ category: 'alimentacao', subcategory: 'Feira' });
    expect(config.categorization?.customSubcategories).toEqual({ alimentacao: ['Feira'] });
    expect(config.planned).toEqual([{ id: 'plan-1', description: 'Aluguel', amount: -1500, date: '2026-10-05', recurrence: 'monthly' }]);
  });

  it('o arquivo exportado só tem os campos da lista permitida', () => {
    const file = buildUserConfig(source());
    expect(Object.keys(file).sort()).toEqual(['app', 'categorization', 'dashboardLayout', 'exportedAt', 'kind', 'labels', 'plannedEntries', 'preferences', 'theme', 'version']);
    expect(Object.keys(file.preferences as object).sort()).toEqual(['cacheTtlHours', 'hideValues', 'includeEstimates']);
    expect(file.version).toBe(CONFIG_VERSION);
    const text = JSON.stringify(file).toLowerCase();
    for (const word of ['secret', 'password', 'passphrase', 'apikey', 'token', 'credential', 'clientid', 'autolock', 'apimode']) expect(text).not.toContain(word);
  });
});

describe('importar nunca aplica dados de login, API ou segurança', () => {
  function hostile(): string {
    const f = buildUserConfig(source()) as Record<string, unknown>;
    return JSON.stringify({
      ...f,
      clientId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      clientSecret: 'segredo',
      credentials: { clientId: 'x', clientSecret: 'y' },
      apiKey: 'jwt',
      connectToken: 'tok',
      passphrase: 'minha-senha',
      vault: { salt: 'x' },
      itemIds: [ITEM],
      items: [{ id: ITEM }],
      preferences: { hideValues: false, autoLockMinutes: 0, apiMode: 'proxy', includeSandbox: true, debug: true, mode: 'demo', cacheTtlHours: 12 },
    });
  }

  it('descarta os campos de segurança e conexão, e avisa quais foram ignorados', () => {
    const parsed = parseUserConfig(hostile());
    expect(parsed.ignored).toEqual(
      expect.arrayContaining(['apiKey', 'clientId', 'clientSecret', 'connectToken', 'credentials', 'itemIds', 'items', 'passphrase', 'vault', 'preferences.apiMode', 'preferences.autoLockMinutes', 'preferences.debug', 'preferences.includeSandbox', 'preferences.mode']),
    );
    // Do resultado só sobram preferências de exibição.
    expect(Object.keys(parsed.config).sort()).toEqual(['categorization', 'labels', 'layout', 'planned', 'preferences', 'theme']);
    expect(parsed.config.preferences).toEqual({ hideValues: false, cacheTtlHours: 12 });
    const dump = JSON.stringify(parsed.config);
    for (const secret of ['segredo', 'jwt', 'tok', 'minha-senha', 'aaaaaaaa-bbbb']) expect(dump).not.toContain(secret);
  });

  it('valores de preferência fora do permitido são recusados', () => {
    const f = { ...(buildUserConfig(source()) as object), preferences: { hideValues: 'sim', includeEstimates: 1, cacheTtlHours: 999 } };
    expect(parseUserConfig(JSON.stringify(f)).config.preferences).toEqual({});
  });
});

describe('importar valida o que vem no arquivo', () => {
  const withLabels = (labels: unknown) => JSON.stringify({ ...(buildUserConfig(source()) as object), labels });

  it('cor inválida vira a cor padrão e logo com endereço perigoso é descartado', () => {
    const parsed = parseUserConfig(
      withLabels({
        identities: {
          [ITEM]: { name: 'Banco', color: 'red; background:url(x)', logo: 'image', icon: null, connectorId: null, imageUrl: 'javascript:alert(1)', bank: null },
        },
      }),
    );
    expect(parsed.config.labels?.identities[ITEM]).toMatchObject({ color: '#64748B', logo: 'initials', imageUrl: null });
  });

  it('logo enviado só vale se for imagem png/jpeg/webp em data URL', () => {
    const parsed = parseUserConfig(withLabels({ productLogos: { a: { bank: null, imageUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, b: { bank: null, imageUrl: 'https://evil.example/x.png' }, c: { bank: 'nao-existe', imageUrl: null } } }));
    expect(parsed.config.labels?.productLogos).toEqual({});
    expect(parsed.dropped).toBe(3);
  });

  it('datas de fechamento/vencimento fora de 1–31 são descartadas', () => {
    const parsed = parseUserConfig(withLabels({ cardCycles: { ok: { closingDay: 31, dueDay: null }, ruim: { closingDay: 32, dueDay: 0 }, texto: { closingDay: '5', dueDay: '10' } } }));
    expect(parsed.config.labels?.cardCycles).toEqual({ ok: { closingDay: 31, dueDay: null } });
  });

  it('chaves que mexem no protótipo ou com caracteres estranhos não entram', () => {
    const text = `{"app":"cashflow","kind":"visual-config","labels":{"nicknames":{"__proto__":"x","constructor":"y","a b":"z","<img src=x>":"w","ok-1":"Meu cartão"}}}`;
    const nick = parseUserConfig(text).config.labels?.nicknames ?? {};
    expect(Object.keys(nick)).toEqual(['ok-1']);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('apelidos são cortados em 40 caracteres e vazios descartados', () => {
    const parsed = parseUserConfig(withLabels({ nicknames: { a: 'x'.repeat(100), b: '   ', c: 5 } }));
    expect(parsed.config.labels?.nicknames).toEqual({ a: 'x'.repeat(40) });
  });

  it('cards do dashboard com posição inválida ou identificador estranho são descartados', () => {
    const f = { ...(buildUserConfig(source()) as object), dashboardLayout: { version: 1, widgets: [{ id: 'ok', x: 0, y: 0, w: 3, h: 2 }, { id: 'ruim', x: -1, y: 0, w: 3, h: 2 }, { id: 'muito', x: 0, y: 0, w: 999, h: 2 }, { id: '<b>', x: 0, y: 0, w: 1, h: 1 }] } };
    const layout = parseUserConfig(JSON.stringify(f)).config.layout!;
    expect(layout.widgets).toEqual([{ id: 'ok', x: 0, y: 0, w: 3, h: 2, visible: true, pinned: false }]);
  });

  it('categorias inexistentes e regras sem texto são descartadas', () => {
    const f = {
      ...(buildUserConfig(source()) as object),
      categorization: {
        overrides: { a: { category: 'inventada' }, b: { category: 'alimentacao' } },
        rules: [{ id: 'r1', contains: '', category: 'alimentacao' }, { id: 'r2', contains: 'uber', category: 'inventada' }, { id: 'r3', contains: 'uber', category: 'transporte' }],
        customSubcategories: { inventada: ['x'], alimentacao: ['Feira', 'Feira', ''] },
      },
    };
    const uc = parseUserConfig(JSON.stringify(f)).config.categorization!;
    expect(Object.keys(uc.overrides)).toEqual(['b']);
    expect(uc.rules.map((r) => r.id)).toEqual(['r3']);
    expect(uc.customSubcategories).toEqual({ alimentacao: ['Feira'] });
  });

  it('lançamentos previstos com data ou valor inválido são descartados', () => {
    const f = {
      ...(buildUserConfig(source()) as object),
      plannedEntries: [
        { id: 'p1', description: 'Ok', amount: 10.556, date: '2026-10-05', recurrence: 'qualquer' },
        { id: 'p2', description: 'Data', amount: 1, date: '05/10/2026', recurrence: 'none' },
        { id: 'p3', description: 'Valor', amount: '10', date: '2026-10-05', recurrence: 'none' },
        { id: 'p4', description: 'Infinito', amount: 1e12, date: '2026-10-05', recurrence: 'none' },
      ],
    };
    expect(parseUserConfig(JSON.stringify(f)).config.planned).toEqual([{ id: 'p1', description: 'Ok', amount: 10.56, date: '2026-10-05', recurrence: 'none' }]);
  });
});

describe('arquivos que não servem', () => {
  it('recusa JSON inválido, arquivo de outro app e arquivo grande demais', () => {
    expect(() => parseUserConfig('não é json')).toThrow(/não é um JSON/);
    expect(() => parseUserConfig('{"app":"outro","kind":"visual-config"}')).toThrow(/não é uma configuração do CashFlow/);
    expect(() => parseUserConfig('{"app":"cashflow","kind":"backup"}')).toThrow(/não é uma configuração do CashFlow/);
    expect(() => parseUserConfig('[]')).toThrow(/não é uma configuração do CashFlow/);
    expect(() => parseUserConfig(' '.repeat(MAX_CONFIG_BYTES + 1))).toThrow(/grande demais/);
  });

  it('arquivo da versão 1 (só tema, preferências e dashboard) continua valendo', () => {
    const v1 = JSON.stringify({
      app: 'cashflow',
      kind: 'visual-config',
      version: 1,
      theme: 'light',
      preferences: { hideValues: true, includeEstimates: true },
      dashboardLayout: { version: 1, widgets: [{ id: 'fluxo', x: 0, y: 0, w: 12, h: 5, visible: true, pinned: true }] },
    });
    const parsed = parseUserConfig(v1);
    expect(parsed.version).toBe(1);
    expect(parsed.config).toMatchObject({ theme: 'light', labels: null, categorization: null, planned: null });
    expect(parsed.config.layout?.widgets[0]).toMatchObject({ id: 'fluxo', pinned: true });
  });
});

describe('describeUserConfig — resumo mostrado antes de importar', () => {
  it('lista o que o arquivo traz', () => {
    const lines = describeUserConfig(roundTrip().config);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Tema escuro',
        'Preferências de exibição',
        'Organização do dashboard (1 card)',
        'Nomes de 2 contas e cartões',
        'Nome, cor e logo de 1 instituição',
        'Ícones de 2 contas e cartões',
        'Fechamento e vencimento de 1 cartão',
        'Categorização (4 ajustes e regras)',
        '1 lançamento previsto',
      ]),
    );
  });

  it('arquivo sem nada aplicável dá lista vazia', () => {
    const empty = parseUserConfig('{"app":"cashflow","kind":"visual-config"}');
    expect(describeUserConfig(empty.config)).toEqual([]);
  });
});

describe('mesclar ao importar: o do arquivo vence, o que só existe aqui fica', () => {
  it('rótulos', () => {
    const cur: UserLabels = { ...emptyLabels(), nicknames: { a: 'Antigo', so_aqui: 'Meu' }, cardCycles: { a: { closingDay: 1, dueDay: 2 } } };
    const inc: UserLabels = { ...emptyLabels(), nicknames: { a: 'Novo' }, cardCycles: { b: { closingDay: 10, dueDay: 20 } } };
    const merged = mergeLabels(cur, inc);
    expect(merged.nicknames).toEqual({ a: 'Novo', so_aqui: 'Meu' });
    expect(merged.cardCycles).toEqual({ a: { closingDay: 1, dueDay: 2 }, b: { closingDay: 10, dueDay: 20 } });
  });

  it('categorização', () => {
    const cur: UserCategorization = { overrides: { t1: { category: 'alimentacao' } }, rules: [{ id: 'r1', contains: 'a', category: 'alimentacao', subcategory: null }], customSubcategories: { alimentacao: ['A'] } };
    const inc: UserCategorization = { overrides: { t1: { category: 'transporte' } }, rules: [{ id: 'r1', contains: 'b', category: 'alimentacao', subcategory: null }, { id: 'r2', contains: 'c', category: 'alimentacao', subcategory: null }], customSubcategories: { alimentacao: ['A', 'B'] } };
    const merged = mergeCategorization(cur, inc);
    expect(merged.overrides.t1).toEqual({ category: 'transporte' });
    expect(merged.rules.map((r) => [r.id, r.contains])).toEqual([['r1', 'b'], ['r2', 'c']]);
    expect(merged.customSubcategories.alimentacao).toEqual(['A', 'B']);
    expect(mergeCategorization(emptyCategorization(), emptyCategorization())).toEqual(emptyCategorization());
  });

  it('lançamentos previstos: importar duas vezes não duplica', () => {
    const p = (id: string, amount: number): PlannedEntry => ({ id, description: id, amount, date: '2026-10-05', recurrence: 'none' });
    const once = mergePlanned([p('a', 1)], [p('a', 2), p('b', 3)]);
    expect(once.map((x) => [x.id, x.amount])).toEqual([['a', 2], ['b', 3]]);
    expect(mergePlanned(once, [p('a', 2), p('b', 3)])).toHaveLength(2);
  });
});
