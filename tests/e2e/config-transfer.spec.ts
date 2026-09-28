/**
 * E2E: exportar/importar as personalizações (Configurações → Segurança) entre computador e celular, e a barra superior
 * no estilo de app nativo. Nunca entram credenciais nem dados de segurança. API da Pluggy simulada.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { CLIENT_ID, GOOD_SECRET, ITEM_ID, mockPluggy } from './pluggy-mock';

const PASS = 'Minha-Senha-Local-2026';
const ACCOUNT = 'acc-mock-1';
const CARD = 'card-mock-1';

/** Onboarding real até o dashboard; a busca automática traz o Item (Banco Mock). */
async function setupApp(page: Page) {
  await mockPluggy(page, { listItems: 'enabled' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar', exact: false }).first().click();
  await page.locator('input[name="clientId"]').fill(CLIENT_ID);
  await page.locator('input[name="clientSecret"]').fill(GOOD_SECRET);
  await page.locator('input[name="pass1"]').fill(PASS);
  await page.locator('input[name="pass2"]').fill(PASS);
  await page.getByRole('button', { name: 'Testar conexão e salvar' }).click();
  await expect(page.locator('[data-discovery="added"]')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
  await expect(page.locator('#page-title')).toHaveText('Dashboard');
  // A atualização de entrada no app pode começar depois do dashboard aparecer: espera os dados e a tela de carregamento saírem.
  await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 30_000 });
  await expect(page.locator('.splash--sync')).toHaveCount(0, { timeout: 15_000 });
}

async function goSettings(page: Page) {
  await page.evaluate(() => (location.hash = '#/configuracoes'));
  await expect(page.locator('#set-seguranca')).toBeAttached();
}

async function newDevice(browser: Browser, kind: 'desktop' | 'mobile'): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(
    kind === 'desktop'
      ? { viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', locale: 'pt-BR', permissions: ['clipboard-read', 'clipboard-write'] }
      : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'pt-BR' },
  );
  return { ctx, page: await ctx.newPage() };
}

/** Personaliza no computador: dashboard, datas dos cartões, nomes e aparência. */
async function customize(page: Page) {
  // Organização do dashboard: Patrimônio mais largo e "Saldo em contas" oculto.
  await page.getByRole('button', { name: 'Personalizar' }).click();
  const item = page.locator('.grid-stack-item[gs-id="patrimonio"]');
  await item.getByRole('button', { name: 'Aumentar a largura de Patrimônio' }).click();
  await expect(item).toHaveAttribute('gs-w', '6');
  await page.getByRole('button', { name: 'Ocultar Saldo em contas' }).click();
  await expect(page.locator('[data-widget="saldo"]')).toHaveCount(0);

  await goSettings(page);
  // Datas de fechamento e vencimento do cartão.
  await page.locator(`select[data-change="card-cycle"][data-card="${CARD}"][data-kind="closing"]`).selectOption('25');
  await page.locator(`select[data-change="card-cycle"][data-card="${CARD}"][data-kind="due"]`).selectOption('5');
  await expect(page.getByText('Datas do cartão salvas')).toBeVisible();
  // Nome e cor da instituição, nomes da conta e do cartão.
  await page.locator('#set-pluggy [data-action="edit-identity"]').click();
  const dlg = page.locator('.modal');
  await dlg.locator('input[name="ident-name"]').fill('Banco da Família');
  await dlg.locator('label[title="Laranja"]').click();
  await dlg.locator(`[data-nick="${ACCOUNT}"]`).fill('Conta do salário');
  await dlg.locator(`[data-nick="${CARD}"]`).fill('Cartão da casa');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Personalização salva')).toBeVisible();
}

