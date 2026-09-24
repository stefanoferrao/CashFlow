/**
 * Pluggy Connect (widget oficial) — carregado SOB DEMANDA a partir do CDN oficial da Pluggy,
 * em versão fixa (ver APP_CONFIG.pluggy.connectScriptUrl). Uso conforme o quickstart oficial:
 *   new PluggyConnect({ connectToken, includeSandbox, onSuccess, onError }).init()
 */
import { APP_CONFIG } from '../config/app.config';
import type { PluggyItem } from './types';

interface PluggyConnectOptions {
  connectToken: string;
  includeSandbox?: boolean;
  updateItem?: string;
  language?: string;
  theme?: 'light' | 'dark';
  onSuccess?: (data: { item: PluggyItem }) => void;
  onError?: (error: { message?: string; data?: { item?: PluggyItem; items?: unknown } }) => void;
  onClose?: () => void;
  onOpen?: () => void;
  onEvent?: (payload: { event?: string }) => void;
}

interface PluggyConnectInstance {
  init(): unknown;
  destroy?(): unknown;
}

type PluggyConnectCtor = new (opts: PluggyConnectOptions) => PluggyConnectInstance;

let scriptPromise: Promise<PluggyConnectCtor> | null = null;

function getCtor(): PluggyConnectCtor | undefined {
  return (window as unknown as { PluggyConnect?: PluggyConnectCtor }).PluggyConnect;
}

export function loadPluggyConnect(url: string = APP_CONFIG.pluggy.connectScriptUrl): Promise<PluggyConnectCtor> {
  const existing = getCtor();
  if (existing) return Promise.resolve(existing);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<PluggyConnectCtor>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.referrerPolicy = 'strict-origin';
    s.onload = () => {
      const ctor = getCtor();
      if (ctor) resolve(ctor);
      else reject(new Error('O script do Pluggy Connect carregou, mas o widget não foi encontrado.'));
    };
    s.onerror = () => {
      scriptPromise = null;
      s.remove();
      reject(new Error('Não foi possível carregar o Pluggy Connect (cdn.pluggy.ai). Verifique sua conexão ou bloqueadores de conteúdo.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface ConnectResult {
  status: 'success' | 'closed' | 'error';
  item?: PluggyItem;
  message?: string;
  /** Detalhes do erro do widget (ex.: conexão repetida com os IDs dos Items que já existem). */
  error?: ConnectErrorInfo;
}

/**
 * Endereço de retorno após a autorização no banco (Open Finance / Meu Pluggy), exigido principalmente no celular,
 * onde a janela de autorização não consegue se fechar sozinha. A Pluggy só aceita https (nunca http/localhost),
 * então em desenvolvimento local nada é enviado.
 */
export function oauthRedirectUriFor(loc: { protocol: string; hostname: string; origin: string; pathname: string }): string | undefined {
  if (loc.protocol !== 'https:') return undefined;
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(loc.hostname) || loc.hostname.endsWith('.localhost')) return undefined;
  return `${loc.origin}${loc.pathname}`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export interface ConnectErrorInfo {
  message: string | null;
  /** Código técnico quando a Pluggy informa (ex.: ITEM_USER_ALREADY_EXISTS). */
  code: string | null;
  /** IDs de Items que já usam as mesmas credenciais (erro de duplicidade). */
  existingItemIds: string[];
  duplicate: boolean;
}

/**
 * Interpreta o erro entregue pelo Pluggy Connect em `onError`.
 * Com `avoidDuplicates`, uma conexão repetida chega como `{ message: 'ITEM_USER_ALREADY_EXISTS', data: { items: [ids] } }`
 * — o widget mostra só "Um erro inesperado ocorreu", mas os IDs das conexões existentes vêm no erro e são reaproveitados.
 */
export function parseConnectError(err: unknown): ConnectErrorInfo {
  const e = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>;
  const data = (e.data && typeof e.data === 'object' ? e.data : {}) as Record<string, unknown>;
  const message = typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : null;
  const codeCandidates = [e.code, e.codeDescription, data.code, data.codeDescription, message].filter((x): x is string => typeof x === 'string');
  const code = codeCandidates.find((c) => /^[A-Z][A-Z0-9_]{3,}$/.test(c)) ?? null;
  const ids = new Set<string>();
  const collect = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.match(UUID) ?? []) ids.add(m.toLowerCase());
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') collect((v as { id: string }).id);
  };
  collect(data.items);
  collect(data.itemIds);
  collect(e.items);
  const text = codeCandidates.join(' ');
  const duplicate = /ALREADY_EXISTS|DUPLICAT|ITEM_USER_ALREADY/i.test(text) || ids.size > 0;
  return { message, code, existingItemIds: [...ids], duplicate };
}

/** Abre o widget e resolve quando o usuário conclui, fecha ou ocorre erro. */
export async function openPluggyConnect(opts: {
  connectToken: string;
  includeSandbox: boolean;
  updateItemId?: string;
  theme: 'light' | 'dark';
}): Promise<ConnectResult> {
  const Ctor = await loadPluggyConnect();
  return new Promise<ConnectResult>((resolve) => {
    let settled = false;
    const done = (r: ConnectResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const options: PluggyConnectOptions = {
      connectToken: opts.connectToken,
      includeSandbox: opts.includeSandbox,
      language: 'pt',
      theme: opts.theme,
      onSuccess: (data) => done({ status: 'success', item: data?.item }),
      onError: (err) => {
        const info = parseConnectError(err);
        const item = err?.data?.item;
        done({ status: 'error', ...(info.message ? { message: info.message } : {}), ...(item ? { item } : {}), error: info });
      },
      onClose: () => done({ status: 'closed' }),
    };
    if (opts.updateItemId) options.updateItem = opts.updateItemId;
    const widget = new Ctor(options);
    widget.init();
  });
}
