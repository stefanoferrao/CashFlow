/**
 * E2E (Chromium real): "preciso relogar toda hora" — auto-bloqueio por inatividade, recarregar/abrir outra aba,
 * erros transitórios, modo sessão, IndexedDB instável e persistência do armazenamento.
 *
 * - O tempo é virtual (`page.clock`): 15 min de inatividade custam milissegundos de teste.
 * - A Pluggy é simulada com `page.route()` — nenhum teste usa credenciais reais nem a internet.
 * - Só contextos descartáveis do Playwright: nenhum dado do usuário é tocado.
 */
import { expect, test, type Page } from '@playwright/test';
import { CLIENT_ID, GOOD_SECRET, ITEM_ID, dumpIndexedDb, mockPluggy } from './pluggy-mock';

const PASS = 'Minha-Senha-Local-2026';
const MIN = 60_000;

const lockHeading = (page: Page) => page.getByRole('heading', { name: 'Desbloquear o CashFlow' });

async function quietGithub(page: Page) {
  // Notas de Atualização não dependem da internet nos testes.
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 503, body: '' }));
}

/** Onboarding → Client ID/Secret → Item → Dashboard com saldo. `session`: "Usar somente nesta sessão". */
async function setupReal(page: Page, opts: { session?: boolean } = {}) {
  await quietGithub(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar', exact: false }).first().click();
  await page.locator('input[name="clientId"]').fill(CLIENT_ID);
  await page.locator('input[name="clientSecret"]').fill(GOOD_SECRET);
  if (opts.session) {
    await page.locator('input[name="storage"][value="session"]').check();
  } else {
    await page.locator('input[name="pass1"]').fill(PASS);
    await page.locator('input[name="pass2"]').fill(PASS);
  }
  await page.getByRole('button', { name: 'Testar conexão e salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Conecte suas instituições.' })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="itemId"]').fill(ITEM_ID);
  await page.getByRole('button', { name: 'Adicionar Item' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
  await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
}

async function setAutoLock(page: Page, minutes: '5' | '15' | '30' | '60' | '0') {
  await page.evaluate(() => (location.hash = '#/configuracoes'));
  await page.locator('select[data-change="autolock"]').selectOption(minutes);
  await expect(page.locator('select[data-change="autolock"]')).toHaveValue(minutes);
}

async function unlock(page: Page, pass = PASS) {
  await page.locator('input[name="passphrase"]').fill(pass);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
}

/** Congela o relógio do navegador: daqui em diante só `runFor`/`setSystemTime` mexem no tempo. */
async function freezeClock(page: Page): Promise<number> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1_000);
  return now + 1_000;
}

/**
 * Espera a tela de senha aparecer. A tela é carregada sob demanda (import dinâmico, tempo REAL) e o relógio do navegador
 * está congelado: sem empurrar o tempo virtual aos poucos, máquina ocupada = falso vermelho.
 */
async function expectLocked(page: Page) {
  await expect
    .poll(
      async () => {
        await page.clock.runFor(250);
        return lockHeading(page).count();
      },
      { timeout: 20_000, intervals: [100, 250, 500] },
    )
    .toBeGreaterThan(0);
  await expect(lockHeading(page)).toBeVisible();
}

/** Avança o tempo virtual em passos de 2 s até a condição valer (o aviso do bloqueio some em 5 s: não dá para passar direto). */
async function idleUntil(page: Page, done: () => Promise<boolean>, maxMs = 8 * MIN) {
  for (let elapsed = 0; elapsed < maxMs; elapsed += 2_000) {
    if (await done()) return;
    await page.clock.runFor(2_000);
  }
  expect(await done(), 'o app deveria ter bloqueado por inatividade').toBe(true);
}

async function expectNoSecretsStored(page: Page) {
  const dump = await dumpIndexedDb(page);
  expect(dump).not.toContain(GOOD_SECRET);
  expect(dump).not.toContain(CLIENT_ID);
  expect(dump).not.toContain(PASS);
  const web = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(web).not.toContain(GOOD_SECRET);
  expect(web).not.toContain(PASS);
  expect(page.url()).not.toContain(GOOD_SECRET);
}

