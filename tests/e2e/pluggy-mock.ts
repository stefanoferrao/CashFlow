/**
 * Mock da API Pluggy para testes E2E (page.route). Estruturas conforme o SDK oficial.
 * NENHUM teste usa credenciais reais.
 */
import type { Page, Route } from '@playwright/test';

export const ITEM_ID = '11111111-2222-4333-8444-555555555555';
export const CLIENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const GOOD_SECRET = 'segredo-valido-1234567890';
export const BAD_SECRET = 'segredo-invalido-000000';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
};
const nextDay = (dom: number) => {
  const d = new Date();
  const candidate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), dom));
  if (candidate.getTime() < Date.now() - 86400000) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  return candidate.toISOString();
};

function jwt(): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 7200, sub: 'mock' })}.mock-signature`;
}

export interface MockState {
  authCalls: number;
  cursorCalls: number;
  requests: string[];
  itemStatus: number;
}

/** Logo servido no lugar do CDN da Pluggy (catálogo de conectores simulado). */
export const NUBANK_LOGO = 'https://cdn.pluggy.ai/e2e-mock/nubank.svg';

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

/**
 * `meuPluggy`: simula uma conexão feita pelo Meu Pluggy (conector 200, sem nome do banco), com conta nomeada pela
 * razão social, cartão nomeado com o titular e sem datas de fechamento/vencimento — o caso real que motivou a
 * camada de identidade das instituições.
 */
export async function mockPluggy(page: Page, opts: { itemStatus?: number; meuPluggy?: boolean } = {}): Promise<MockState> {
  const state: MockState = { authCalls: 0, cursorCalls: 0, requests: [], itemStatus: opts.itemStatus ?? 200 };
  const mp = !!opts.meuPluggy;
  await page.route('https://cdn.pluggy.ai/e2e-mock/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#820AD1"/></svg>' }),
  );
  await page.route('https://api.pluggy.ai/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    state.requests.push(`${req.method()} ${url.pathname}${url.search}`);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });

    if (url.pathname === '/auth') {
      state.authCalls++;
      const body = JSON.parse(req.postData() ?? '{}') as { clientSecret?: string };
      if (body.clientSecret !== GOOD_SECRET) return json(route, 401, { code: 401, codeDescription: 'CLIENT_KEYS_UNAUTHORIZED', message: 'client keys are invalid' });
      return json(route, 200, { apiKey: jwt() });
    }
    if (url.pathname === `/items/${ITEM_ID}`) {
      if (state.itemStatus !== 200) return json(route, state.itemStatus, { code: state.itemStatus, codeDescription: 'ITEM_NOT_FOUND', message: 'Item not found' });
      return json(route, 200, {
        id: ITEM_ID,
        connector: mp
          ? { id: 200, name: 'MeuPluggy', primaryColor: 'ef294b', isOpenFinance: false, isSandbox: false, imageUrl: '' }
          : { id: 201, name: 'Banco Mock', primaryColor: '0f766e', isOpenFinance: true, isSandbox: false, imageUrl: '' },
        status: 'UPDATED',
        executionStatus: 'SUCCESS',
        statusDetail: null,
        error: null,
        createdAt: day(-100),
        updatedAt: day(0),
        lastUpdatedAt: new Date(Date.now() - 3600_000).toISOString(),
        nextAutoSyncAt: null,
        consentExpiresAt: null,
      });
    }
    if (url.pathname === '/accounts') {
      return json(route, 200, {
        page: 1,
        total: 2,
        totalPages: 1,
        results: [
          {
            id: 'acc-mock-1',
            itemId: ITEM_ID,
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            number: '0001/12345-6',
            balance: 10000,
            name: mp ? 'Nu Pagamentos S.A. - Instituição de Pagamento' : 'Conta Corrente',
            marketingName: null,
            owner: 'Titular Mock',
            taxNumber: '000.000.000-00',
            currencyCode: 'BRL',
            bankData: { transferNumber: '0001/12345-6', closingBalance: 10000, automaticallyInvestedBalance: null, overdraftContractedLimit: null, overdraftUsedLimit: null, unarrangedOverdraftAmount: null },
            creditData: null,
          },
          {
            id: 'card-mock-1',
            itemId: ITEM_ID,
            type: 'CREDIT',
            subtype: 'CREDIT_CARD',
            number: '4821',
            balance: 1500,
            name: mp ? 'TITULAR M SILVA' : 'Cartão Mock',
            marketingName: mp ? null : 'Mock Platinum',
            owner: mp ? 'Titular Mock Silva' : 'Titular Mock',
            taxNumber: null,
            currencyCode: 'BRL',
            bankData: null,
            creditData: {
              level: mp ? 'GOLD' : 'PLATINUM',
              brand: mp ? 'MASTERCARD' : 'VISA',
              balanceCloseDate: mp ? null : nextDay(25),
              balanceDueDate: mp ? null : nextDay(5),
              availableCreditLimit: 3500,
              balanceForeignCurrency: null,
              minimumPayment: null,
              creditLimit: 5000,
              isLimitFlexible: false,
              status: 'ACTIVE',
              holderType: 'MAIN',
            },
          },
        ],
      });
    }
    if (url.pathname === '/v2/transactions') {
      const acc = url.searchParams.get('accountId');
      if (url.searchParams.get('after')) {
        state.cursorCalls++;
        return json(route, 200, {
          results: acc === 'acc-mock-1' ? [{ id: 'tx-p2', accountId: acc, date: day(-20), description: 'MERCADO PAGINA DOIS', descriptionRaw: null, type: 'DEBIT', amount: -150, amountInAccountCurrency: null, balance: 0, currencyCode: 'BRL', category: 'Groceries', categoryId: '07010000', status: 'POSTED', creditCardMetadata: null, operationType: null, providerId: null }] : [],
          next: null,
        });
      }
      if (acc === 'acc-mock-1') {
        return json(route, 200, {
          results: [
            { id: 'tx-sal', accountId: acc, date: day(-10), description: 'SALARIO EMPRESA', descriptionRaw: null, type: 'CREDIT', amount: 8000, amountInAccountCurrency: null, balance: 0, currencyCode: 'BRL', category: 'Salary', categoryId: '01010000', status: 'POSTED', creditCardMetadata: null, operationType: null, providerId: null },
            { id: 'tx-xss', accountId: acc, date: day(-5), description: '<img src=x onerror="window.__xss=1">LOJA', descriptionRaw: null, type: 'DEBIT', amount: -99.9, amountInAccountCurrency: null, balance: 0, currencyCode: 'BRL', category: null, categoryId: null, status: 'POSTED', creditCardMetadata: null, operationType: null, providerId: null },
          ],
          next: `?accountId=${acc}&after=Y3Vyc29y%2BMQ%3D%3D`,
        });
      }
      return json(route, 200, {
        results: [
          { id: 'tx-card-1', accountId: acc, date: day(-2), description: 'RESTAURANTE MOCK', descriptionRaw: null, type: 'DEBIT', amount: 120, amountInAccountCurrency: null, balance: 0, currencyCode: 'BRL', category: 'Restaurants', categoryId: '11010000', status: 'POSTED', creditCardMetadata: null, operationType: null, providerId: null },
        ],
        next: null,
      });
    }
    if (url.pathname === '/bills') return json(route, 200, { page: 1, total: 0, totalPages: 1, results: [] });
    if (url.pathname === '/connectors') {
      return json(route, 200, {
        page: 1,
        total: 3,
        totalPages: 1,
        results: [
          { id: 612, name: 'Nubank', imageUrl: NUBANK_LOGO, primaryColor: '820ad1', type: 'PERSONAL_BANK', country: 'BR', isOpenFinance: true },
          { id: 613, name: 'Nubank Empresas', imageUrl: NUBANK_LOGO, primaryColor: '820ad1', type: 'BUSINESS_BANK', country: 'BR', isOpenFinance: true },
          { id: 700, name: 'Inter PF', imageUrl: 'https://cdn.pluggy.ai/e2e-mock/inter.svg', primaryColor: 'ff7a00', type: 'PERSONAL_BANK', country: 'BR', isOpenFinance: true },
        ],
      });
    }
    if (url.pathname === '/investments') {
      return json(route, 200, {
        page: 1,
        total: 1,
        totalPages: 1,
        results: [
          { id: 'inv-1', code: null, isin: null, itemId: ITEM_ID, type: 'FIXED_INCOME', subtype: 'CDB', name: 'CDB Mock', currencyCode: 'BRL', date: day(0), value: null, quantity: null, balance: 20000, amount: 20500, amountWithdrawal: null, amountProfit: 2000, amountOriginal: 18000, dueDate: day(400), issuer: 'Banco Mock', issueDate: null, rate: 110, rateType: 'CDI', fixedAnnualRate: null, lastMonthRate: null, annualRate: null, lastTwelveMonthsRate: null, status: 'ACTIVE', institution: { name: 'Banco Mock', number: null } },
        ],
      });
    }
    if (url.pathname === '/categories') {
      return json(route, 200, {
        page: 1,
        total: 5,
        totalPages: 1,
        results: [
          { id: '01000000', description: 'Income', descriptionTranslated: 'Renda' },
          { id: '01010000', description: 'Salary', descriptionTranslated: 'Salário', parentId: '01000000' },
          { id: '07000000', description: 'Groceries', descriptionTranslated: 'Supermercado' },
          { id: '07010000', description: 'Supermarket', descriptionTranslated: 'Supermercado', parentId: '07000000' },
          { id: '11000000', description: 'Food and drinks', descriptionTranslated: 'Alimentação' },
          { id: '11010000', description: 'Restaurants', descriptionTranslated: 'Restaurantes', parentId: '11000000' },
        ],
      });
    }
    return json(route, 404, { code: 404, codeDescription: 'NOT_FOUND', message: 'not found' });
  });
  return state;
}

/** Lê TODO o conteúdo do IndexedDB do app (para verificar que nada sensível está em texto puro). */
export async function dumpIndexedDb(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    if (!dbs.some((d) => d.name === 'cashflow')) return '';
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('cashflow');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const out: Record<string, unknown[]> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      out[name] = await new Promise((res) => {
        const r = db.transaction(name, 'readonly').objectStore(name).getAll();
        r.onsuccess = () => res(r.result);
      });
    }
    db.close();
    return JSON.stringify(out);
  });
}
