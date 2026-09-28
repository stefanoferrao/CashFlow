/**
 * E2E: limite utilizado do cartão. Reproduz o caso de um Nubank via Meu Pluggy: limite de R$ 9.150,00, "disponível" da Pluggy
 * de R$ 4.725,97 (o que faria o uso parecer R$ 4.424,03 = 48,4%) e saldo do cartão de R$ 418,73. Em dados do Open Finance
 * (Meu Pluggy) o saldo é o limite utilizado; nos conectores diretos vale limite − disponível. API da Pluggy simulada.
 */
import { expect, test, type Page } from '@playwright/test';
import { CLIENT_ID, GOOD_SECRET, ITEM_ID, mockPluggy } from './pluggy-mock';

const PASS = 'Minha-Senha-Local-2026';
const CARD = { limit: 9150, available: 4725.97, balance: 418.73 };

async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar', exact: false }).first().click();
  await page.locator('input[name="clientId"]').fill(CLIENT_ID);
  await page.locator('input[name="clientSecret"]').fill(GOOD_SECRET);
  await page.locator('input[name="pass1"]').fill(PASS);
  await page.locator('input[name="pass2"]').fill(PASS);
  await page.getByRole('button', { name: 'Testar conexão e salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Conecte suas instituições.' })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="itemId"]').fill(ITEM_ID);
  await page.getByRole('button', { name: 'Adicionar Item' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir para o Dashboard' }).click();
  await expect(page.locator('[data-widget="saldo"]')).toContainText('R$ 10.000,00', { timeout: 30_000 });
  await expect(page.locator('.splash--sync')).toHaveCount(0, { timeout: 15_000 });
}

const detailValue = (page: Page, label: string) => page.locator('.detail-grid').first().locator('.detail', { hasText: label }).first();

test.describe('Limite utilizado do cartão', () => {
  test('Meu Pluggy: usa o saldo do cartão (Open Finance) e explica a diferença com o disponível da Pluggy', async ({ page }) => {
    await mockPluggy(page, { meuPluggy: true, card: CARD });
    await setup(page);
    await page.evaluate(() => (location.hash = '#/cartoes'));
    await expect(page.locator('article.card').first()).toBeVisible();

    // Antes da correção: utilizado R$ 4.424,03 (48,4%). Agora o saldo informado (R$ 418,73) é o limite utilizado.
    await expect(detailValue(page, 'Limite total')).toContainText('R$ 9.150,00');
    await expect(detailValue(page, 'Limite utilizado')).toContainText('R$ 418,73');
    await expect(detailValue(page, 'Limite disponível')).toContainText('R$ 8.731,27');
    await expect(detailValue(page, 'Percentual utilizado')).toContainText('4,6%');
    await expect(page.locator('article.card').first()).not.toContainText('R$ 4.424,03 ·');
    // A diferença fica visível, com os dois valores.
    const note = page.locator('[data-limit-note]').first();
    await expect(note).toContainText('R$ 4.725,97');
    await expect(note).toContainText('R$ 4.424,03');
    await expect(note).toContainText('R$ 418,73');

    // Totais da página e do dashboard usam o mesmo valor.
    await expect(page.locator('.figure', { hasText: 'Limite utilizado' }).first()).toContainText('R$ 418,73');
    await page.evaluate(() => (location.hash = '#/dashboard'));
    await expect(page.locator('[data-widget="cartoes"]')).toContainText('R$ 418,73');
    await expect(page.locator('[data-widget="cartoes"]')).not.toContainText('R$ 4.424,03');
  });

  test('conector direto: continua sendo limite − disponível, sem aviso', async ({ page }) => {
    await mockPluggy(page, { card: CARD, openFinance: false });
    await setup(page);
    await page.evaluate(() => (location.hash = '#/cartoes'));
    await expect(detailValue(page, 'Limite utilizado')).toContainText('R$ 4.424,03');
    await expect(detailValue(page, 'Limite disponível')).toContainText('R$ 4.725,97');
    await expect(page.locator('[data-limit-note]')).toHaveCount(0);
  });

  test('dados coerentes (saldo = limite − disponível): sem aviso', async ({ page }) => {
    await mockPluggy(page, { meuPluggy: true, card: { limit: 5000, available: 3500, balance: 1500 } });
    await setup(page);
    await page.evaluate(() => (location.hash = '#/cartoes'));
    await expect(detailValue(page, 'Limite utilizado')).toContainText('R$ 1.500,00');
    await expect(page.locator('[data-limit-note]')).toHaveCount(0);
  });
});