test.describe('Auto-bloqueio: atividade real adia o bloqueio', () => {
  for (const activity of ['mover o mouse', 'rolar a página', 'focar um campo'] as const) {
    test(`${activity} a cada minuto mantém o app aberto além do limite de 5 min; parado, bloqueia e o desbloqueio pede SÓ a senha`, async ({ page }) => {
      await page.clock.install();
      await mockPluggy(page);
      await setupReal(page);
      await setAutoLock(page, '5');
      await page.evaluate(() => (location.hash = '#/dashboard'));
      await expect(page.locator('#page-title')).toHaveText('Dashboard');
      await freezeClock(page);

      for (let i = 1; i <= 12; i++) {
        await page.clock.runFor(MIN);
        if (activity === 'mover o mouse') await page.mouse.move(120 + i * 7, 240 + i * 3);
        else if (activity === 'rolar a página') await page.evaluate(() => document.dispatchEvent(new Event('scroll', { bubbles: true })));
        else await page.evaluate((n) => {
          // focusin só dispara quando o foco MUDA: alterna entre dois controles.
          const els = Array.from(document.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')).slice(0, 2);
          els[n % els.length]?.focus();
        }, i);
      }
      // 12 min de uso "só olhando" (limite de 5): continua desbloqueado.
      await expect(lockHeading(page)).toHaveCount(0);
      await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00');

      // Parou de usar: passa do limite e bloqueia.
      await page.clock.runFor(6 * MIN);
      await expectLocked(page);
      await page.clock.resume();

      // O relogin é só a senha local: Client ID/Secret continuam guardados.
      await expect(page.locator('input[name="clientId"]')).toHaveCount(0);
      await unlock(page);
      await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
      await expectNoSecretsStored(page);
    });
  }

  test('sem nenhuma atividade o bloqueio acontece, e só depois do limite', async ({ page }) => {
    await page.clock.install();
    await mockPluggy(page);
    await setupReal(page);
    await setAutoLock(page, '5');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    await freezeClock(page);
    await page.clock.runFor(4 * MIN);
    await expect(lockHeading(page)).toHaveCount(0);
    await page.clock.runFor(2 * MIN);
    await expectLocked(page);
  });

  test('"Nunca" não bloqueia, mesmo depois de horas parado', async ({ page }) => {
    await page.clock.install();
    await mockPluggy(page);
    await setupReal(page);
    await setAutoLock(page, '0');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    await freezeClock(page);
    await page.clock.runFor(5 * 60 * MIN);
    await expect(lockHeading(page)).toHaveCount(0);
  });
});

test.describe('Auto-bloqueio: aba em segundo plano (visibilitychange)', () => {
  async function setVisibility(page: Page, state: 'hidden' | 'visible') {
    await page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  }

  test('voltar para a aba DEPOIS do prazo bloqueia na hora (não espera o timer de 15 s)', async ({ page }) => {
    await page.clock.install();
    await mockPluggy(page);
    await setupReal(page);
    await setAutoLock(page, '5');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    const now = await freezeClock(page);

    await setVisibility(page, 'hidden');
    await page.clock.setSystemTime(now + 30 * MIN); // segundo plano: o relógio anda, os timers não rodam
    await expect(lockHeading(page)).toHaveCount(0);
    await setVisibility(page, 'visible');
    await expect(lockHeading(page)).toBeVisible({ timeout: 2_000 });
  });

  test('voltar para a aba ANTES do prazo não bloqueia', async ({ page }) => {
    await page.clock.install();
    await mockPluggy(page);
    await setupReal(page);
    await setAutoLock(page, '5');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    const now = await freezeClock(page);

    await setVisibility(page, 'hidden');
    await page.clock.setSystemTime(now + 2 * MIN);
    await setVisibility(page, 'visible');
    await page.mouse.move(300, 300);
    await expect(lockHeading(page)).toHaveCount(0);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00');
  });
});

test.describe('Recarregar e abrir outra aba', () => {
  test('recarregar pede SÓ a senha local: credenciais e dados persistem e nada vai em texto puro', async ({ page, context }) => {
    await mockPluggy(page);
    await setupReal(page);
    await page.reload();
    await expect(lockHeading(page)).toBeVisible();
    await expect(page.locator('input[name="clientId"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Começar', exact: false })).toHaveCount(0);

    // Uma segunda aba do mesmo navegador também chega na tela de senha — e não no onboarding.
    const second = await context.newPage();
    await quietGithub(second);
    await second.goto('/');
    await expect(lockHeading(second)).toBeVisible();
    await expect(second.locator('input[name="clientId"]')).toHaveCount(0);
    await second.close();

    await unlock(page);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    const dump = await dumpIndexedDb(page);
    expect(dump).toContain('"credentials"');
    expect(dump).toContain('"vault"');
    await expectNoSecretsStored(page);
  });

  test('senha errada não apaga nada: a senha certa ainda abre tudo', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await page.reload();
    for (let i = 0; i < 3; i++) {
      await unlock(page, `senha-errada-${i}-xyz`);
      await expect(page.getByText('Senha local incorreta.')).toBeVisible({ timeout: 15_000 });
    }
    await unlock(page);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
  });
});

