/**
 * E2E: instituições conectadas em Configurações no celular (a linha estourava o card e esticava a página, cortando o
 * menu inferior) e tela de carregamento em tela cheia. API da Pluggy simulada — nenhum teste usa a internet.
 */
import { expect, test, type Page } from '@playwright/test';
import { CLIENT_ID, GOOD_SECRET, mockConnectWidget, mockPluggy } from './pluggy-mock';

const PASS = 'Minha-Senha-Local-2026';
const WELCOME = 'Tenha uma visão completa das suas finanças.';

async function setupReal(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar', exact: false }).first().click();
  await page.locator('input[name="clientId"]').fill(CLIENT_ID);
  await page.locator('input[name="clientSecret"]').fill(GOOD_SECRET);
  await page.locator('input[name="pass1"]').fill(PASS);
  await page.locator('input[name="pass2"]').fill(PASS);
  await page.getByRole('button', { name: 'Testar conexão e salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Conecte suas instituições.' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Configurações no celular', () => {
  for (const width of [320, 360, 390]) {
    test(`instituições conectadas ficam dentro do card em ${width}px`, async ({ page }) => {
      await mockPluggy(page);
      await mockConnectWidget(page, 'success');
      await page.setViewportSize({ width, height: 780 });
      await setupReal(page);
      await page.getByRole('button', { name: 'Abrir Pluggy Connect' }).click();
      await expect(page.getByText('1 instituição(ões) adicionada(s)')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Continuar' }).click();
      await page.getByRole('button', { name: 'Ir para o Dashboard' }).click({ timeout: 20_000 });
      await page.evaluate(() => (location.hash = '#/configuracoes'));
      await expect(page.locator('#set-pluggy .list-item')).toHaveCount(1);

      // `overflow-x: clip` no html/body esconde o excesso de scrollWidth; por isso confere a geometria dos elementos.
      const beyondCard = await page.evaluate(() => {
        const card = document.querySelector('#set-pluggy')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('#set-pluggy .setting-row--stack, #set-pluggy .setting-row--stack *')]
          .filter((el) => el.getBoundingClientRect().right > card.right + 1)
          .map((el) => `${el.tagName}.${String(el.className)}`);
      });
      expect(beyondCard, `elementos fora do card @${width}px`).toEqual([]);
      // Ações (personalizar/remover) ficam inteiras dentro da largura da tela.
      // (Numa só leitura: a página repinta quando a sincronização em segundo plano termina e recria o botão.)
      const edge = await page.evaluate(() => {
        const btn = document.querySelector('#set-pluggy [data-action="remove-item"]')!;
        btn.scrollIntoView({ block: 'center' });
        const r = btn.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      expect(edge.left).toBeGreaterThanOrEqual(0);
      expect(edge.right).toBeLessThanOrEqual(width);
      await expect(page.locator('.bottom-nav')).toBeVisible();
    });
  }

  test('um elemento largo demais não estica a janela nem corta o menu inferior', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'pt-BR' });
    const mobile = await ctx.newPage();
    await mobile.goto('/');
    await mobile.getByRole('button', { name: 'Começar no modo demonstração' }).click();
    await expect(mobile.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
    await mobile.evaluate(() => {
      const wide = document.createElement('div');
      wide.style.cssText = 'width:700px;height:20px';
      document.querySelector('.content')!.appendChild(wide);
    });
    const m = await mobile.evaluate(() => ({ inner: window.innerWidth, nav: document.querySelector('.bottom-nav')!.getBoundingClientRect().width }));
    expect(m.inner).toBe(360);
    expect(m.nav).toBe(360);
    await ctx.close();
  });
});

test.describe('Tela de carregamento', () => {
  test('aparece em tela cheia antes do app, some sozinha e o app fica por baixo', async ({ page }) => {
    // Segura o JavaScript principal: a tela precisa existir só com HTML + CSS (primeiro quadro).
    await page.route('**/assets/index-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'commit' });
    const splash = page.locator('#splash');
    await expect(splash).toBeVisible();
    await expect(splash).toContainText('CashFlow');
    expect(await splash.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    await expect(page.locator('#app')).toBeEmpty();

    await expect(page.getByRole('heading', { name: WELCOME })).toBeVisible({ timeout: 15_000 });
    await expect(splash).toHaveCount(0, { timeout: 5_000 });
  });

  test('segue o tema escuro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.route('**/assets/index-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#splash')).toBeVisible();
    const bg = await page.locator('#splash').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(15, 17, 21)');
  });

  test('ao reabrir o app no modo demonstração, entra pelo carregamento e chega ao dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Começar no modo demonstração' }).click();
    await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('#splash')).toBeVisible();
    await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 5_000 });
  });
});
