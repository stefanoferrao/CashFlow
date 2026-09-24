import { describe, expect, it } from 'vitest';
import { emptyDataset, emptyLabels, type ConnectorInfo, type FinancialDataset, type NormalizedItem } from '../../src/models/finance';
import type { PluggyAccount } from '../../src/pluggy/types';
import { getCardCycle } from '../../src/services/financialCalculator';
import { isHolderName, normalizeAccount, normalizeCard } from '../../src/services/financialDataService';
import {
  applyIdentities,
  defaultAccountName,
  defaultCardName,
  detectInstitution,
  findConnector,
  initialsOf,
  KNOWN_INSTITUTIONS,
  prettifySlug,
  readableTextOn,
  resolveIdentity,
  searchConnectors,
  evidenceFor,
} from '../../src/services/institutions';
import { nextDayOfMonth } from '../../src/utils/dates';
import { BANK_ICONS, bankIcon, isAllowedLogoUrl, productIconFor, searchBankIcons } from '../../src/services/bankIcons';
import { account, card, investment, tx } from './fixtures';

const MEU_PLUGGY = 200;

function item(id: string, connectorId: number, name: string, extra: Partial<NormalizedItem['institution']> = {}): NormalizedItem {
  return {
    id,
    institution: { connectorId, name, imageUrl: null, primaryColor: '#EF294B', isOpenFinance: false, isSandbox: false, ...extra },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    syncState: 'updated',
    lastUpdatedAt: null,
    nextAutoSyncAt: null,
    consentExpiresAt: null,
    message: null,
    partialProducts: [],
  };
}

const CATALOG: ConnectorInfo[] = [
  { id: 612, name: 'Nubank', imageUrl: 'https://cdn.pluggy.ai/assets/connector-icons/nubank.svg', primaryColor: '#820AD1', type: 'PERSONAL_BANK', isOpenFinance: true },
  { id: 613, name: 'Nubank Empresas', imageUrl: 'https://cdn.pluggy.ai/assets/connector-icons/nubank-pj.svg', primaryColor: '#820AD1', type: 'BUSINESS_BANK', isOpenFinance: true },
  { id: 700, name: 'Inter PF', imageUrl: 'https://cdn.pluggy.ai/assets/connector-icons/inter.svg', primaryColor: '#FF7A00', type: 'PERSONAL_BANK', isOpenFinance: true },
];

describe('detecção do banco em conexões do Meu Pluggy', () => {
  it('reconhece o banco pela razão social da conta', () => {
    const d = detectInstitution([{ text: 'Nu Pagamentos S.A. - Instituição de Pagamento', strength: 'strong' }]);
    expect(d?.known.key).toBe('nubank');
    expect(d?.from).toContain('Nu Pagamentos');
  });

  it('nome genérico ("Conta Corrente") não identifica nada', () => {
    expect(detectInstitution([{ text: 'Conta Corrente', strength: 'strong' }])).toBeNull();
  });

  it('corretora com CDBs de vários emissores não é confundida com um emissor', () => {
    const ev = [
      { text: 'Banco Pan S.A.', strength: 'weak' as const, group: 'a' },
      { text: 'CDB Banco Pan', strength: 'weak' as const, group: 'a' },
      { text: 'Banco BMG', strength: 'weak' as const, group: 'b' },
      { text: 'Tesouro Selic', strength: 'weak' as const, group: 'c' },
    ];
    expect(detectInstitution(ev)).toBeNull();
  });

  it('só produtos: identifica quando TODOS (≥ 2) apontam para a mesma instituição', () => {
    const ev = [
      { text: 'CDB - NU FINANCEIRA S.A.', strength: 'weak' as const, group: 'a' },
      { text: 'RDB - NU FINANCEIRA S.A.', strength: 'weak' as const, group: 'b' },
    ];
    expect(detectInstitution(ev)?.known.key).toBe('nubank');
    expect(detectInstitution(ev.slice(0, 1))).toBeNull();
  });

  it('evidência forte precisa dominar', () => {
    const ev = [
      { text: 'Banco Inter S.A.', strength: 'strong' as const },
      { text: 'Itaú Unibanco S.A.', strength: 'strong' as const },
    ];
    expect(detectInstitution(ev)).toBeNull();
  });

  it('todas as instituições conhecidas têm padrões e regex de conector', () => {
    for (const k of KNOWN_INSTITUTIONS) {
      expect(k.patterns.length).toBeGreaterThan(0);
      expect(k.connector.test(k.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))).toBe(true);
    }
  });
});