test.describe('Erros transitórios não apagam credenciais nem forçam relogin', () => {
  const failures = [
    { name: 'rede fora do ar', title: 'Sem conexão', handle: (r: import('@playwright/test').Route) => r.abort('failed') },
    { name: 'Pluggy instável (503)', title: 'Instabilidade na Pluggy', handle: (r: import('@playwright/test').Route) => r.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"code":503}' }) },
  ];

  for (const f of failures) {
    test(`${f.name} ao atualizar: mostra o erro, segue no app e, recarregando, a senha local basta`, async ({ page }) => {
      await mockPluggy(page);
      await setupReal(page);

      await page.route('https://api.pluggy.ai/**', (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
        return f.handle(route);
      });
      await page.locator('button[data-action="sync"]:visible').first().click();
      await expect(page.getByText(f.title).first()).toBeVisible({ timeout: 20_000 });
      // Continua no app: nem tela de senha, nem onboarding.
      await expect(lockHeading(page)).toHaveCount(0);
      await expect(page.locator('#page-title')).toBeVisible();
      await expect(page.locator('input[name="clientSecret"]')).toHaveCount(0);

      // Depois de recarregar, só a senha local: as credenciais sobreviveram.
      await page.unroute('https://api.pluggy.ai/**');
      await mockPluggy(page);
      await page.reload();
      await expect(lockHeading(page)).toBeVisible();
      await unlock(page);
      await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
      await expect(page.locator('input[name="clientSecret"]')).toHaveCount(0);
    });
  }

  test('Pluggy recusa a autenticação (401) ao testar a conexão: avisa, mas não apaga as credenciais salvas', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await page.route('https://api.pluggy.ai/auth', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fallback()
        : route.fulfill({ status: 401, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"code":401,"codeDescription":"CLIENT_KEYS_UNAUTHORIZED","message":"client keys are invalid"}' }),
    );
    // "Atualizar agora" reaproveitaria o apiKey ainda válido; "Testar conexão" refaz o POST /auth de verdade.
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    await page.locator('button[data-action="test"]').click();
    await expect(page.getByText('Credenciais inválidas').first()).toBeVisible({ timeout: 20_000 });
    await expect(lockHeading(page)).toHaveCount(0);
    await expect(page.locator('input[name="clientSecret"]')).toHaveCount(0);

    await page.unroute('https://api.pluggy.ai/auth');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    await page.reload();
    await unlock(page);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    expect(await dumpIndexedDb(page)).toContain('"credentials"');
  });
});

