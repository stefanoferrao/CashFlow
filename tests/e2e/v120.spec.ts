/**
 * E2E da versão 1.2.0: Pluggy Connect com conta já conectada, faturas somadas, personalização do dashboard,
 * dicas flutuantes, fluxo de caixa por período, rendimento dos investimentos, patrimônio ao longo do tempo
 * e Notas de Atualização. API da Pluggy e GitHub simulados — nenhum teste usa a internet.
 */
import { expect, test, type Page } from '@playwright/test';
import { CLIENT_ID, GOOD_SECRET, ITEM_ID, mockConnectWidget, mockPluggy } from './pluggy-mock';

const PASS = 'Minha-Senha-Local-2026';

const RELEASES = [
  {
    tag_name: '1.0.2',
    name: 'Notas de Atualização — v1.0.2',
    draft: false,
    prerelease: false,
    published_at: '2026-09-24T05:54:00Z',
    html_url: 'https://github.com/stefanoferrao/CashFlow/releases/tag/1.0.2',
    body: '# Notas de Atualização — v1.0.2\n\n## Novidades\n\n- **228 logos** de bancos\n- <img src=x onerror="window.__relxss=1"> [x](javascript:alert(1))',
  },
  { tag_name: '1.0.1', name: 'Notas de Atualização — v1.0.1', draft: false, prerelease: false, published_at: '2026-09-24T04:11:00Z', html_url: 'https://github.com/stefanoferrao/CashFlow/releases/tag/1.0.1', body: 'Correções.' },
];

