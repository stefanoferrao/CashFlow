/**
 * Propagação do bloqueio entre abas — contrato do módulo src/security/lockChannel.ts (puro, com injeção de dependências).
 *
 * Decisão do usuário: SÓ o sinal de bloqueio atravessa as abas. Nenhuma chave (DEK), senha, credencial ou tempo trafega:
 * a mensagem é exatamente `{ type: 'lock' }` e cada aba continua pedindo a própria senha.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCK_CHANNEL_NAME, createLockSync, isLockMessage, peerLockNotice, type LockChannelLike } from '../../src/security/lockChannel';
import { createFakeHub, installFakeBroadcastChannel, settle } from './helpers/fakeBroadcastChannel';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('constantes e funções puras', () => {
  it('nome do canal', () => {
    expect(LOCK_CHANNEL_NAME).toBe('cashflow.lock');
  });

  it('isLockMessage: só objeto com EXATAMENTE a chave type === "lock"', () => {
    expect(isLockMessage({ type: 'lock' })).toBe(true);
    const rejected: unknown[] = [
      null,
      undefined,
      'lock',
      42,
      true,
      [],
      ['lock'],
      {},
      { type: 'key' },
      { type: 'LOCK' },
      { type: 'lock ' },
      { type: 'lock', key: 'abc' },
      { type: 'lock', at: Date.now() },
      { type: 'lock', extra: undefined },
      { kind: 'lock' },
      { type: { nested: 'lock' } },
    ];
    for (const r of rejected) expect(isLockMessage(r), JSON.stringify(r) ?? String(r)).toBe(false);
  });

  it('peerLockNotice: título "Cofre bloqueado" e menciona "outra aba"', () => {
    const n = peerLockNotice();
    expect(n.title).toBe('Cofre bloqueado');
    expect(n.message).toContain('outra aba');
  });
});

describe('start / stop', () => {
  it('start() abre o canal "cashflow.lock" e fica ativo', () => {
    const hub = createFakeHub();
    const names: string[] = [];
    const sync = createLockSync({
      onPeerLock: () => {},
      createChannel: (name) => {
        names.push(name);
        return new hub.Channel(name);
      },
    });
    expect(sync.isActive()).toBe(false);
    sync.start();
    expect(names).toEqual(['cashflow.lock']);
    expect(sync.isActive()).toBe(true);
    expect(hub.openCount()).toBe(1);
  });

  it('start() duas vezes: um só canal e um só listener ativos (o anterior é fechado)', async () => {
    const hub = createFakeHub();
    const onPeerLock = vi.fn();
    const a = createLockSync({ onPeerLock, createChannel: (n) => new hub.Channel(n) });
    const sender = new hub.Channel(LOCK_CHANNEL_NAME);
    a.start();
    a.start();
    a.start();
    expect(hub.openCount(LOCK_CHANNEL_NAME)).toBe(2); // o de a + o remetente do teste
    expect(hub.listenerCount()).toBe(1);
    sender.postMessage({ type: 'lock' });
    await settle();
    expect(onPeerLock).toHaveBeenCalledTimes(1);
  });

  it('stop(): remove o listener, fecha o canal e zera o estado; depois disso nada chega nem sai', async () => {
    const hub = createFakeHub();
    const onPeerLock = vi.fn();
    const sync = createLockSync({ onPeerLock, createChannel: (n) => new hub.Channel(n) });
    const other = new hub.Channel(LOCK_CHANNEL_NAME);
    sync.start();
    sync.stop();
    expect(sync.isActive()).toBe(false);
    expect(hub.openCount(LOCK_CHANNEL_NAME)).toBe(1); // só o remetente
    expect(hub.listenerCount()).toBe(0);

    other.postMessage({ type: 'lock' });
    await settle();
    expect(onPeerLock).not.toHaveBeenCalled();

    const before = hub.posted.length;
    sync.broadcastLock();
    expect(hub.posted.length).toBe(before);
  });

  it('stop() sem start() e stop() repetido são no-op', () => {
    const sync = createLockSync({ onPeerLock: () => {}, createChannel: () => null });
    expect(() => sync.stop()).not.toThrow();
    const hub = createFakeHub();
    const s2 = createLockSync({ onPeerLock: () => {}, createChannel: (n) => new hub.Channel(n) });
    s2.start();
    s2.stop();
    expect(() => s2.stop()).not.toThrow();
    expect(s2.isActive()).toBe(false);
  });

  it('pode reiniciar depois de parar', async () => {
    const hub = createFakeHub();
    const onPeerLock = vi.fn();
    const sync = createLockSync({ onPeerLock, createChannel: (n) => new hub.Channel(n) });
    const other = new hub.Channel(LOCK_CHANNEL_NAME);
    sync.start();
    sync.stop();
    sync.start();
    expect(sync.isActive()).toBe(true);
    other.postMessage({ type: 'lock' });
    await settle();
    expect(onPeerLock).toHaveBeenCalledTimes(1);
  });
});

describe('sem BroadcastChannel (navegador antigo / contexto restrito)', () => {
  it('createChannel devolvendo null: start() não lança e isActive() é false; broadcastLock() é no-op', () => {
    const sync = createLockSync({ onPeerLock: () => {}, createChannel: () => null });
    expect(() => sync.start()).not.toThrow();
    expect(sync.isActive()).toBe(false);
    expect(() => sync.broadcastLock()).not.toThrow();
  });

  it('createChannel que lança: start() não lança e fica inativo', () => {
    const sync = createLockSync({
      onPeerLock: () => {},
      createChannel: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => sync.start()).not.toThrow();
    expect(sync.isActive()).toBe(false);
  });

  it('padrão: usa o BroadcastChannel global; se não existir, não lança e fica inativo', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const sync = createLockSync({ onPeerLock: () => {} });
    expect(() => sync.start()).not.toThrow();
    expect(sync.isActive()).toBe(false);
    expect(() => sync.broadcastLock()).not.toThrow();
  });

  it('padrão: construtor global que lança também não derruba o app', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('indisponível');
        }
      },
    );
    const sync = createLockSync({ onPeerLock: () => {} });
    expect(() => sync.start()).not.toThrow();
    expect(sync.isActive()).toBe(false);
  });

  it('padrão: com o BroadcastChannel global presente, abre "cashflow.lock"', () => {
    const hub = installFakeBroadcastChannel();
    const sync = createLockSync({ onPeerLock: () => {} });
    sync.start();
    expect(sync.isActive()).toBe(true);
    expect(hub.openCount('cashflow.lock')).toBe(1);
  });
});

describe('broadcastLock()', () => {
  it('posta EXATAMENTE { type: "lock" } — nenhuma outra propriedade (nada de chave, senha, credencial, tempo)', () => {
    const hub = createFakeHub();
    const sync = createLockSync({ onPeerLock: () => {}, createChannel: (n) => new hub.Channel(n) });
    sync.start();
    sync.broadcastLock();
    expect(hub.posted).toHaveLength(1);
    expect(hub.posted[0]).toEqual({ type: 'lock' });
    expect(Object.keys(hub.posted[0] as object)).toEqual(['type']);
  });

  it('sem canal ativo (nunca iniciado) é no-op silencioso', () => {
    const hub = createFakeHub();
    const sync = createLockSync({ onPeerLock: () => {}, createChannel: (n) => new hub.Channel(n) });
    expect(() => sync.broadcastLock()).not.toThrow();
    expect(hub.posted).toHaveLength(0);
  });

  it('postMessage que lança é engolido', () => {
    const channel: LockChannelLike = {
      postMessage() {
        throw new DOMException('closed', 'InvalidStateError');
      },
      addEventListener() {},
      removeEventListener() {},
      close() {},
    };
    const sync = createLockSync({ onPeerLock: () => {}, createChannel: () => channel });
    sync.start();
    expect(() => sync.broadcastLock()).not.toThrow();
  });
});

describe('mensagens recebidas', () => {
  it('cada { type: "lock" } chama onPeerLock UMA vez', async () => {
    const hub = createFakeHub();
    const onPeerLock = vi.fn();
    const sync = createLockSync({ onPeerLock, createChannel: (n) => new hub.Channel(n) });
    sync.start();
    const sender = new hub.Channel(LOCK_CHANNEL_NAME);
    sender.postMessage({ type: 'lock' });
    await settle();
    expect(onPeerLock).toHaveBeenCalledTimes(1);
    sender.postMessage({ type: 'lock' });
    sender.postMessage({ type: 'lock' });
    await settle();
    expect(onPeerLock).toHaveBeenCalledTimes(3);
  });

  it('qualquer outra coisa é IGNORADA (null, string, tipo errado, chave extra, array, evento sem data)', async () => {
    const hub = createFakeHub();
    const onPeerLock = vi.fn();
    const sync = createLockSync({ onPeerLock, createChannel: (n) => new hub.Channel(n) });
    sync.start();
    const sender = new hub.Channel(LOCK_CHANNEL_NAME);
    for (const junk of [null, 'lock', 42, { type: 'key' }, { type: 'lock', key: 'segredo' }, ['lock'], {}, { type: 'unlock' }]) sender.postMessage(junk);
    await settle();
    expect(onPeerLock).not.toHaveBeenCalled();

    // evento sem `data` (canal de terceiros mal-comportado)
    const box: { deliver: ((e: { data?: unknown }) => void) | null } = { deliver: null };
    const raw: LockChannelLike = {
      postMessage() {},
      addEventListener(_t, fn) {
        box.deliver = fn;
      },
      removeEventListener() {},
      close() {},
    };
    const s2 = createLockSync({ onPeerLock, createChannel: () => raw });
    s2.start();
    expect(() => box.deliver!({})).not.toThrow();
    expect(onPeerLock).not.toHaveBeenCalled();
  });
});

describe('duas abas (canal compartilhado)', () => {
  it('A.broadcastLock() → onPeerLock de B 1x e o de A 0x (a própria aba não recebe o que posta)', async () => {
    const hub = createFakeHub();
    const a = vi.fn();
    const b = vi.fn();
    const tabA = createLockSync({ onPeerLock: a, createChannel: (n) => new hub.Channel(n) });
    const tabB = createLockSync({ onPeerLock: b, createChannel: (n) => new hub.Channel(n) });
    tabA.start();
    tabB.start();
    tabA.broadcastLock();
    await settle();
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(hub.posted).toEqual([{ type: 'lock' }]);
  });

  it('três abas: o sinal chega às duas outras, nunca à de origem', async () => {
    const hub = createFakeHub();
    const fns = [vi.fn(), vi.fn(), vi.fn()];
    const tabs = fns.map((f) => createLockSync({ onPeerLock: f, createChannel: (n) => new hub.Channel(n) }));
    tabs.forEach((t) => t.start());
    tabs[1]!.broadcastLock();
    await settle();
    expect(fns.map((f) => f.mock.calls.length)).toEqual([1, 0, 1]);
  });

  it('aba que parou (stop) não recebe mais nada', async () => {
    const hub = createFakeHub();
    const a = vi.fn();
    const b = vi.fn();
    const tabA = createLockSync({ onPeerLock: a, createChannel: (n) => new hub.Channel(n) });
    const tabB = createLockSync({ onPeerLock: b, createChannel: (n) => new hub.Channel(n) });
    tabA.start();
    tabB.start();
    tabB.stop();
    tabA.broadcastLock();
    await settle();
    expect(b).not.toHaveBeenCalled();
  });
});