test.describe('Modo sessão × modo persistente', () => {
  test('modo sessão: nada é gravado; recarregar volta ao início (por desenho)', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page, { session: true });
    const dump = await dumpIndexedDb(page);
    expect(dump).not.toContain('"credentials"');
    expect(dump).not.toContain('"vault"');
    await expectNoSecretsStored(page);
    await page.reload();
    await expect(lockHeading(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Começar', exact: false }).first()).toBeVisible();
  });

  test('modo sessão + inatividade: encerra a sessão e o aviso diz a verdade (credenciais descartadas da memória)', async ({ page }) => {
    await page.clock.install();
    await mockPluggy(page);
    await setupReal(page, { session: true });
    await setAutoLock(page, '5');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    await freezeClock(page);

    await idleUntil(page, async () => (await page.getByText('Sessão encerrada').count()) > 0);
    await expect(page.getByText('Sessão encerrada')).toBeVisible();
    await expect(page.getByText(/credenciais foram descartadas/)).toBeVisible();
    await expect(page.getByText(/continuam cifrados/)).toHaveCount(0);
    await expect(lockHeading(page)).toHaveCount(0); // não há cofre a desbloquear
    await page.clock.resume();
    const dump = await dumpIndexedDb(page);
    expect(dump).not.toContain('"credentials"');
    expect(dump).not.toContain(GOOD_SECRET);
  });

  test('modo com senha + inatividade: aviso "dados continuam cifrados" e nada é apagado', async ({ page }) => {
    await page.clock.install();
    await mockPluggy(page);
    await setupReal(page);
    await setAutoLock(page, '5');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    await freezeClock(page);
    await idleUntil(page, async () => (await lockHeading(page).count()) > 0);
    await expect(lockHeading(page)).toBeVisible();
    await expect(page.getByText(/continuam cifrados/)).toBeVisible();
    await page.clock.resume();
    expect(await dumpIndexedDb(page)).toContain('"credentials"');
  });
});

test.describe('IndexedDB instável na abertura (as credenciais "somem")', () => {
  /** Faz as N primeiras aberturas do banco `cashflow` falharem em cada carregamento da página. */
  async function failFirstOpens(page: Page, n: number) {
    await page.addInitScript((failures) => {
      const original = IDBFactory.prototype.open;
      let left = failures;
      IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
        if (name === 'cashflow' && left > 0) {
          left--;
          const req: { error?: unknown; onerror?: () => void } = {};
          setTimeout(() => {
            req.error = new DOMException('Connection to Indexed Database server lost', 'UnknownError');
            req.onerror?.();
          }, 0);
          return req as unknown as IDBOpenDBRequest;
        }
        return original.call(this, name, version);
      };
    }, n);
  }

  test('falha passageira (2 tentativas) ao abrir: o app acha o cofre e pede só a senha — não o onboarding', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await failFirstOpens(page, 2);
    await page.reload();
    await expect(lockHeading(page)).toBeVisible({ timeout: 15_000 });
    await unlock(page);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
  });

  test('falha persistente: avisa que o armazenamento está indisponível e, na próxima abertura, o cofre original continua lá', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await failFirstOpens(page, 99);
    await page.reload();
    await expect(page.getByText('Armazenamento local indisponível')).toBeVisible({ timeout: 20_000 });

    // Nada foi apagado: sem a falha, o cofre de sempre abre com a senha de sempre.
    const fresh = await page.context().newPage();
    await quietGithub(fresh);
    await fresh.goto('/');
    await expect(lockHeading(fresh)).toBeVisible({ timeout: 15_000 });
    await unlock(fresh);
    await expect(fresh.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
  });
});

test.describe('Armazenamento persistente (navigator.storage.persist)', () => {
  async function spyPersist(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { __persistCalls: number };
      w.__persistCalls = 0;
      const storage = navigator.storage;
      if (!storage?.persist) return;
      const original = storage.persist.bind(storage);
      storage.persist = async () => {
        w.__persistCalls++;
        return original();
      };
    });
  }
  const calls = (page: Page) => page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls);

  test('pede persistência ao salvar as credenciais e ao desbloquear (modo senha)', async ({ page }) => {
    await spyPersist(page);
    await mockPluggy(page);
    await setupReal(page);
    await expect.poll(() => calls(page)).toBeGreaterThan(0);

    await page.reload(); // o contador zera a cada carregamento
    expect(await calls(page)).toBe(0);
    await unlock(page);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    await expect.poll(() => calls(page)).toBeGreaterThan(0);
  });

  test('modo sessão não pede (nada é gravado)', async ({ page }) => {
    await spyPersist(page);
    await mockPluggy(page);
    await setupReal(page, { session: true });
    expect(await calls(page)).toBe(0);
  });
});

