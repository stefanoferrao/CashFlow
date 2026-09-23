/**
 * Erros da integração Pluggy → mensagens amigáveis em português.
 * Nunca exibimos stack trace, corpo de requisição ou credenciais.
 */
import { redactString } from '../security/redact';

export type PluggyErrorKind =
  | 'invalid_credentials'
  | 'token_expired'
  | 'forbidden'
  | 'not_found'
  | 'rate_limit'
  | 'timeout'
  | 'cors'
  | 'offline'
  | 'proxy_unavailable'
  | 'institution_unavailable'
  | 'institution_disconnected'
  | 'unavailable_data'
  | 'item_cannot_update'
  | 'server'
  | 'bad_request'
  | 'unknown';

export const FRIENDLY_MESSAGES: Record<PluggyErrorKind, { title: string; message: string }> = {
  invalid_credentials: {
    title: 'Credenciais inválidas',
    message: 'A Pluggy recusou o Client ID/Client Secret. Confira os valores no Dashboard da Pluggy (Aplicações) e tente novamente.',
  },
  token_expired: {
    title: 'Sessão expirada',
    message: 'O acesso temporário à Pluggy expirou. Tentamos renovar automaticamente — se persistir, clique em "Atualizar agora".',
  },
  forbidden: {
    title: 'Acesso não permitido',
    message: 'Sua aplicação Pluggy não tem permissão para este recurso (pode ser um recurso opcional do seu plano).',
  },
  not_found: {
    title: 'Não encontrado',
    message: 'O item solicitado não existe mais na Pluggy ou pertence a outra aplicação. Verifique o Item ID.',
  },
  rate_limit: {
    title: 'Muitas requisições',
    message: 'A Pluggy limitou temporariamente as requisições (limite por minuto). Aguarde cerca de 1 minuto e tente novamente.',
  },
  timeout: {
    title: 'Tempo esgotado',
    message: 'A Pluggy demorou demais para responder. Verifique sua conexão e tente novamente.',
  },
  cors: {
    title: 'Bloqueio do navegador (CORS)',
    message:
      'O navegador bloqueou a chamada direta à API da Pluggy. Rode o app com "npm run dev" ou "npm run preview" e ative Configurações → Pluggy → Modo de conexão → Proxy local.',
  },
  offline: {
    title: 'Sem conexão',
    message: 'Você parece estar offline. Os dados locais continuam disponíveis; sincronize quando a conexão voltar.',
  },
  proxy_unavailable: {
    title: 'Proxy local indisponível',
    message:
      'O modo "Proxy local" só funciona com o app aberto via "npm run dev" ou "npm run preview". Volte para o modo Direto em Configurações → Pluggy ou inicie o servidor local.',
  },
  institution_unavailable: {
    title: 'Instituição indisponível',
    message: 'A instituição financeira está instável ou em manutenção. A Pluggy tentará novamente; você também pode tentar mais tarde.',
  },
  institution_disconnected: {
    title: 'Instituição desconectada',
    message: 'A conexão com a instituição precisa ser refeita (login, consentimento expirado ou revogado). Use "Reconectar".',
  },
  unavailable_data: {
    title: 'Dados indisponíveis',
    message: 'A instituição não disponibilizou este dado para a Pluggy.',
  },
  item_cannot_update: {
    title: 'Atualização não permitida',
    message: 'Este item não aceita atualização manual (ex.: itens do Meu Pluggy são atualizados automaticamente pela própria Pluggy).',
  },
  server: {
    title: 'Instabilidade na Pluggy',
    message: 'A Pluggy retornou um erro interno ou está em manutenção. Tente novamente em alguns minutos.',
  },
  bad_request: {
    title: 'Requisição recusada',
    message: 'A Pluggy recusou a requisição. Se persistir, ative o modo de depuração em Configurações → Sobre.',
  },
  unknown: {
    title: 'Erro inesperado',
    message: 'Algo deu errado ao falar com a Pluggy. Tente novamente.',
  },
};

export class PluggyError extends Error {
  readonly kind: PluggyErrorKind;
  readonly status: number | null;
  readonly codeDescription: string | null;
  /** Detalhe técnico já redigido — apenas para depuração local. */
  readonly debugDetail: string | null;

