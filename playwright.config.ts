import { defineConfig, devices } from '@playwright/test';

/**
 * Testes E2E (tema, responsividade, dashboard, conexão, erros, armazenamento local, exclusão de dados).
 * Todas as chamadas à Pluggy são interceptadas com page.route() — nenhum teste usa credenciais reais.
 *
 * Por padrão sobe `npm run preview` (build de produção). Para apontar para outro servidor:
 *   E2E_BASE_URL=http://localhost:5173 npx playwright test
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
