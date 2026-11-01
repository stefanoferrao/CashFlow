import { expect, test, type Page } from '@playwright/test';

async function startDemo(page: Page) {
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar no modo demonstração' }).click();
  await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
}

async function openAcademia(page: Page) {
  await page.goto('/#/transacoes');
  await page.locator('[data-filter="q"]').fill('ACADEMIA MOVIMENTO');
  await page.locator('[data-action="open-tx"]:visible').first().click();
  await expect(page.locator('.modal [data-cat-form]')).toBeVisible();
}

test.describe('Recategorizar por estabelecimento', () => {
  test('pergunta "só esta" ou "todas" e aplica a todas do estabelecimento', async ({ page }) => {
    await startDemo(page);
    await openAcademia(page);
    await page.locator('.modal [data-cat-form] select[name="category"]').selectOption('lazer');
    await page.locator('.modal [data-save]').click();
    await expect(page.getByRole('heading', { name: 'Aplicar a nova categoria' })).toBeVisible();
    await page.locator('.modal [data-choice="all"]').click();
    await expect(page.locator('.modal')).toHaveCount(0);
    const rows = page.locator('[data-action="open-tx"]:visible');
    expect(await rows.count()).toBeGreaterThan(1);
    for (const r of await rows.all()) await expect(r).toContainText('Lazer');
  });

  test('"só esta" muda uma transação só; cancelar não muda nada', async ({ page }) => {
    await startDemo(page);
    await openAcademia(page);
    await page.locator('.modal [data-cat-form] select[name="category"]').selectOption('lazer');
    await page.locator('.modal [data-save]').click();
    await page.getByRole('button', { name: 'Cancelar' }).last().click();
    // Cancelar volta para a transação, sem salvar.
    await expect(page.locator('.modal [data-cat-form]')).toBeVisible();
    await page.locator('.modal [data-save]').click();
    await page.locator('.modal [data-choice="one"]').click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('[data-action="open-tx"]:visible', { hasText: 'Lazer' })).toHaveCount(1);
  });

  test('Esc fecha só a pergunta; a transação continua aberta', async ({ page }) => {
    await startDemo(page);
    await openAcademia(page);
    await page.locator('.modal [data-cat-form] select[name="category"]').selectOption('lazer');
    await page.locator('.modal [data-save]').click();
    await expect(page.getByRole('heading', { name: 'Aplicar a nova categoria' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Aplicar a nova categoria' })).toHaveCount(0);
    await expect(page.locator('.modal [data-cat-form]')).toBeVisible();
  });

  test('"Remover regra" na transação desfaz o "Todas"', async ({ page }) => {
    await startDemo(page);
    await openAcademia(page);
    await page.locator('.modal [data-cat-form] select[name="category"]').selectOption('lazer');
    await page.locator('.modal [data-save]').click();
    await page.locator('.modal [data-choice="all"]').click();
    await page.locator('[data-action="open-tx"]:visible').first().click();
    await page.locator('.modal [data-remove-applied-rule]').click();
    await page.locator('.modal [data-confirm]').click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('[data-action="open-tx"]:visible', { hasText: 'Lazer' })).toHaveCount(0);
  });
});