describe('catálogo de conectores (logo e cor)', () => {
  it('prefere o conector de pessoa física', () => {
    const k = KNOWN_INSTITUTIONS.find((x) => x.key === 'nubank')!;
    expect(findConnector(k, CATALOG)?.id).toBe(612);
  });
  it('busca por nome, sem acento, um resultado por nome', () => {
    expect(searchConnectors('nu', CATALOG).map((c) => c.name)).toEqual(['Nubank', 'Nubank Empresas']);
    expect(searchConnectors('x', CATALOG)).toEqual([]);
  });
});

describe('nomes de contas e cartões', () => {
  it('razão social vira o tipo da conta; nomes úteis são mantidos', () => {
    expect(defaultAccountName({ name: 'Nu Pagamentos S.A. - Instituição de Pagamento', type: 'checking' })).toBe('Conta corrente');
    expect(defaultAccountName({ name: 'MeuPluggy', type: 'savings' }, 'MeuPluggy')).toBe('Poupança');
    expect(defaultAccountName({ name: 'Conta Corrente Aurora', type: 'checking' })).toBe('Conta Corrente Aurora');
  });
  it('cartão com nome só do banco vira bandeira + nível; "slug" fica legível', () => {
    expect(defaultCardName({ name: 'Nubank', brand: 'MASTERCARD', level: 'GOLD' })).toBe('Mastercard Gold');
    expect(defaultCardName({ name: 'Nubank Ultravioleta', brand: 'MASTERCARD', level: 'BLACK' })).toBe('Nubank Ultravioleta');
    expect(prettifySlug('croma-platinum')).toBe('Croma Platinum');
  });
  it('iniciais', () => {
    expect(initialsOf('Nubank')).toBe('NU');
    expect(initialsOf('Banco do Brasil')).toBe('BB');
    expect(initialsOf('C6 Bank')).toBe('C6');
  });
  it('cor do texto legível sobre a cor escolhida', () => {
    expect(readableTextOn('#820AD1')).toBe('#FFFFFF');
    expect(readableTextOn('#EAB308')).toBe('#111827');
  });
});