test.describe('Exportar e importar personalizações', () => {
  test('computador → celular: nomes, aparência, datas dos cartões e dashboard; sem credenciais', async ({ browser }, testInfo) => {
    // ---------- computador: personaliza e exporta
    const desktop = await newDevice(browser, 'desktop');
    await setupApp(desktop.page);
    await customize(desktop.page);

    const [download] = await Promise.all([desktop.page.waitForEvent('download'), desktop.page.getByRole('button', { name: 'Exportar arquivo' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^cashflow-personalizacoes-\d{4}-\d{2}-\d{2}\.json$/);
    // Guarda o arquivo fora da pasta temporária do navegador (ela é apagada quando o contexto fecha).
    const path = testInfo.outputPath('personalizacoes.json');
    await download.saveAs(path);
    await expect(desktop.page.getByText('Personalizações exportadas')).toBeVisible();

    // "Copiar" entrega o mesmo conteúdo do arquivo como texto: é por ele que se confere o que foi exportado.
    await desktop.page.getByRole('button', { name: 'Copiar' }).click();
    await expect(desktop.page.getByText('Personalizações copiadas')).toBeVisible();
    const text = await desktop.page.evaluate(() => navigator.clipboard.readText());
    const file = JSON.parse(text);
    expect(file.labels.nicknames).toMatchObject({ [ACCOUNT]: 'Conta do salário', [CARD]: 'Cartão da casa' });
    expect(file.labels.cardCycles[CARD]).toEqual({ closingDay: 25, dueDay: 5 });
    expect(file.labels.identities[ITEM_ID]).toMatchObject({ name: 'Banco da Família', color: '#FF7A00' });
    expect(file.dashboardLayout.widgets.find((w: { id: string }) => w.id === 'patrimonio')).toMatchObject({ w: 6 });
    expect(file.dashboardLayout.widgets.find((w: { id: string }) => w.id === 'saldo')).toMatchObject({ visible: false });
    // Nada de login, API ou segurança no arquivo.
    for (const secret of [CLIENT_ID, GOOD_SECRET, PASS, 'clientSecret', 'apiKey', 'autoLock', 'apiMode', 'passphrase']) {
      expect(text, `o arquivo não pode conter "${secret}"`).not.toContain(secret);
    }
    await desktop.ctx.close();

    // ---------- celular: aparelho novo, só com a conta conectada
    const mobile = await newDevice(browser, 'mobile');
    await setupApp(mobile.page);
    await goSettings(mobile.page);
    await mobile.page.locator('input[data-change="import"]').setInputFiles(path);

    const dialog = mobile.page.locator('.modal');
    await expect(dialog.getByRole('heading', { name: 'Importar personalizações' })).toBeVisible();
    const summary = dialog.locator('[data-config-summary]');
    await expect(summary).toContainText('Nomes de 2 contas e cartões');
    await expect(summary).toContainText('Fechamento e vencimento de 1 cartão');
    await expect(summary).toContainText('Nome, cor e logo de 1 instituição');
    await expect(summary).toContainText('Organização do dashboard');
    await expect(dialog.getByText('Credenciais, senha local e dados de conexão nunca são importados.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Importar' }).click();
    await expect(mobile.page.getByText('Personalizações importadas')).toBeVisible();

    // Datas dos cartões, nome da instituição e nomes das contas/cartões chegaram.
    await expect(mobile.page.locator(`select[data-change="card-cycle"][data-card="${CARD}"][data-kind="closing"]`)).toHaveValue('25');
    await expect(mobile.page.locator(`select[data-change="card-cycle"][data-card="${CARD}"][data-kind="due"]`)).toHaveValue('5');
    await expect(mobile.page.locator('#set-pluggy .list-item__title')).toHaveText('Banco da Família');
    await mobile.page.evaluate(() => (location.hash = '#/contas'));
    await expect(mobile.page.getByText('Conta do salário').first()).toBeVisible();
    // Dashboard: o card oculto no computador também some no celular.
    await mobile.page.evaluate(() => (location.hash = '#/dashboard'));
    await expect(mobile.page.locator('[data-widget="patrimonio"]')).toBeVisible();
    await expect(mobile.page.locator('[data-widget="saldo"]')).toHaveCount(0);
    // As credenciais continuam as deste aparelho.
    await goSettings(mobile.page);
    await expect(mobile.page.locator('#set-pluggy')).toContainText('aaaaaaaa…eeee');
    await mobile.ctx.close();
  });

  test('colar o texto copiado importa; texto inválido mostra erro sem fechar', async ({ browser }) => {
    const { ctx, page } = await newDevice(browser, 'mobile');
    await setupApp(page);
    await goSettings(page);
    await page.getByRole('button', { name: 'Colar' }).click();
    const dlg = page.locator('.modal');
    await dlg.locator('[data-config-text]').fill('isto não é uma configuração');
    await dlg.getByRole('button', { name: 'Continuar' }).click();
    await expect(dlg.locator('[data-config-error]')).toContainText('não é um JSON');
    await expect(dlg.getByRole('heading', { name: 'Colar personalizações' })).toBeVisible();

    const cfg = { app: 'cashflow', kind: 'visual-config', version: 2, labels: { nicknames: { [CARD]: 'Cartão do texto' }, cardCycles: { [CARD]: { closingDay: 12, dueDay: 20 } } } };
    await dlg.locator('[data-config-text]').fill(JSON.stringify(cfg));
    await dlg.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Importar' }).click();
    await expect(page.getByText('Personalizações importadas')).toBeVisible();
    await expect(page.locator(`select[data-change="card-cycle"][data-card="${CARD}"][data-kind="closing"]`)).toHaveValue('12');
    await ctx.close();
  });

  test('arquivo com login, API e segurança: só as personalizações entram e o resto é ignorado', async ({ browser }) => {
    const { ctx, page } = await newDevice(browser, 'mobile');
    await setupApp(page);
    await goSettings(page);
    const before = await page.locator('select[data-change="autolock"]').inputValue();

    const hostile = {
      app: 'cashflow',
      kind: 'visual-config',
      version: 2,
      clientId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      clientSecret: 'segredo-do-arquivo',
      credentials: { clientId: 'x', clientSecret: 'y' },
      apiKey: 'jwt.falso',
      itemIds: ['00000000-0000-4000-8000-000000000000'],
      preferences: { hideValues: false, autoLockMinutes: 0, apiMode: 'proxy', includeSandbox: true, debug: true },
      labels: { nicknames: { [CARD]: 'Só isto entra' } },
    };
    await page.getByRole('button', { name: 'Colar' }).click();
    await page.locator('.modal').locator('[data-config-text]').fill(JSON.stringify(hostile));
    await page.locator('.modal').getByRole('button', { name: 'Continuar' }).click();
    const dialog = page.locator('.modal');
    await expect(dialog.locator('[data-config-ignored]')).toContainText('clientSecret');
    await expect(dialog.locator('[data-config-ignored]')).toContainText('apiKey');
    await expect(dialog.locator('[data-config-ignored]')).toContainText('preferences.autoLockMinutes');
    await dialog.getByRole('button', { name: 'Importar' }).click();
    await expect(page.getByText('Personalizações importadas')).toBeVisible();

    // Nada de segurança mudou: mesmo Client ID, mesmo bloqueio automático, mesmo modo de conexão, mesmos Items.
    await expect(page.locator('#set-pluggy')).toContainText('aaaaaaaa…eeee');
    await expect(page.locator('#set-pluggy')).not.toContainText('ffffffff');
    await expect(page.locator('select[data-change="autolock"]')).toHaveValue(before);
    await expect(page.locator('[data-action="api-mode"][aria-pressed="true"], [data-action="api-mode"][aria-checked="true"]').first()).toContainText('Direto');
    await expect(page.locator('#set-pluggy .list-item')).toHaveCount(1);
    await expect(page.locator('[data-change="sandbox"]')).not.toBeChecked();
    await ctx.close();
  });

  test('arquivo que não é do CashFlow é recusado', async ({ browser }) => {
    const { ctx, page } = await newDevice(browser, 'desktop');
    await setupApp(page);
    await goSettings(page);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['{"app":"outro"}'], 'x.json', { type: 'application/json' }));
      const input = document.querySelector<HTMLInputElement>('input[data-change="import"]')!;
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.getByText('Não foi possível importar')).toBeVisible();
    await expect(page.getByText('não é uma configuração do CashFlow')).toBeVisible();
    await ctx.close();
  });
});

