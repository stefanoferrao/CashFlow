import { expect, test, type Page } from '@playwright/test';
import { BAD_SECRET, CLIENT_ID, GOOD_SECRET, ITEM_ID, dumpIndexedDb, mockPluggy } from './pluggy-mock';

const PASS = 'Minha-Senha-Local-2026';

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar no modo demonstração' }).click();
  await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
}

async function fillCredentials(page: Page, clientId: string, secret: string) {
  await page.locator('input[name="clientId"]').fill(clientId);
  await page.locator('input[name="clientSecret"]').fill(secret);
  await page.locator('input[name="pass1"]').fill(PASS);
  await page.locator('input[name="pass2"]').fill(PASS);
  await page.getByRole('button', { name: 'Testar conexão e salvar' }).click();
}

async function setupReal(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar', exact: false }).first().click();
  await fillCredentials(page, CLIENT_ID, GOOD_SECRET);
  await expect(page.getByRole('heading', { name: 'Conecte suas instituições.' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Tema', () => {
  test('alterna claro/escuro e persiste somente a preferência de tema', async ({ page }) => {
    await startDemo(page);
    await page.getByRole('button', { name: /^Tema:/ }).click();
    await page.getByRole('menuitemradio', { name: 'Escuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('cashflow.theme'))).toBe('dark');
    await page.getByRole('button', { name: /^Tema:/ }).click();
    await page.getByRole('menuitemradio', { name: 'Claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('"Sistema" segue o prefers-color-scheme', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await ctx.close();
  });
});

test.describe('Dashboard (modo demonstração)', () => {
  test('mostra indicadores principais e dados claramente fictícios', async ({ page }) => {
    await startDemo(page);
    for (const t of ['Patrimônio líquido', 'Saldo em contas', 'Investimentos', 'Receitas × despesas', 'Para onde está indo meu dinheiro?', 'Limites dos cartões']) {
      await expect(page.getByText(t, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText('Dados fictícios — nada aqui é real nem é salvo.')).toBeVisible();
  });

  test('personalizar: ocultar card persiste e restaurar padrão volta', async ({ page }) => {
    await startDemo(page);
    await page.getByRole('button', { name: 'Personalizar' }).click();
    await page.getByRole('checkbox', { name: 'Saldo em contas' }).uncheck();
    await expect(page.locator('[data-widget="saldo"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-widget="patrimonio"]')).toBeVisible();
    await expect(page.locator('[data-widget="saldo"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Personalizar' }).click();
    await page.getByRole('button', { name: 'Restaurar padrão' }).click();
    await expect(page.locator('[data-widget="saldo"]')).toBeVisible();
  });

  test('gráficos têm alternativa em tabela', async ({ page }) => {
    await startDemo(page);
    await page.locator('[data-widget="fluxo"]').getByRole('button', { name: 'Tabela' }).click();
    await expect(page.locator('#dash-flow table')).toBeVisible();
  });
});

test.describe('Responsividade', () => {
  const widths = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
  const routes = ['dashboard', 'contas', 'cartoes', 'faturas', 'transacoes', 'investimentos', 'fluxo', 'analises', 'configuracoes', 'privacidade'];
  for (const w of widths) {
    test(`sem overflow horizontal em ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await startDemo(page);
      for (const r of routes) {
        await page.evaluate((route) => (location.hash = `#/${route}`), r);
        await page.waitForTimeout(350);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `overflow em #/${r} @${w}px`).toBeLessThanOrEqual(0);
      }
      if (w < 768) {
        await expect(page.locator('.bottom-nav')).toBeVisible();
        await expect(page.locator('.sidebar')).toBeHidden();
      } else {
        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.locator('.bottom-nav')).toBeHidden();
      }
    });
  }

  test('menu inferior "Mais" abre as seções secundárias no mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startDemo(page);
    await page.locator('.bottom-nav').getByRole('button', { name: 'Mais' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Investimentos' }).click();
    await expect(page.locator('#page-title')).toHaveText('Investimentos');
  });
});

test.describe('Conexão Pluggy (API simulada)', () => {
  test('valida formato, trata credencial inválida e conclui o fluxo', async ({ page }) => {
    const mock = await mockPluggy(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Começar', exact: false }).first().click();

    await fillCredentials(page, 'abc', GOOD_SECRET);
    await expect(page.getByText('O Client ID deve estar no formato UUID')).toBeVisible();
    expect(mock.authCalls).toBe(0);

    await fillCredentials(page, CLIENT_ID, BAD_SECRET);
    await expect(page.getByText('A Pluggy recusou o Client ID/Client Secret')).toBeVisible({ timeout: 15_000 });

    await fillCredentials(page, CLIENT_ID, GOOD_SECRET);
    await expect(page.getByRole('heading', { name: 'Conecte suas instituições.' })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[name="itemId"]').fill(ITEM_ID);
    await page.getByRole('button', { name: 'Adicionar Item' }).click();
    await expect(page.getByText('1 instituição(ões) adicionada(s)')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();

    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    await expect(page.locator('[data-widget="investimentos"]')).toContainText('R$ 20.000,00');
    // Paginação por cursor seguiu o `next` retornado pela API
    expect(mock.cursorCalls).toBeGreaterThan(0);
    expect(mock.requests.some((r) => r.includes('after=Y3Vyc29y%2BMQ%3D%3D'))).toBe(true);

    // Descrição maliciosa vinda do "banco" é exibida como texto (sem XSS)
    await page.evaluate(() => (location.hash = '#/transacoes'));
    await expect(page.getByText('<img src=x onerror="window.__xss=1">LOJA').first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('Client ID/Secret nunca ficam em texto puro nem são exibidos após salvos', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    const dump = await dumpIndexedDb(page);
    expect(dump).toContain('"credentials"');
    expect(dump).not.toContain(GOOD_SECRET);
    expect(dump).not.toContain(CLIENT_ID);
    expect(dump).not.toContain(PASS);
    const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(ls).not.toContain(GOOD_SECRET);
    expect(page.url()).not.toContain(GOOD_SECRET);
    await page.getByRole('button', { name: 'Fazer isso depois' }).click();
    await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    await expect(page.getByText('Salvo e cifrado — nunca é exibido.')).toBeVisible();
    expect(await page.content()).not.toContain(GOOD_SECRET);
  });

  test('bloqueio: senha errada é recusada; senha certa abre o cache cifrado', async ({ page }) => {
    const mock = await mockPluggy(page);
    await setupReal(page);
    await page.locator('input[name="itemId"]').fill(ITEM_ID);
    await page.getByRole('button', { name: 'Adicionar Item' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });

    await page.getByRole('button', { name: 'Menu do usuário' }).click();
    await page.getByRole('menuitem', { name: 'Bloquear agora' }).click();
    await expect(page.getByRole('heading', { name: 'Desbloquear o CashFlow' })).toBeVisible();

    await page.locator('input[name="passphrase"]').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page.getByText('Senha local incorreta.')).toBeVisible({ timeout: 15_000 });

    const before = mock.requests.length;
    await page.locator('input[name="passphrase"]').fill(PASS);
    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });
    // Cache ainda válido: nenhuma nova chamada à Pluggy foi necessária
    expect(mock.requests.length).toBe(before);
  });

  test('Item inexistente mostra erro amigável', async ({ page }) => {
    await mockPluggy(page, { itemStatus: 404 });
    await setupReal(page);
    await page.locator('input[name="itemId"]').fill(ITEM_ID);
    await page.getByRole('button', { name: 'Adicionar Item' }).click();
    await expect(page.getByText('O item solicitado não existe mais na Pluggy')).toBeVisible({ timeout: 15_000 });
  });

  test('bloqueio de CORS é identificado e explicado', async ({ page }) => {
    await page.route('https://api.pluggy.ai/**', (route) => {
      if (route.request().url() === 'https://api.pluggy.ai/') return route.fulfill({ status: 404, body: '' });
      return route.abort('failed');
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Começar', exact: false }).first().click();
    await fillCredentials(page, CLIENT_ID, GOOD_SECRET);
    await expect(page.getByText('O navegador bloqueou a chamada direta à API da Pluggy')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Identidade das instituições', () => {
  test('Meu Pluggy: identifica o banco, aplica em todo o app e a personalização persiste cifrada', async ({ page }) => {
    await mockPluggy(page, { meuPluggy: true });
    await setupReal(page);
    await page.locator('input[name="itemId"]').fill(ITEM_ID);
    await page.getByRole('button', { name: 'Adicionar Item' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
    await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 15_000 });

    // Contas: "MeuPluggy" vira "Nubank" (detectado pela razão social), com o logo da biblioteca local (sem terceiros)
    await page.evaluate(() => (location.hash = '#/contas'));
    const group = page.locator('.inst-group').first();
    await expect(group.locator('strong').first()).toHaveText('Nubank');
    await expect(group).toContainText('via Meu Pluggy');
    await expect(group).toContainText('Banco identificado automaticamente');
    await expect(group).toContainText('Na instituição: Nu Pagamentos S.A. - Instituição de Pagamento');
    const logo = group.locator('img[src="./banks/nubank.svg"]').first();
    await expect(logo).toBeAttached({ timeout: 10_000 });
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Cartões: nome do titular nunca aparece; sem datas → definir fechamento/vencimento
    await page.evaluate(() => (location.hash = '#/cartoes'));
    await expect(page.getByText('Mastercard Gold').first()).toBeVisible();
    expect(await page.content()).not.toContain('TITULAR M SILVA');
    await page.getByRole('button', { name: 'Definir os dias' }).click();
    const cycle = page.getByRole('dialog');
    await cycle.locator('[data-closing]').selectOption('10');
    await cycle.locator('[data-due]').selectOption('17');
    await cycle.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('definido por você').first()).toBeVisible();

    // Logo e nome: novo nome e cor valem em cartões e transações
    await page.getByRole('button', { name: 'Logo e nome' }).first().click();
    let dlg = page.getByRole('dialog');
    await expect(dlg.locator('[data-search]')).toBeFocused(); // aberto pelo cartão: já na galeria de logos
    await dlg.locator('input[name="ident-name"]').fill('Nubank PF');
    await dlg.locator('label[title="Laranja"]').click();
    await dlg.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('.cc__issuer')).toContainText('Nubank PF');
    expect(await page.locator('.cc').getAttribute('style')).toContain('#FF7A00');

    // Logo próprio do cartão (produto) escolhido na galeria local
    await page.getByRole('button', { name: 'Logo e nome' }).first().click();
    dlg = page.getByRole('dialog');
    await expect(dlg.locator('.logo-target[aria-checked="true"]')).toContainText('Mastercard Gold');
    await dlg.locator('[data-search]').fill('ultravioleta');
    await dlg.locator('[data-bank="nubankultravioleta"]').first().click();
    await expect(dlg.locator('.logo-target[aria-checked="true"]')).toContainText('Logo próprio');
    await dlg.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('.cc__issuer img[src="./banks/nubankultravioleta.svg"]')).toBeAttached();
    await expect(page.locator('.cc__issuer')).toContainText('Nubank PF');
    await page.evaluate(() => (location.hash = '#/transacoes'));
    await expect(page.locator('select[data-filter="institution"] option', { hasText: 'Nubank PF' })).toHaveCount(1);

    // Nada disso fica em texto puro no navegador
    const dump = await dumpIndexedDb(page);
    expect(dump).not.toContain('Nubank PF');

    // Bloquear e desbloquear: a personalização continua (cache cifrado)
    await page.getByRole('button', { name: 'Menu do usuário' }).click();
    await page.getByRole('menuitem', { name: 'Bloquear agora' }).click();
    await page.locator('input[name="passphrase"]').fill(PASS);
    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await page.evaluate(() => (location.hash = '#/cartoes'));
    await expect(page.locator('.cc__issuer')).toContainText('Nubank PF', { timeout: 15_000 });
    await expect(page.locator('.cc__issuer img[src="./banks/nubankultravioleta.svg"]')).toBeAttached();
    await expect(page.getByText('definido por você').first()).toBeVisible();
  });

  test('galeria de logos: escolher o banco na biblioteca local vale para a conexão e seus cartões', async ({ page }) => {
    await startDemo(page);
    await page.evaluate(() => (location.hash = '#/contas'));
    await page.getByRole('button', { name: 'Personalizar' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('[data-search]').fill('077'); // código COMPE do Inter
    await expect(dlg.locator('.logo-tile').first()).toContainText('Banco Inter');
    await dlg.locator('[data-bank="inter"]').click();
    await expect(dlg.locator('input[name="ident-name"]')).toHaveValue('Banco Inter');
    await dlg.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('.inst-group').first().locator('img[src="./banks/inter.svg"]').first()).toBeAttached();
    await page.evaluate(() => (location.hash = '#/cartoes'));
    await expect(page.locator('.cc__issuer').first()).toContainText('Banco Inter');
    expect(await page.locator('.cc').first().getAttribute('style')).toContain('#FF7A00');
  });

  test('demonstração: renomear instituição e conta reflete nas outras páginas', async ({ page }) => {
    await startDemo(page);
    await page.evaluate(() => (location.hash = '#/contas'));
    await page.getByRole('button', { name: 'Renomear Conta Corrente Aurora' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.locator('[data-nick="demo-acc-aurora"]')).toBeFocused();
    await dlg.locator('[data-nick="demo-acc-aurora"]').fill('Conta do salário');
    await dlg.locator('input[name="ident-name"]').fill('Aurora Pessoal');
    await dlg.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('.inst-group').first()).toContainText('Aurora Pessoal');
    await expect(page.locator('.inst-group').first()).toContainText('Conta do salário');
    await page.evaluate(() => (location.hash = '#/transacoes'));
    await page.getByRole('button', { name: 'Mais filtros' }).click();
    await expect(page.locator('select[data-filter="account"] option', { hasText: 'Aurora Pessoal · Conta do salário' })).toHaveCount(1);
  });
});

test.describe('Dados locais', () => {
  test('"Apagar todos os dados locais" remove tudo e volta ao início', async ({ page }) => {
    await mockPluggy(page);
    await setupReal(page);
    await page.getByRole('button', { name: 'Fazer isso depois' }).click();
    await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    await page.getByRole('button', { name: 'Apagar tudo' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-confirm-input]').fill('APAGAR');
    await dialog.getByRole('button', { name: 'Apagar tudo' }).click();
    await expect(page.getByRole('heading', { name: 'Tenha uma visão completa das suas finanças.' })).toBeVisible();
    const dump = await dumpIndexedDb(page);
    expect(dump).not.toContain('credentials');
    expect(await page.evaluate(() => localStorage.getItem('cashflow.theme'))).toBeNull();
  });
});

test.describe('Aplicativo (PWA)', () => {
  test.use({ serviceWorkers: 'allow' });

  test('instalável: manifesto, service worker e abertura sem internet', async ({ page, context }) => {
    await page.goto('/');
    test.skip((await page.locator('html').getAttribute('data-sw')) !== 'on', 'service worker só existe no build de produção');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.webmanifest');
    const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i: { purpose?: string; sizes: string }) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);

    await page.getByRole('button', { name: /demonstração/i }).first().click();
    await expect(page.locator('[data-widget="saldo"]')).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    // Sem internet, o app abre a partir do cache e nada da API da Pluggy é guardado.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#page-title')).toHaveText('Dashboard', { timeout: 15_000 });
    const cachedApi = await page.evaluate(async () => {
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/pluggy\.ai|pluggy-api/.test(r.url)) return true;
      return false;
    });
    expect(cachedApi).toBe(false);
    await context.setOffline(false);
  });
});