describe('nome do titular não é guardado como nome de conta/cartão', () => {
  it('reconhece o nome completo e o abreviado', () => {
    expect(isHolderName('MARIA J SILVA', 'Maria José da Silva')).toBe(true);
    expect(isHolderName('Maria José da Silva', 'MARIA JOSE DA SILVA')).toBe(true);
    expect(isHolderName('Mastercard Gold', 'Maria José da Silva')).toBe(false);
    expect(isHolderName('MARIA SOUZA', 'Maria José da Silva')).toBe(false);
  });
  const base: PluggyAccount = {
    id: 'c9',
    itemId: 'i9',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    number: '5996',
    balance: 0,
    name: 'MARIA J SILVA',
    marketingName: null,
    owner: 'Maria José da Silva',
    taxNumber: null,
    currencyCode: 'BRL',
    bankData: null,
    creditData: { level: 'GOLD', brand: 'MASTERCARD', balanceCloseDate: null, balanceDueDate: null, availableCreditLimit: 10, balanceForeignCurrency: null, minimumPayment: null, creditLimit: 100, isLimitFlexible: false, status: 'ACTIVE', holderType: 'MAIN' },
  };
  it('cartão nomeado com o titular vira "Mastercard Gold"', () => {
    const c = normalizeCard(base, 'MeuPluggy', null, false, null);
    expect(c.name).toBe('Mastercard Gold');
    expect(JSON.stringify(c)).not.toContain('SILVA');
  });
  it('conta nomeada com o titular vira o tipo da conta', () => {
    const a = normalizeAccount({ ...base, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Maria José da Silva', creditData: null }, 'MeuPluggy', null);
    expect(a.name).toBe('Conta corrente');
  });
});

function meuPluggyDataset(): FinancialDataset {
  const ds = emptyDataset('pluggy');
    ds.items = [item('it-nu', MEU_PLUGGY, 'MeuPluggy'), item('it-x', MEU_PLUGGY, 'MeuPluggy'), item('it-direct', 201, 'Banco Direto', { primaryColor: '#0F766E' })];
    ds.accounts = [
      account({ id: 'a-nu', itemId: 'it-nu', institution: 'MeuPluggy', name: 'Nu Pagamentos S.A. - Instituição de Pagamento' }),
      account({ id: 'a-x', itemId: 'it-x', institution: 'MeuPluggy', name: 'Conta Corrente' }),
      account({ id: 'a-d', itemId: 'it-direct', institution: 'Banco Direto', name: 'Conta Principal' }),
    ];
    ds.cards = [card({ id: 'c-x', itemId: 'it-x', institution: 'MeuPluggy', name: 'croma-platinum', closingDate: null, dueDate: null })];
    ds.transactions = [tx({ itemId: 'it-nu', institution: 'MeuPluggy', accountId: 'a-nu' })];
    ds.investments = [investment({ id: 'i-nu', itemId: 'it-nu', institution: 'MeuPluggy', name: 'CDB - NU FINANCEIRA S.A.' })];
    return ds;
}

describe('aplicação das identidades no dataset', () => {

  it('detecta, usa o ícone local (sem terceiros) e a cor, e aplica em contas, transações e investimentos', () => {
    const out = applyIdentities(meuPluggyDataset(), emptyLabels(), CATALOG);
    const nu = out.items.find((i) => i.id === 'it-nu')!.institution;
    expect(nu.name).toBe('Nubank');
    expect(nu.identitySource).toBe('detected');
    expect(nu.via).toBe('Meu Pluggy');
    expect(nu.imageUrl).toBe('./banks/nubank.svg');
    expect(nu.primaryColor).toBe('#820AD1');
    // Sem ícone local para a instituição, o logo do catálogo da Pluggy continua valendo.
    const noLocal = applyIdentities(meuPluggyDataset(), emptyLabels(), []);
    expect(noLocal.items.find((i) => i.id === 'it-nu')!.institution.imageUrl).toBe('./banks/nubank.svg');
    const acc = out.accounts.find((a) => a.id === 'a-nu')!;
    expect(acc.institution).toBe('Nubank');
    expect(acc.name).toBe('Conta corrente');
    expect(acc.rawName).toContain('Nu Pagamentos');
    expect(acc.label).toBe('Nubank · Conta corrente');
    expect(out.transactions[0]!.institution).toBe('Nubank');
    expect(out.investments[0]!.institution).toBe('Nubank');
  });

  it('conexão não identificada fica como "Meu Pluggy"; conexão direta mantém o conector', () => {
    const out = applyIdentities(meuPluggyDataset(), emptyLabels(), CATALOG);
    expect(out.items.find((i) => i.id === 'it-x')!.institution.identitySource).toBe('unidentified');
    expect(out.items.find((i) => i.id === 'it-x')!.institution.name).toBe('Meu Pluggy');
    expect(out.items.find((i) => i.id === 'it-direct')!.institution.name).toBe('Banco Direto');
    expect(out.cards[0]!.name).toBe('Croma Platinum');
  });

  it('personalização do usuário prevalece e vale para o cartão (nome, cor, apelido e ciclo)', () => {
    const labels = {
      ...emptyLabels(),
      identities: { 'it-x': { name: 'Inter', color: '#FF7A00', logo: 'icon' as const, icon: 'bank', connectorId: null, imageUrl: null, updatedAt: '' } },
      nicknames: { 'c-x': 'Cartão do dia a dia', 'a-x': 'Conta salário' },
      cardCycles: { 'c-x': { closingDay: 10, dueDay: 17 } },
    };
    const out = applyIdentities(meuPluggyDataset(), labels, CATALOG);
    const inst = out.items.find((i) => i.id === 'it-x')!.institution;
    expect(inst.name).toBe('Inter');
    expect(inst.logo).toBe('icon');
    expect(inst.identitySource).toBe('user');
    const c = out.cards[0]!;
    expect(c.institution).toBe('Inter');
    expect(c.institutionColor).toBe('#FF7A00');
    expect(c.name).toBe('Cartão do dia a dia');
    expect(c.label).toBe('Inter · Cartão do dia a dia');
    expect(c.manualClosingDay).toBe(10);
    expect(out.accounts.find((a) => a.id === 'a-x')!.name).toBe('Conta salário');
    // O dataset original não é alterado
    expect(meuPluggyDataset().cards[0]!.name).toBe('croma-platinum');
  });

  it('sugestão continua disponível mesmo após personalizar', () => {
    const ds = meuPluggyDataset();
    const labels = { ...emptyLabels(), identities: { 'it-nu': { name: 'Roxinho', color: '#820AD1', logo: 'initials' as const, icon: null, connectorId: null, imageUrl: null, updatedAt: '' } } };
    const it = ds.items[0]!;
    const r = resolveIdentity(it, evidenceFor(ds, it), labels, CATALOG);
    expect(r.name).toBe('Roxinho');
    expect(r.suggestion?.name).toBe('Nubank');
  });
});

describe('fechamento e vencimento definidos pelo usuário', () => {
  it('nextDayOfMonth respeita meses curtos', () => {
    expect(nextDayOfMonth('2026-09-23', 10)).toBe('2026-10-10');
    expect(nextDayOfMonth('2026-09-23', 23)).toBe('2026-09-23');
    expect(nextDayOfMonth('2027-02-01', 31)).toBe('2027-02-28');
  });

  it('cartão sem datas usa os dias definidos (fonte "user", não estimado)', () => {
    const c = card({ closingDate: null, dueDate: null, manualClosingDay: 10, manualDueDay: 17 });
    const cycle = getCardCycle(c, [], '2026-09-23')!;
    expect(cycle.closing).toBe('2026-10-10');
    expect(cycle.due).toBe('2026-10-17');
    expect(cycle.start).toBe('2026-09-11');
    expect(cycle.source).toBe('user');
    expect(cycle.estimated).toBe(false);
  });

  it('vencimento antes do fechamento cai no mês seguinte', () => {
    const cycle = getCardCycle(card({ closingDate: null, dueDate: null, manualClosingDay: 28, manualDueDay: 5 }), [], '2026-09-23')!;
    expect(cycle.closing).toBe('2026-09-28');
    expect(cycle.due).toBe('2026-10-05');
  });

  it('dias definidos pelo usuário têm prioridade sobre as datas da instituição', () => {
    const cycle = getCardCycle(card({ manualClosingDay: 10, manualDueDay: 17 }), [], '2026-09-15')!;
    expect(cycle.closing).toBe('2026-10-10');
    expect(cycle.due).toBe('2026-10-17');
    expect(cycle.source).toBe('user');
    // Sem dias do usuário, valem as da instituição.
    const inst = getCardCycle(card(), [], '2026-09-15')!;
    expect(inst.closing).toBe('2026-09-28');
    expect(inst.source).toBe('institution');
  });

  it('só o fechamento definido: vencimento segue o intervalo informado pela instituição', () => {
    const cycle = getCardCycle(card({ closingDate: '2026-09-28', dueDate: '2026-10-05', manualClosingDay: 1 }), [], '2026-09-15')!;
    expect(cycle.closing).toBe('2026-10-01');
    expect(cycle.due).toBe('2026-10-08');
  });

  it('sem datas e sem dias definidos → sem ciclo (nada é inventado)', () => {
    expect(getCardCycle(card({ closingDate: null, dueDate: null }), [], '2026-09-23')).toBeNull();
  });
});

describe('biblioteca local de ícones (react-bancos)', () => {
  it('tem os bancos pedidos e busca por nome, código COMPE e produto', () => {
    for (const slug of ['nubank', 'inter', 'banrisul', 'xp', 'c6bank', 'itau', 'bradesco', 'btgpactual', 'nubankultravioleta']) {
      expect(bankIcon(slug)?.slug).toBe(slug);
    }
    expect(BANK_ICONS.length).toBeGreaterThan(200);
    expect(searchBankIcons('inter')[0]!.slug).toBe('inter');
    expect(searchBankIcons('077')[0]!.slug).toBe('inter');
    expect(searchBankIcons('ultravioleta').map((b) => b.slug)).toContain('nubankultravioleta');
    expect(searchBankIcons('banrisul').map((b) => b.slug)).toContain('banrisulinfinite');
  });

  it('só aceita URLs de logo seguras', () => {
    expect(isAllowedLogoUrl('./banks/nubank.svg')).toBe(true);
    expect(isAllowedLogoUrl('./banks/nao-existe.svg')).toBe(false);
    expect(isAllowedLogoUrl('https://cdn.pluggy.ai/x.svg')).toBe(true);
    expect(isAllowedLogoUrl('http://exemplo.com/x.svg')).toBe(false);
    expect(isAllowedLogoUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedLogoUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isAllowedLogoUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
  });

  it('reconhece o produto do cartão pelo nome ou nível quando o banco é conhecido', () => {
    expect(productIconFor('nubank', 'Ultravioleta Mastercard Black')?.slug).toBe('nubankultravioleta');
    expect(productIconFor('nubank', 'croma-platinum')?.slug).toBe('nubankcroma');
    expect(productIconFor('banrisul', 'VISA INFINITE')?.slug).toBe('banrisulinfinite');
    expect(productIconFor('c6bank', 'C6 Carbon')?.slug).toBe('c6carbon');
    expect(productIconFor('inter', 'Mastercard Gold')).toBeNull();
    expect(productIconFor(null, 'Ultravioleta')).toBeNull();
  });

  it('cartão ganha o logo do produto; o usuário pode escolher outro ou manter o da instituição', () => {
    const ds = meuPluggyDataset();
    const labels = { ...emptyLabels(), identities: { 'it-x': { name: 'Nubank', color: '#820AD1', logo: 'image' as const, icon: null, connectorId: null, imageUrl: null, bank: 'nubank', updatedAt: '' } } };
    const auto = applyIdentities(ds, labels, []).cards.find((c) => c.id === 'c-x')!;
    expect(auto.logoSource).toBe('detected');
    expect(auto.logo?.imageUrl).toBe('./banks/nubankcroma.svg');
    const chosen = applyIdentities(ds, { ...labels, productLogos: { 'c-x': { bank: 'nubankultravioleta', imageUrl: null } } }, []).cards.find((c) => c.id === 'c-x')!;
    expect(chosen.logoSource).toBe('user');
    expect(chosen.logo?.name).toBe('Nubank Ultravioleta');
    const inherit = applyIdentities(ds, { ...labels, productLogos: { 'c-x': { bank: null, imageUrl: null, inherit: true } } }, []).cards.find((c) => c.id === 'c-x')!;
    expect(inherit.logo).toBeNull();
    expect(inherit.institutionColor).toBe('#820AD1');
  });
});