test.describe('Configurações: controles de preferência', () => {
  test('ocultar valores, bloqueio automático e datas do cartão funcionam (usam data-change)', async ({ browser }) => {
    const { ctx, page } = await newDevice(browser, 'desktop');
    await setupApp(page);
    await goSettings(page);

    await page.locator('input[data-change="hide-values"]').check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-hide-values', 'true');

    await page.locator('select[data-change="autolock"]').selectOption('30');
    await expect(page.locator('select[data-change="autolock"]')).toHaveValue('30');

    await page.locator(`select[data-change="card-cycle"][data-card="${CARD}"][data-kind="closing"]`).selectOption('12');
    await expect(page.getByText('Datas do cartão salvas')).toBeVisible();
    await expect(page.locator(`select[data-change="card-cycle"][data-card="${CARD}"][data-kind="closing"]`)).toHaveValue('12');
    await ctx.close();
  });
});

test.describe('Barra superior no estilo de app nativo', () => {
  async function demo(page: Page) {
    await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 503, body: '' }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Começar no modo demonstração' }).click();
    await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
  }

  test('fica fixa ao rolar, com fundo sólido e filete só quando há conteúdo por baixo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await demo(page);
    const bar = page.locator('.topbar');
    await expect(bar).not.toHaveClass(/is-scrolled/);
    await page.mouse.wheel(0, 700);
    await expect(bar).toHaveClass(/is-scrolled/);
    expect(await bar.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
    // Sólida (sem "vidro" translúcido) e igual ao fundo do app.
    const style = await bar.evaluate((el) => ({ bar: getComputedStyle(el).backgroundColor, body: getComputedStyle(document.body).backgroundColor, blur: getComputedStyle(el).backdropFilter }));
    expect(style.bar).toBe(style.body);
    expect(['none', '']).toContain(style.blur);
  });

  test('celular: sem logo repetido, ícones com área de toque de 44px e tema no menu do usuário', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await demo(page);
    await expect(page.locator('.topbar .brand__mark')).toHaveCount(0);
    await expect(page.locator('.topbar [data-menu="theme"]')).toBeHidden();
    for (const b of await page.locator('.topbar__actions .icon-btn:visible').all()) {
      const box = (await b.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // O subtítulo (situação da atualização) aparece inteiro, sem reticências.
    const sub = page.locator('.topbar .sync-status .truncate');
    expect(await sub.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('[data-menu="user"]').click();
    await page.getByRole('menuitem', { name: 'Aparência e tema' }).click();
    await expect(page.locator('#set-aparencia')).toBeInViewport();
  });

  test('computador: botão de tema na barra e sem atalho duplicado no menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await demo(page);
    await expect(page.locator('.topbar [data-menu="theme"]')).toBeVisible();
    await page.locator('[data-menu="user"]').click();
    await expect(page.getByRole('menuitem', { name: 'Aparência e tema' })).toBeHidden();
  });
});