async function startDemo(page: Page, opts: { github?: 'ok' | 'down' } = {}) {
  await page.route('https://api.github.com/**', (route) =>
    opts.github === 'ok'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(RELEASES) })
      : route.fulfill({ status: 503, body: '' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar no modo demonstração' }).click();
  await expect(page.getByText('MODO DEMONSTRAÇÃO', { exact: true })).toBeVisible();
}

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

test.describe('Pluggy Connect', () => {
  test('conta já conectada: reaproveita a conexão existente em vez de mostrar erro', async ({ page }) => {
    const mock = await mockPluggy(page);
    await mockConnectWidget(page, 'duplicate');
    await setupReal(page);
    await page.getByRole('button', { name: 'Abrir Pluggy Connect' }).click();
    await expect(page.getByText('Conexão existente reaproveitada')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('1 instituição(ões) adicionada(s)')).toBeVisible();
    // connect_token com identificador fixo do usuário e checagem de duplicidade da Pluggy
    const body = mock.connectTokenBodies[0] as { options: { clientUserId?: string; avoidDuplicates?: boolean; oauthRedirectUri?: string } };
    expect(body.options.avoidDuplicates).toBe(true);
    expect(body.options.clientUserId).toMatch(/^cashflow-[0-9a-f]{24}$/);
    expect(JSON.stringify(body)).not.toContain(CLIENT_ID);
    // Em http://localhost não há endereço de retorno (a Pluggy só aceita https).
    expect(body.options.oauthRedirectUri).toBeUndefined();
    expect(mock.requests.some((r) => r.startsWith(`GET /items/${ITEM_ID}`))).toBe(true);
  });

  test('erro genérico do widget mostra mensagem clara e não registra nada', async ({ page }) => {
    await mockPluggy(page);
    await mockConnectWidget(page, 'error');
    await setupReal(page);
    await page.getByRole('button', { name: 'Abrir Pluggy Connect' }).click();
    await expect(page.getByText('Conexão não concluída')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('instituição(ões) adicionada(s)')).toHaveCount(0);
  });
});

test.describe('Faturas somadas', () => {
  test('dashboard, cartões e faturas mostram o total de todos os cartões e o valor de cada um', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await startDemo(page);
    const fatura = page.locator('[data-widget="fatura"]');
    await expect(fatura).toContainText('Total a pagar nas próximas faturas');
    await expect(fatura.locator('.ob-row')).toHaveCount(2);
    await expect(fatura.locator('.ob__bar span')).toHaveCount(2);
    // O valor tem animação de contagem: espera o valor final (data-count) em vez de ler o texto no meio dela.
    const parseBRL = (t: string | null) => Number((t ?? '').replace(/[^\d,-]/g, '').replace(',', '.'));
    const totalEl = fatura.locator('.ob__head .money').first();
    const total = Number(await totalEl.getAttribute('data-count'));
    const rows = (await fatura.locator('.ob-row__value .money').allTextContents()).map(parseBRL);
    expect(Math.round(rows.reduce((s, v) => s + v, 0) * 100) / 100).toBeCloseTo(total, 2);
    await expect.poll(async () => parseBRL(await totalEl.textContent())).toBeCloseTo(total, 2);
    await page.evaluate(() => (location.hash = '#/cartoes'));
    await expect(page.locator('.kpi--accent')).toContainText('Próxima fatura (soma)');
    await expect.poll(async () => parseBRL(await page.locator('.kpi--accent .money').first().textContent())).toBeCloseTo(total, 2);
    await expect(page.getByText('Próxima fatura por cartão')).toBeVisible();
    await page.evaluate(() => (location.hash = '#/faturas'));
    await expect(page.getByText('Próxima fatura · todos os cartões')).toBeVisible();
    // A lista de cartões seleciona o detalhe
    const pick = page.locator('.ob-row--btn');
    await pick.nth(1).click();
    await expect(pick.nth(1)).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Dashboard · Personalizar', () => {
  test('barra de mover e botões de largura/altura, salvos no navegador', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await startDemo(page);
    await page.getByRole('button', { name: 'Personalizar' }).click();
    await expect(page.locator('.dash-edit__bar.is-draggable').first()).toBeVisible();
    await expect(page.getByText('Arraste por esta barra para mover').first()).toBeVisible();
    const item = page.locator('.grid-stack-item[gs-id="patrimonio"]');
    await expect(item.locator('[data-size-w]')).toHaveText('1/3');
    await item.getByRole('button', { name: 'Aumentar a largura de Patrimônio' }).click();
    await expect(item.locator('[data-size-w]')).toHaveText('1/2');
    await expect(item).toHaveAttribute('gs-w', '6');
    await item.getByRole('button', { name: 'Aumentar a altura de Patrimônio' }).click();
    await expect(item.locator('[data-size-h]')).toHaveText('6');
    await expect(item.locator('> .ui-resizable-se')).toBeVisible();
    await page.reload();
    await expect(page.locator('.grid-stack-item[gs-id="patrimonio"]')).toHaveAttribute('gs-w', '6');
    // Ocultar direto no card
    await page.getByRole('button', { name: 'Personalizar' }).click();
    await page.getByRole('button', { name: 'Ocultar Saldo em contas' }).click();
    await expect(page.locator('[data-widget="saldo"]')).toHaveCount(0);
  });

  test('mobile: setas no card reordenam', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startDemo(page);
    await page.getByRole('button', { name: 'Personalizar' }).click();
    const first = page.locator('.dash-flow__item').first();
    await expect(first.locator('[data-widget]')).toHaveAttribute('data-widget', 'patrimonio');
    await first.getByRole('button', { name: 'Mover Patrimônio para baixo' }).click();
    await expect(page.locator('.dash-flow__item').first().locator('[data-widget]')).toHaveAttribute('data-widget', 'saldo');
  });
});

test.describe('Dicas', () => {
  test('dica do "?" e do botão ocultar valores ficam inteiras dentro da tela', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await startDemo(page);
    await page.locator('[data-widget="patrimonio"] .info-tip').hover();
    const tip = page.locator('#cf-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Limite de cartão não é patrimônio');
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    await page.locator('[data-action="toggle-values"]').hover();
    await expect(tip).toHaveText('Ocultar valores');
    const btn = (await page.locator('[data-action="toggle-values"]').boundingBox())!;
    const t2 = (await tip.boundingBox())!;
    expect(t2.y).toBeGreaterThan(btn.y + btn.height - 1); // abaixo do botão, sem cobrir a faixa do topo
  });

  test('no toque, o "?" abre e fecha a dica', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startDemo(page);
    await page.locator('[data-widget="patrimonio"] .info-tip').click();
    await expect(page.locator('#cf-tooltip')).toBeVisible();
    await page.locator('[data-widget="patrimonio"] .info-tip').click();
    await expect(page.locator('#cf-tooltip')).toBeHidden();
  });
});

