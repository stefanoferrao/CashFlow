/**
 * E2E: busca automática dos Items que já existem na conta Pluggy (Dashboard da Pluggy / Meu Pluggy) depois de conectar
 * a conta, com o "Tenho um Item ID" preservado, e a tela de carregamento em tela cheia do "Atualizar agora".
 * API da Pluggy simulada — nenhum teste usa a internet.
 */
import { expect, test, type Page } from '@playwright/test';
import { CLIENT_ID, GOOD_SECRET, ITEM_ID, mockPluggy } from './pluggy-mock';

const PASS = 'Minha-Senha-Local-2026';

/** Onboarding até o passo "Conecte suas instituições". */
async function connectAccount(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar', exact: false }).first().click();
  await page.locator('input[name="clientId"]').fill(CLIENT_ID);
  await page.locator('input[name="clientSecret"]').fill(GOOD_SECRET);
  await page.locator('input[name="pass1"]').fill(PASS);
  await page.locator('input[name="pass2"]').fill(PASS);
  await page.getByRole('button', { name: 'Testar conexão e salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Conecte suas instituições.' })).toBeVisible({ timeout: 15_000 });
}

async function enterDashboard(page: Page) {
  // Com Items o botão do passo 2 é "Continuar"; sem nenhum, "Fazer isso depois".
  await page.getByRole('button', { name: /^(Continuar|Fazer isso depois)/ }).click();
  await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
  await expect(page.locator('#page-title')).toHaveText('Dashboard');
}

async function startDemo(page: Page) {
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar no modo demonstração' }).click();
  await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
}