  constructor(kind: PluggyErrorKind, opts: { status?: number | null; codeDescription?: string | null; debugDetail?: string | null } = {}) {
    super(FRIENDLY_MESSAGES[kind].message);
    this.name = 'PluggyError';
    this.kind = kind;
    this.status = opts.status ?? null;
    this.codeDescription = opts.codeDescription ?? null;
    this.debugDetail = opts.debugDetail ? redactString(opts.debugDetail) : null;
  }

  get title(): string {
    return FRIENDLY_MESSAGES[this.kind].title;
  }
}

/** Classifica uma resposta HTTP de erro da Pluggy. */
export function classifyHttpError(status: number, body: { codeDescription?: string; message?: string } | null, isAuthCall: boolean): PluggyErrorKind {
  const code = (body?.codeDescription ?? '').toUpperCase();
  const msg = (body?.message ?? '').toLowerCase();
  if (status === 401) return isAuthCall || code.includes('CLIENT_KEYS') ? 'invalid_credentials' : 'token_expired';
  // Verificado empiricamente (set/2026): apiKey ausente/inválido/expirado responde 403 API_KEY_MISSING_OR_INVALID.
  if (status === 403 && code === 'API_KEY_MISSING_OR_INVALID') return isAuthCall ? 'invalid_credentials' : 'token_expired';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status === 408) return 'timeout';
  if (status === 503 || status === 502 || status === 504 || status >= 500) return 'server';
  if (status === 409 && code === 'CONNECTOR_OFFLINE') return 'institution_unavailable';
  if (status === 400 || status === 409) {
    if (msg.includes("can't be updated") || msg.includes('cant be updated') || code.includes('UPDATES_DISABLED')) return 'item_cannot_update';
    if (code.includes('LOGIN') || code.includes('CONSECUTIVE')) return 'institution_disconnected';
    return 'bad_request';
  }
  return 'unknown';
}

/** Status de execução do Item → estado de sincronização e mensagem amigável. */
export function describeItemExecution(status: string, executionStatus: string, errorCode?: string | null): {
  state: 'syncing' | 'updated' | 'error' | 'action_required';
  message: string | null;
} {
  const exec = (executionStatus || '').toUpperCase();
  const st = (status || '').toUpperCase();
  const code = (errorCode || exec).toUpperCase();

  if (st === 'UPDATING' || st === 'MERGING' || /IN_PROGRESS$/.test(exec) || exec === 'CREATING' || exec === 'CREATED' || exec === 'MERGING') {
    return { state: 'syncing', message: null };
  }
  if (st === 'WAITING_USER_INPUT' || st === 'WAITING_USER_ACTION' || exec === 'USER_AUTHORIZATION_PENDING') {
    return { state: 'action_required', message: 'A instituição aguarda uma ação sua (MFA ou autorização). Use "Reconectar".' };
  }
  if (st === 'LOGIN_ERROR') {
    return { state: 'action_required', message: FRIENDLY_MESSAGES.institution_disconnected.message };
  }
  const disconnected = [
    'INVALID_CREDENTIALS',
    'INVALID_CREDENTIALS_MFA',
    'ACCOUNT_LOCKED',
    'ACCOUNT_NEEDS_ACTION',
    'ACCOUNT_CREDENTIALS_RESET',
    'USER_AUTHORIZATION_NOT_GRANTED',
    'USER_AUTHORIZATION_REVOKED',
    'USER_INPUT_TIMEOUT',
    'ALREADY_LOGGED_IN',
    'USER_NOT_SUPPORTED',
  ];
  if (disconnected.includes(code)) {
    return { state: 'action_required', message: FRIENDLY_MESSAGES.institution_disconnected.message };
  }
  if (['SITE_NOT_AVAILABLE', 'CONNECTION_ERROR'].includes(code)) {
    return { state: 'error', message: FRIENDLY_MESSAGES.institution_unavailable.message };
  }
  if (st === 'OUTDATED' || ['ERROR', 'MERGE_ERROR', 'UNEXPECTED_ERROR', 'CREATE_ERROR'].includes(exec)) {
    return { state: 'error', message: 'A última sincronização da Pluggy com a instituição falhou. Os dados exibidos podem estar desatualizados.' };
  }
  if (exec === 'PARTIAL_SUCCESS') {
    return { state: 'updated', message: 'Alguns produtos não foram coletados pela instituição na última sincronização.' };
  }
  return { state: 'updated', message: null };
}

export function toPluggyError(e: unknown): PluggyError {
  if (e instanceof PluggyError) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new PluggyError('timeout');
  return new PluggyError('unknown', { debugDetail: e instanceof Error ? e.message : String(e) });
}
