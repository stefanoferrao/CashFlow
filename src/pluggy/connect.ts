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
  onError?: (error: { message?: string; data?: { item?: PluggyItem } }) => void;
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
    s.referrerPolicy = 'no-referrer';
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
      onError: (err) => done({ status: 'error', message: err?.message, item: err?.data?.item }),
      onClose: () => done({ status: 'closed' }),
    };
    if (opts.updateItemId) options.updateItem = opts.updateItemId;
    const widget = new Ctor(options);
    widget.init();
  });
}
