/**
 * Cliente HTTP da API Pluggy, direto do navegador (sem backend próprio).
 *
 * - Autenticação: POST /auth → apiKey (JWT, 2 h). Mantido SOMENTE em memória, renovado antes de expirar.
 * - Todas as chamadas: header X-API-KEY.
 * - Limites: fila com concorrência máxima, deduplicação de GETs idênticos em andamento, respeito a Retry-After.
 * - Erros: convertidos em PluggyError com mensagem amigável (nunca stack trace/credenciais).
 */
import { APP_CONFIG } from '../config/app.config';
import { debugLog } from '../security/redact';
import type { PluggyCredentials } from '../security/vault';
import { ConcurrencyQueue, sleep } from '../utils/async';
import { classifyHttpError, PluggyError } from './errors';
import type {
  CursorPageResponse,
  PageResponse,
  PluggyAccount,
  PluggyApiError,
  PluggyBill,
  PluggyCategory,
  PluggyConnector,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
  PluggyTransaction,
} from './types';

export type CredentialsProvider = <T>(fn: (c: PluggyCredentials) => Promise<T>) => Promise<T>;

export interface PluggyClientOptions {
  baseUrl: string;
  isProxy: boolean;
  credentials: CredentialsProvider;
  fetchImpl?: typeof fetch;
  /** Notificado quando a Pluggy pede para aguardar (429). */
  onRateLimited?: (waitSeconds: number) => void;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  /** Controle interno de tentativas. */
  attempt?: number;
  reauthed?: boolean;
}