test.describe('Busca automática de Item ID', () => {
  test('listagem habilitada: adiciona sozinho os Items que já existem, sem o conector de teste', async ({ page }) => {
    const mock = await mockPluggy(page, { listItems: 'enabled' });
    await connectAccount(page);
    await expect(page.locator('[data-discovery="added"]')).toContainText('Encontramos 1 conexão');
    await expect(page.getByText('1 instituição(ões) adicionada(s)')).toBeVisible();
    await expect(page.getByText('Conexão encontrada na sua conta Pluggy')).toBeVisible();
    expect(mock.requests.some((r) => r.startsWith('GET /v2/items'))).toBe(true);
    // O "Tenho um Item ID" continua ao lado.
    await expect(page.getByText('Tenho um Item ID (Meu Pluggy)')).toBeVisible();
    await expect(page.locator('input[name="itemId"]')).toBeVisible();

    await enterDashboard(page);
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    // Só o Item real entrou; o do conector de teste (sandbox) ficou de fora.
    await expect(page.locator('#set-pluggy .list-item')).toHaveCount(1);
    await expect(page.locator('#set-pluggy .list-item')).toContainText('Banco Mock');
  });

  for (const [name, listItems] of [
    ['listagem não habilitada (403)', 'forbidden'],
    ['listagem inexistente (404)', undefined],
  ] as const) {
    test(`${name}: avisa sem erro e o Item ID manual continua funcionando`, async ({ page }) => {
      await mockPluggy(page, listItems ? { listItems } : {});
      await connectAccount(page);
      await expect(page.locator('[data-discovery="unavailable"]')).toBeVisible();
      await expect(page.getByText('1 instituição(ões) adicionada(s)')).toHaveCount(0);
      // Nada de erro vermelho nem aviso de falha: é um recurso opcional que não está ligado.
      await expect(page.locator('[role="alert"]')).toHaveCount(0);

      await page.locator('input[name="itemId"]').fill(ITEM_ID);
      await page.getByRole('button', { name: 'Adicionar Item' }).click();
      await expect(page.getByText('1 instituição(ões) adicionada(s)')).toBeVisible({ timeout: 15_000 });
    });
  }

  test('o que se digita no Item ID não some quando o resultado da busca chega', async ({ page }) => {
    await mockPluggy(page, { listItems: 'forbidden', delayMs: 600 });
    await connectAccount(page);
    const input = page.locator('input[name="itemId"]');
    await input.fill('4114bd90');
    await expect(page.locator('[data-discovery="unavailable"]')).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveValue('4114bd90');
    await expect(input).toBeFocused();
  });

  test('em "Adicionar instituição" o Item ID e a busca manual continuam disponíveis', async ({ page }) => {
    await mockPluggy(page, { listItems: 'forbidden' });
    await connectAccount(page);
    await enterDashboard(page);
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    await page.locator('#set-pluggy').getByRole('button', { name: 'Adicionar instituição' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Tenho um Item ID (Dashboard da Pluggy / Meu Pluggy)')).toBeVisible();
    await expect(dialog.getByText('Buscar automaticamente os Items da minha aplicação')).toBeVisible();
    await dialog.getByText('Buscar automaticamente os Items da minha aplicação').click();
    await dialog.getByRole('button', { name: 'Buscar Items' }).click();
    await expect(page.getByText('Busca automática indisponível')).toBeVisible();
  });
});

test.describe('Tela de carregamento do "Atualizar agora"', () => {
  test('computador: cobre a tela inteira enquanto atualiza e some sozinha', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await startDemo(page);
    await page.getByRole('button', { name: 'Atualizar agora' }).click();
    const overlay = page.locator('.splash--sync');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Atualizando seus dados');
    await expect(overlay).toContainText('Atualizando os dados de demonstração');
    expect(await overlay.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1280, height: 800 });
    // O app por baixo fica sem foco nem clique enquanto a tela está aberta.
    await expect(page.locator('#app')).toHaveJSProperty('inert', true);
    await expect(overlay).toHaveCount(0, { timeout: 8_000 });
    await expect(page.locator('#app')).toHaveJSProperty('inert', false);
  });

  test('celular: o botão de atualizar (ícone) também abre a tela cheia', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startDemo(page);
    await page.locator('button.show-mobile-only[data-action="sync"]').click();
    const overlay = page.locator('.splash--sync');
    await expect(overlay).toBeVisible();
    expect(await overlay.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    // Cobre também o menu inferior.
    const nav = (await page.locator('.bottom-nav').boundingBox())!;
    const ov = (await overlay.boundingBox())!;
    expect(nav.y + nav.height).toBeLessThanOrEqual(ov.y + ov.height);
    await expect(overlay).toHaveCount(0, { timeout: 8_000 });
  });

  test('Esc fecha a tela e a atualização continua', async ({ page }) => {
    await startDemo(page);
    await page.getByRole('button', { name: 'Atualizar agora' }).click();
    await expect(page.locator('.splash--sync')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.splash--sync')).toHaveCount(0, { timeout: 3_000 });
  });

  test('dados reais: mostra a etapa e permite "Continuar em segundo plano"', async ({ page }) => {
    const mock = await mockPluggy(page, { listItems: 'enabled' });
    await connectAccount(page);
    await enterDashboard(page);
    await expect(page.locator('[data-sync-status]')).not.toHaveAttribute('data-state', 'syncing', { timeout: 20_000 });
    await expect(page.locator('.splash--sync')).toHaveCount(0, { timeout: 5_000 });

    mock.delayMs = 700; // a Pluggy "demora": dá tempo de ver a tela
    await page.getByRole('button', { name: 'Atualizar agora' }).click();
    const overlay = page.locator('.splash--sync');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('[data-sync-hint]')).not.toBeEmpty();

    await overlay.getByRole('button', { name: 'Continuar em segundo plano' }).click();
    await expect(overlay).toHaveCount(0, { timeout: 3_000 });
    // A atualização segue por trás e o resultado aparece no aviso.
    await expect(page.locator('[data-sync-status]')).toHaveAttribute('data-state', 'syncing');
    await expect(page.getByText('Dados atualizados').first()).toBeVisible({ timeout: 30_000 });
    // Não reabre sozinha durante a mesma atualização.
    await expect(overlay).toHaveCount(0);
  });
});
