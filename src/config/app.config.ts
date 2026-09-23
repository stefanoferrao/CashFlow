/**
 * Configuração central do CashFlow. Nenhuma credencial vive aqui — nunca.
 */
export const APP_CONFIG = {
  name: 'CashFlow',
  version: '1.0.0',

  pluggy: {
    /** Endpoint oficial da API (docs.pluggy.ai → Basic Concepts). */
    directBaseUrl: 'https://api.pluggy.ai',
    /** Caminho do proxy local opcional (vite.config.ts) — só existe em `npm run dev`/`npm run preview`. */
    proxyBaseUrl: '/pluggy-api',
    /** Script oficial do Pluggy Connect (versão fixa, usada no quickstart oficial `pluggyai/quickstart`). */
    connectScriptUrl: 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js',
    /** Renova o apiKey (válido por 2 h) quando faltar menos que isto para expirar. */
    apiKeyRenewMarginMs: 5 * 60 * 1000,
    /** Timeout por requisição (igual ao SDK oficial). */
    requestTimeoutMs: 30_000,
    /** Máximo de requisições simultâneas (limites são por IP/minuto). */
    maxConcurrency: 3,
    /** Tentativas extras em 429/5xx. */
    maxRetries: 2,
    /** Histórico de transações: a Pluggy disponibiliza até 12 meses. */
    transactionsHistoryDays: 365,
    /** Janela para frente (parcelas futuras e lançamentos agendados). */
    transactionsFutureDays: 400,
    /** Tempo máximo aguardando um Item terminar de sincronizar após o Connect (LOGIN pode levar ~5 min). */
    itemPollTimeoutMs: 6 * 60 * 1000,
    itemPollIntervalMs: 4_000,
    /** Conector MeuPluggy (não aceita PATCH /items). */
    meuPluggyConnectorId: 200,
  },

  security: {
    /** PBKDF2-SHA256 — recomendação OWASP (2023+) para SHA-256. */
    pbkdf2Iterations: 600_000,
    minPassphraseLength: 8,
    /** Bloqueio automático por inatividade (minutos). 0 = nunca. */
    defaultAutoLockMinutes: 15,
  },

  cache: {
    /** Após este tempo os dados locais são considerados desatualizados e o app sincroniza ao desbloquear. */
    defaultTtlHours: 6,
    categoriesTtlHours: 24 * 7,
  },

  ui: {
    defaultPageSize: 25,
    searchDebounceMs: 150,
  },

  /** Moeda base para totais. Contas em outras moedas são exibidas à parte (sem conversão inventada). */
  baseCurrency: 'BRL',
} as const;

export type ApiMode = 'direct' | 'proxy';
