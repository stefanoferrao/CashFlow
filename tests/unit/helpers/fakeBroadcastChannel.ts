/**
 * BroadcastChannel falso e síncrono em estrutura: várias "abas" (instâncias) compartilham um hub.
 * Entrega assíncrona (microtask) e NUNCA para o próprio canal que postou — como o BroadcastChannel real.
 * `posted` guarda tudo o que foi postado (valor original), para provar que nenhuma chave/senha/segredo trafega.
 */
import { vi } from 'vitest';

type Listener = (e: { data?: unknown }) => void;

export interface FakeHub {
  /** Tudo o que qualquer canal postou (na ordem). */
  posted: unknown[];
  /** Canais abertos (opcionalmente filtrando pelo nome). */
  openCount(name?: string): number;
  /** Quantos listeners 'message' existem somando os canais abertos. */
  listenerCount(): number;
  Channel: new (name: string) => FakeChannel;
}

export interface FakeChannel {
  readonly name: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'message', fn: Listener): void;
  removeEventListener(type: 'message', fn: Listener): void;
  close(): void;
  readonly closed: boolean;
}

export function createFakeHub(): FakeHub {
  const open = new Set<Chan>();
  const posted: unknown[] = [];

  class Chan implements FakeChannel {
    readonly listeners = new Set<Listener>();
    closed = false;
    constructor(readonly name: string) {
      open.add(this);
    }
    postMessage(message: unknown): void {
      if (this.closed) throw new DOMException('Channel is closed', 'InvalidStateError');
      posted.push(message);
      const data = structuredClone(message);
      for (const peer of open) {
        if (peer === this || peer.name !== this.name) continue;
        queueMicrotask(() => {
          if (peer.closed) return;
          for (const l of [...peer.listeners]) l({ data: structuredClone(data) });
        });
      }
    }
    addEventListener(type: 'message', fn: Listener): void {
      if (type === 'message') this.listeners.add(fn);
    }
    removeEventListener(type: 'message', fn: Listener): void {
      if (type === 'message') this.listeners.delete(fn);
    }
    close(): void {
      this.closed = true;
      this.listeners.clear();
      open.delete(this);
    }
  }

  return {
    posted,
    openCount: (name) => [...open].filter((c) => !name || c.name === name).length,
    listenerCount: () => [...open].reduce((n, c) => n + c.listeners.size, 0),
    Channel: Chan,
  };
}

/** Instala o hub como `BroadcastChannel` global (desfazer com vi.unstubAllGlobals()). */
export function installFakeBroadcastChannel(): FakeHub {
  const hub = createFakeHub();
  vi.stubGlobal('BroadcastChannel', hub.Channel);
  return hub;
}

/** Deixa as entregas (microtasks) do canal acontecerem. Não usa timers: funciona também com vi.useFakeTimers(). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