test.describe('Fluxo de Caixa', () => {
  test('períodos Mês, Trimestre, Ano e Todo o período com navegação', async ({ page }) => {
    await startDemo(page);
    await page.evaluate(() => (location.hash = '#/fluxo'));
    const group = page.getByRole('group', { name: 'Período', exact: true });
    await expect(group.getByRole('button', { name: 'Mês', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Dia', exact: true })).toHaveCount(0);
    await group.getByRole('button', { name: 'Trimestre' }).click();
    await expect(page.locator('.period-nav__label strong')).toContainText('trimestre');
    await page.getByRole('button', { name: 'Trimestre anterior' }).click();
    await expect(page.getByRole('button', { name: 'Voltar ao atual' })).toBeVisible();
    await group.getByRole('button', { name: 'Todo o período' }).click();
    await expect(page.locator('.period-nav__label strong')).toContainText('Todo o período');
    await expect(page.locator('canvas[data-chart="cf-main"]')).toBeAttached();
  });
});

test.describe('Investimentos e patrimônio', () => {
  test('rendimento calculado (aplicado × atual) e produtos sem base listados', async ({ page }) => {
    await startDemo(page);
    await page.evaluate(() => (location.hash = '#/investimentos'));
    const kpi = page.locator('.kpi--accent');
    await expect(kpi).toContainText('Rendimento acumulado');
    await expect(kpi).toContainText('+R$');
    await expect(page.getByText('Como o rendimento é calculado')).toBeVisible();
    await expect(page.locator('.tag-source', { hasText: 'movimentações' }).first()).toBeVisible();
    await page.getByText(/Produtos sem base de cálculo/).click();
    await expect(page.getByText('ETF Índice Brasil Amplo').last()).toBeVisible();
  });

  test('patrimônio ao longo do tempo: saldo reconstruído + registros, com tabela', async ({ page }) => {
    await startDemo(page);
    await page.evaluate(() => (location.hash = '#/analises'));
    await expect(page.locator('.card__title', { hasText: 'Patrimônio ao longo do tempo' })).toBeVisible();
    await expect(page.locator('canvas[data-chart="an-nw"]')).toBeAttached();
    await page.locator('#an-nw').locator('..').getByRole('button', { name: 'Tabela' }).first().click();
    await expect(page.locator('#an-nw table')).toContainText('Saldo em contas (reconstruído)');
    await expect(page.getByText('Por que investimentos e dívidas não são reconstruídos?')).toBeVisible();
  });
});

test.describe('Notas de Atualização', () => {
  test('lista as releases do GitHub com segurança e marca a versão atual', async ({ page }) => {
    await startDemo(page, { github: 'ok' });
    await page.evaluate(() => (location.hash = '#/novidades'));
    await expect(page.locator('#page-title')).toHaveText('Notas de Atualização');
    await expect(page.locator('.release').first()).toContainText('v1.2.0');
    await expect(page.locator('.release--current')).toContainText('Esta versão');
    await expect(page.locator('#v-1\\.0\\.2')).toContainText('228 logos');
    // corpo não confiável: nada executa, link javascript: não vira link
    expect(await page.evaluate(() => (window as unknown as { __relxss?: number }).__relxss)).toBeUndefined();
    await expect(page.locator('.release a[href^="javascript"]')).toHaveCount(0);
    // versão exibida em Configurações → Sobre
    await page.evaluate(() => (location.hash = '#/configuracoes'));
    await expect(page.getByText('CashFlow 1.2.0')).toBeVisible();
  });

  test('sem acesso ao GitHub mostra as notas desta versão embutidas no app', async ({ page }) => {
    await startDemo(page, { github: 'down' });
    await page.evaluate(() => (location.hash = '#/novidades'));
    await expect(page.locator('.callout--warn')).toBeVisible();
    await expect(page.locator('.release--current')).toContainText('Fatura atual de todos os cartões');
  });
});