/** Decodifica o `exp` (segundos) de um JWT sem validar assinatura (apenas para agendar a renovação). */
export function jwtExpiryMs(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class PluggyClient {
  private apiKey: string | null = null;
  private apiKeyExpiresAt = 0;
  private authInFlight: Promise<string> | null = null;
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly queue = new ConcurrencyQueue(APP_CONFIG.pluggy.maxConcurrency);
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: PluggyClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  get baseUrl(): string {
    return this.opts.baseUrl.replace(/\/$/, '');
  }

  /** Descarta o apiKey da memória (bloqueio, troca de credenciais, logout). */
  clearSession(): void {
    this.apiKey = null;
    this.apiKeyExpiresAt = 0;
    this.authInFlight = null;
    this.inflight.clear();
  }

  hasValidSession(): boolean {
    return !!this.apiKey && Date.now() < this.apiKeyExpiresAt - APP_CONFIG.pluggy.apiKeyRenewMarginMs;
  }

  /** Autentica (ou reaproveita o apiKey válido). */
  async authenticate(force = false): Promise<string> {
    if (!force && this.hasValidSession() && this.apiKey) return this.apiKey;
    if (this.authInFlight) return this.authInFlight;
    this.authInFlight = (async () => {
      const res = await this.opts.credentials((c) =>
        this.request<{ apiKey: string }>('/auth', {
          method: 'POST',
          auth: false,
          body: { clientId: c.clientId, clientSecret: c.clientSecret, nonExpiring: false },
        }),
      );
      if (!res || typeof res.apiKey !== 'string') throw new PluggyError('unknown', { debugDetail: 'Resposta de /auth sem apiKey' });
      this.apiKey = res.apiKey;
      // Documentação: o apiKey expira em 2 horas. Usa o `exp` do JWT quando disponível.
      this.apiKeyExpiresAt = jwtExpiryMs(res.apiKey) ?? Date.now() + 2 * 60 * 60 * 1000;
      debugLog('auth', 'apiKey obtido; expira em', new Date(this.apiKeyExpiresAt).toISOString());
      return res.apiKey;
    })();
    try {
      return await this.authInFlight;
    } finally {
      this.authInFlight = null;
    }
  }

  /** GET com deduplicação de chamadas idênticas em andamento. */
  get<T>(path: string): Promise<T> {
    const key = `GET ${path}`;
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = this.request<T>(path).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, auth = true, attempt = 0, reauthed = false } = options;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers['X-API-KEY'] = await this.authenticate();

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APP_CONFIG.pluggy.requestTimeoutMs);

    let response: Response;
    try {
      response = await this.queue.run(() =>
        this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        }),
      );
    } catch (e) {
      clearTimeout(timer);
      throw await this.classifyNetworkError(e);
    }
    clearTimeout(timer);
    debugLog('http', method, path.split('?')[0], response.status);

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new PluggyError('unknown', { status: response.status, debugDetail: 'Resposta não-JSON da Pluggy' });
      }
    }

    let errBody: PluggyApiError | null = null;
    try {
      errBody = (await response.json()) as PluggyApiError;
    } catch {
      errBody = null;
    }
    const isAuthCall = path === '/auth';
    const kind = classifyHttpError(response.status, errBody, isAuthCall);

    // apiKey expirado/revogado → renova uma única vez.
    if (kind === 'token_expired' && auth && !reauthed) {
      this.apiKey = null;
      this.apiKeyExpiresAt = 0;
      return this.request<T>(path, { ...options, reauthed: true });
    }

    // 429 e 5xx → nova tentativa com espera.
    const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
    if (retryable && attempt < APP_CONFIG.pluggy.maxRetries && method === 'GET') {
      let waitMs = 1000 * 2 ** attempt;
      if (response.status === 429) {
        const ra = Number(response.headers.get('Retry-After'));
        waitMs = (Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) : 60) * 1000;
        this.opts.onRateLimited?.(Math.round(waitMs / 1000));
      }
      await sleep(waitMs);
      return this.request<T>(path, { ...options, attempt: attempt + 1 });
    }

    throw new PluggyError(kind, {
      status: response.status,
      codeDescription: errBody?.codeDescription ?? null,
      debugDetail: `${method} ${path.split('?')[0]} → ${response.status} ${errBody?.codeDescription ?? ''} ${errBody?.message ?? ''}`,
    });
  }

  /**
   * `fetch` rejeita com TypeError tanto offline quanto por bloqueio de CORS.
   * Para diferenciar, faz uma sondagem `no-cors` (resposta opaca = servidor alcançável ⇒ CORS).
   */
  private async classifyNetworkError(e: unknown): Promise<PluggyError> {
    if (e instanceof DOMException && e.name === 'AbortError') return new PluggyError('timeout');
    if (e instanceof PluggyError) return e;
    const detail = e instanceof Error ? e.message : String(e);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return new PluggyError('offline', { debugDetail: detail });
    if (this.opts.isProxy) return new PluggyError('proxy_unavailable', { debugDetail: detail });
    try {
      await this.fetchImpl(`${this.baseUrl}/`, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' });
      return new PluggyError('cors', { debugDetail: detail });
    } catch {
      return new PluggyError('offline', { debugDetail: detail });
    }
  }

  // ------------------------------------------------------------------ endpoints

  /** Valida as credenciais (POST /auth) sem usar cache. */
  async testCredentials(): Promise<void> {
    this.clearSession();
    await this.authenticate(true);
  }

  getItem(itemId: string): Promise<PluggyItem> {
    return this.get<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);
  }

  /** GET /v2/items — recurso opt-in (precisa ser habilitado pelo suporte da Pluggy). */
  async listItems(): Promise<PluggyItem[]> {
    const out: PluggyItem[] = [];
    let path = '/v2/items';
    for (let guard = 0; guard < 50; guard++) {
      const page = await this.get<CursorPageResponse<PluggyItem>>(path);
      out.push(...(page.results ?? []));
      if (!page.next) break;
      path = buildNextPath('/v2/items', '', page.next);
    }
    return out;
  }

  async getAccounts(itemId: string): Promise<PluggyAccount[]> {
    return this.getAllPages<PluggyAccount>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  }

  /** GET /v2/transactions (cursor, 500 por página). O campo `next` é usado como veio. */
  async getAllTransactions(accountId: string, dateFrom: string, dateTo: string): Promise<PluggyTransaction[]> {
    const base = `accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}&dateTo=${dateTo}`;
    let path = `/v2/transactions?${base}`;
    const out: PluggyTransaction[] = [];
    for (let guard = 0; guard < 200; guard++) {
      const page = await this.get<CursorPageResponse<PluggyTransaction>>(path);
      out.push(...(page.results ?? []));
      if (!page.next) break;
      const nextPath = buildNextPath('/v2/transactions', base, page.next);
      if (nextPath === path) break;
      path = nextPath;
    }
    return out;
  }

  async getBills(accountId: string): Promise<PluggyBill[]> {
    return this.getAllPages<PluggyBill>(`/bills?accountId=${encodeURIComponent(accountId)}`);
  }

  async getInvestments(itemId: string): Promise<PluggyInvestment[]> {
    return this.getAllPages<PluggyInvestment>(`/investments?itemId=${encodeURIComponent(itemId)}&pageSize=500`);
  }

  async getCategories(): Promise<PluggyCategory[]> {
    return this.getAllPages<PluggyCategory>('/categories');
  }

  /** GET /connectors?countries=BR — catálogo de instituições (nome, logo e cor oficiais da Pluggy). */
  async getConnectors(onlyBrazil = true): Promise<PluggyConnector[]> {
    return this.getAllPages<PluggyConnector>(onlyBrazil ? '/connectors?countries=BR' : '/connectors');
  }

  /**
   * POST /connect_token — token de 30 min para o widget Pluggy Connect.
   * - `clientUserId`: identificador estável do usuário (a Pluggy agrupa os Items por ele e o usa na checagem de duplicidade).
   * - `avoidDuplicates`: a Pluggy recusa criar um Item repetido (mesmas credenciais) e devolve os IDs dos Items já existentes.
   * - `oauthRedirectUri`: para onde a Pluggy devolve o usuário depois da autorização no banco (Open Finance / Meu Pluggy).
   *   Só é aceita em https (nunca http/localhost).
   * - `itemId`: modo atualização de um Item existente (reconectar) — não cria outro.
   */
  async createConnectToken(opts: { itemId?: string; clientUserId?: string; oauthRedirectUri?: string; avoidDuplicates?: boolean } = {}): Promise<string> {
    const options: Record<string, string | boolean> = {};
    if (opts.clientUserId) options.clientUserId = opts.clientUserId;
    if (opts.avoidDuplicates !== false) options.avoidDuplicates = true;
    if (opts.oauthRedirectUri) options.oauthRedirectUri = opts.oauthRedirectUri;
    const body: { itemId?: string; options: Record<string, string | boolean> } = { options };
    if (opts.itemId) body.itemId = opts.itemId;
    const res = await this.request<{ accessToken: string }>('/connect_token', { method: 'POST', body });
    if (!res?.accessToken) throw new PluggyError('unknown', { debugDetail: 'connect_token sem accessToken' });
    return res.accessToken;
  }

  /** DELETE /items/{id} — exclui o Item na Pluggy (revoga o acesso desta aplicação aos dados daquela conexão). */
  async deleteItem(itemId: string): Promise<void> {
    await this.request<unknown>(`/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  }

  /** GET /investments/{id}/transactions — movimentações do produto (aplicações, resgates, rendimentos pagos, impostos). */
  async getInvestmentTransactions(investmentId: string): Promise<PluggyInvestmentTransaction[]> {
    return this.getAllPages<PluggyInvestmentTransaction>(`/investments/${encodeURIComponent(investmentId)}/transactions?pageSize=500`);
  }

  /** PATCH /items/{id} — pede à Pluggy uma nova coleta na instituição (limite: 20/min). */
  updateItem(itemId: string): Promise<PluggyItem> {
    return this.request<PluggyItem>(`/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: {} });
  }

  /** Paginação por número de página (endpoints legados): page, total, totalPages, results. */
  private async getAllPages<T>(basePath: string): Promise<T[]> {
    const sep = basePath.includes('?') ? '&' : '?';
    const first = await this.get<PageResponse<T> | T[]>(basePath);
    if (Array.isArray(first)) return first;
    const out: T[] = [...(first.results ?? [])];
    const totalPages = Math.min(first.totalPages ?? 1, 50);
    for (let page = 2; page <= totalPages; page++) {
      const next = await this.get<PageResponse<T>>(`${basePath}${sep}page=${page}`);
      if (!next.results?.length) break;
      out.push(...next.results);
    }
    return out;
  }
}

/**
 * Monta o caminho da próxima página a partir de `next` SEM recodificar o cursor.
 * Aceita URL absoluta, caminho com query ou apenas query string.
 */
export function buildNextPath(basePath: string, baseQuery: string, next: string): string {
  let q = next.trim();
  if (/^https?:\/\//i.test(q)) {
    const i = q.indexOf('?');
    q = i >= 0 ? q.slice(i) : '';
  } else if (q.startsWith('/')) {
    const i = q.indexOf('?');
    q = i >= 0 ? q.slice(i) : '';
  }
  if (q.startsWith('?')) q = q.slice(1);
  if (baseQuery) {
    const firstKey = baseQuery.split('=')[0];
    if (firstKey && !new RegExp(`(^|&)${firstKey}=`).test(q)) q = `${baseQuery}&${q}`;
  }
  return `${basePath}?${q}`;
}