test.describe('Fase 2 — credenciais boas nunca são sobrescritas (M5)', () => {
  async function openChangeCredentials(page: Page) {
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    await page.locator('button[data-action="edit-credentials"]').click();
    await expect(page.locator('.modal input[name="clientId"]')).toBeVisible();
  }

  test('Secret errado em "Trocar credenciais": a Pluggy recusa, o modal avisa e o Secret BOM continua funcionando', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await openChangeCredentials(page);
    await page.locator('.modal input[name="clientId"]').fill(CLIENT_ID);
    await page.locator('.modal input[name="clientSecret"]').fill('segredo-com-erro-de-digitacao');
    await page.getByRole('button', { name: 'Testar e salvar' }).click();
    await expect(page.locator('.modal [data-err]')).toContainText('A Pluggy recusou o Client ID/Client Secret', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // O que estava salvo ainda autentica (o mock só aceita o Secret BOM) — nada de redigitar credenciais.
    await page.locator('button[data-action="test"]').click();
    await expect(page.getByText('Conexão com a Pluggy funcionando').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Credenciais inválidas')).toHaveCount(0);

    // E continua assim depois de recarregar: só a senha local.
    await page.evaluate(() => (location.hash = '#/dashboard'));
    await page.reload();
    await unlock(page);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    await expect(page.locator('input[name="clientSecret"]')).toHaveCount(0);
    await expectNoSecretsStored(page);
  });

  test('trocar por credenciais válidas continua funcionando', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await openChangeCredentials(page);
    await page.locator('.modal input[name="clientId"]').fill(CLIENT_ID);
    await page.locator('.modal input[name="clientSecret"]').fill(GOOD_SECRET);
    await page.getByRole('button', { name: 'Testar e salvar' }).click();
    await expect(page.getByText('Credenciais salvas').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Fase 2 — cofre tem precedência sobre o demo salvo (M6)', () => {
  test('com credenciais salvas, abrir o demo e recarregar volta para a tela de senha (nada "sumiu")', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await page.getByRole('button', { name: 'Menu do usuário' }).click();
    await page.getByRole('menuitem', { name: 'Bloquear agora' }).click();
    await expect(lockHeading(page)).toBeVisible();

    await page.getByRole('button', { name: 'Ver demonstração' }).click();
    await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();

    await page.reload();
    await expect(lockHeading(page)).toBeVisible();
    await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toHaveCount(0);
    await unlock(page);
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
  });

  test('sem cofre, o demo salvo continua abrindo o demo', async ({ page }) => {
    await quietGithub(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Começar no modo demonstração' }).click();
    await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
    await expect(lockHeading(page)).toHaveCount(0);
  });
});

test.describe('Fase 2 — dica do bloqueio automático em Configurações → Conta', () => {
  test('mostra a orientação, as 5 opções e o padrão de 15 minutos', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    const conta = page.locator('#set-conta');
    await expect(conta).toContainText('mouse, rolagem e digitação contam como uso');
    await expect(conta).toContainText('30 ou 60 minutos');
    await expect(conta).toContainText('Economia de memória');
    await expect(conta).toContainText('Abas inativas');

    const select = page.locator('select[data-change="autolock"]');
    await expect(select).toHaveValue('15');
    expect(await select.locator('option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))).toEqual(['5', '15', '30', '60', '0']);
  });
});

test.describe('Fase 2b — bloquear numa aba bloqueia as outras (só o sinal; cada aba pede a própria senha)', () => {
  /** Registra tudo que o app posta em BroadcastChannel (para provar que só `{ type: "lock" }` atravessa). */
  async function spyBroadcast(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { __bc: unknown[] };
      w.__bc = [];
      const original = BroadcastChannel.prototype.postMessage;
      BroadcastChannel.prototype.postMessage = function (this: BroadcastChannel, message: unknown) {
        w.__bc.push(JSON.parse(JSON.stringify(message)));
        return original.call(this, message);
      };
    });
  }
  const sent = (page: Page) => page.evaluate(() => (window as unknown as { __bc: unknown[] }).__bc);

  async function secondTab(page: Page): Promise<Page> {
    const other = await page.context().newPage();
    await spyBroadcast(other);
    await quietGithub(other);
    await mockPluggy(other);
    await other.goto('/');
    await expect(lockHeading(other)).toBeVisible();
    await unlock(other);
    await expect(other.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    return other;
  }

  test('"Bloquear agora" numa aba → a outra mostra "Desbloquear o CashFlow"; só um sinal { type: "lock" } foi enviado', async ({ page }) => {
    await spyBroadcast(page);
    await mockPluggy(page);
    await setupReal(page);
    const other = await secondTab(page);

    await page.getByRole('button', { name: 'Menu do usuário' }).click();
    await page.getByRole('menuitem', { name: 'Bloquear agora' }).click();
    await expect(lockHeading(page)).toBeVisible();
    await expect(lockHeading(other)).toBeVisible({ timeout: 5_000 });
    await expect(other.getByText('Cofre bloqueado').first()).toBeVisible();

    expect(await sent(page)).toEqual([{ type: 'lock' }]);
    expect(await sent(other)).toEqual([]); // a aba que recebeu não retransmite (sem laço)
  });

  test('cada aba pede a PRÓPRIA senha: desbloquear uma não destranca a outra', async ({ page }) => {
    await spyBroadcast(page);
    await mockPluggy(page);
    await setupReal(page);
    const other = await secondTab(page);

    await page.getByRole('button', { name: 'Menu do usuário' }).click();
    await page.getByRole('menuitem', { name: 'Bloquear agora' }).click();
    await expect(lockHeading(other)).toBeVisible({ timeout: 5_000 });

    await unlock(other, 'senha-errada-123-xyz');
    await expect(other.getByText('Senha local incorreta.')).toBeVisible({ timeout: 15_000 });
    await unlock(other);
    await expect(other.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    await expect(lockHeading(page)).toBeVisible(); // a primeira continua bloqueada
  });

  test('bloqueio por inatividade de uma aba NÃO bloqueia a outra', async ({ page }) => {
    await page.clock.install();
    await spyBroadcast(page);
    await mockPluggy(page);
    await setupReal(page);
    await setAutoLock(page, '5');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    const other = await secondTab(page);
    await setAutoLock(other, '0'); // a aba em uso nunca trava sozinha; a primeira (5 min na memória) é a "esquecida"
    await other.evaluate(() => (location.hash = '#/dashboard'));
    await freezeClock(page);
    await idleUntil(page, async () => (await lockHeading(page).count()) > 0);
    await expect(lockHeading(page)).toBeVisible();
    await page.clock.resume();
    await expect(lockHeading(other)).toHaveCount(0);
    expect(await sent(page)).toEqual([]);
  });

  test('o sinal não leva nada além de { type: "lock" } (nenhuma chave, senha ou Secret no canal)', async ({ page }) => {
    await spyBroadcast(page);
    await mockPluggy(page);
    await setupReal(page);
    await page.getByRole('button', { name: 'Menu do usuário' }).click();
    await page.getByRole('menuitem', { name: 'Bloquear agora' }).click();
    await expect(lockHeading(page)).toBeVisible();
    const wire = JSON.stringify(await sent(page));
    expect(wire).toBe('[{"type":"lock"}]');
    for (const secret of [GOOD_SECRET, CLIENT_ID, PASS]) expect(wire).not.toContain(secret);
  });
});
