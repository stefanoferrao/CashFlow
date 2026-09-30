/**
 * IndexedDB falso e mínimo (get/getAll/put/delete/clear/count) com roteiro de falhas na abertura.
 * NUNCA toca o IndexedDB real: os registros ficam num Map que o teste pode inspecionar.
 */
import { vi } from 'vitest';

type Handler = (() => void) | null;

export interface FakeReq {
  result?: unknown;
  error?: unknown;
  onsuccess: Handler;
  onerror: Handler;
  onblocked: Handler;
  onupgradeneeded: Handler;
}

/** O que a i-ésima chamada a `indexedDB.open()` faz (a última do roteiro se repete). */
export type OpenStep = 'error' | 'blocked' | 'throw' | 'security' | 'ok';

export type Backing = Map<string, Map<string, Record<string, unknown>>>;

/** Ganchos para simular falhas de gravação (disco cheio, cota): `put` pode lançar. */
export interface FakeDbHooks {
  put?: (store: string, record: Record<string, unknown>) => void;
}

export function fakeDb(backing: Backing, hooks: FakeDbHooks = {}) {
  const store = (name: string) => {
    if (!backing.has(name)) backing.set(name, new Map());
    return backing.get(name)!;
  };
  const request = (value: unknown) => {
    const r: FakeReq = { onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null, result: value };
    queueMicrotask(() => r.onsuccess?.());
    return r;
  };
  return {
    onversionchange: null as Handler,
    close() {},
    objectStoreNames: { contains: () => true },
    transaction(name: string) {
      const tx = { oncomplete: null as Handler, onabort: null as Handler, onerror: null as Handler, error: null as unknown };
      queueMicrotask(() => tx.oncomplete?.());
      return Object.assign(tx, {
        objectStore: () => ({
          get: (id: string) => request(store(name).get(id)),
          getAll: () => request([...store(name).values()]),
          count: () => request(store(name).size),
          put: (v: { id: string }) => {
            hooks.put?.(name, v);
            store(name).set(v.id, structuredClone(v));
          },
          delete: (id: string) => void store(name).delete(id),
          clear: () => void store(name).clear(),
        }),
      });
    },
  };
}

export function fakeIndexedDb(script: OpenStep[], backing: Backing = new Map(), hooks: FakeDbHooks = {}) {
  const open = vi.fn((_name: string, _version?: number): FakeReq => {
    const step = script[Math.min(open.mock.calls.length - 1, script.length - 1)]!;
    if (step === 'throw') throw new Error('boom');
    if (step === 'security') throw new DOMException('denied', 'SecurityError');
    const req: FakeReq = { onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
    queueMicrotask(() => {
      if (step === 'error') {
        req.error = new Error('UnknownError: Connection to Indexed Database server lost');
        req.onerror?.();
      } else if (step === 'blocked') {
        req.onblocked?.();
      } else {
        req.result = fakeDb(backing, hooks);
        req.onsuccess?.();
      }
    });
    return req;
  });
  return { open, backing };
}
