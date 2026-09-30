/**
 * Propaga o bloqueio MANUAL entre abas/janelas da mesma origem (BroadcastChannel).
 *
 * O canal carrega SOMENTE o sinal `{ type: 'lock' }`: nenhuma chave, DEK, senha, credencial ou dado financeiro trafega por ele.
 * Cada aba continua com a própria chave em memória e pedindo a própria senha; aqui só se avisa "bloqueie".
 * Lógica pura: o canal é injetável e a ausência de BroadcastChannel (navegador antigo) não gera erro.
 */

export const LOCK_CHANNEL_NAME = 'cashflow.lock';

export interface LockMessage {
  type: 'lock';
}

type MessageListener = (e: { data?: unknown }) => void;

export interface LockChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', fn: MessageListener): void;
  removeEventListener(type: 'message', fn: MessageListener): void;
  close(): void;
}

export interface LockSyncOptions {
  /** Outra aba bloqueou: quem recebe bloqueia sem retransmitir. */
  onPeerLock: () => void;
  createChannel?: (name: string) => LockChannelLike | null;
}

export interface LockSync {
  start(): void;
  stop(): void;
  broadcastLock(): void;
  isActive(): boolean;
}

/** Só `{ type: 'lock' }` exato vale; qualquer chave extra (ex.: algo que pareça uma chave) é descartada. */
export function isLockMessage(data: unknown): data is LockMessage {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const keys = Object.keys(data);
  return keys.length === 1 && keys[0] === 'type' && (data as { type?: unknown }).type === 'lock';
}

export function peerLockNotice(): { title: string; message: string } {
  return { title: 'Cofre bloqueado', message: 'Você bloqueou o CashFlow em outra aba ou janela. Digite a senha local para abrir esta também.' };
}

function defaultCreateChannel(name: string): LockChannelLike | null {
  try {
    return typeof BroadcastChannel === 'function' ? (new BroadcastChannel(name) as unknown as LockChannelLike) : null;
  } catch {
    return null;
  }
}

export function createLockSync(opts: LockSyncOptions): LockSync {
  let channel: LockChannelLike | null = null;
  let listener: MessageListener | null = null;

  const stop = (): void => {
    if (channel && listener) {
      try {
        channel.removeEventListener('message', listener);
      } catch {
        /* canal já inutilizável */
      }
    }
    try {
      channel?.close();
    } catch {
      /* ignorar */
    }
    channel = null;
    listener = null;
  };

  const start = (): void => {
    stop();
    let created: LockChannelLike | null = null;
    try {
      created = (opts.createChannel ?? defaultCreateChannel)(LOCK_CHANNEL_NAME);
    } catch {
      created = null;
    }
    if (!created) return;
    const onMessage: MessageListener = (e) => {
      if (isLockMessage(e.data)) opts.onPeerLock();
    };
    created.addEventListener('message', onMessage);
    channel = created;
    listener = onMessage;
  };

  const broadcastLock = (): void => {
    if (!channel) return;
    try {
      const msg: LockMessage = { type: 'lock' };
      channel.postMessage(msg);
    } catch {
      /* sem canal utilizável: o bloqueio local já aconteceu */
    }
  };

  return { start, stop, broadcastLock, isActive: () => channel !== null };
}
