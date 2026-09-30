/**
 * IndexedDB: uma falha TRANSITÓRIA ao abrir o banco não pode jogar o app, para sempre, num fallback em memória.
 *
 * Bug original (H3): openDb() caía no memoryFallback na primeira falha e nunca mais voltava → vaultExists() passava a
 * devolver false, o boot mostrava o onboarding ("as credenciais sumiram") e tudo que fosse gravado depois ia só para a memória.
 *
 * Contrato (src/storage/db.ts): DB_OPEN_ATTEMPTS = 3, esperas de 200 ms e 600 ms entre tentativas; SecurityError não é repetido;
 * sem `indexedDB` cai para memória imediatamente. NENHUM teste toca o IndexedDB real do usuário — tudo é um IndexedDB falso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeIndexedDb, type Backing } from './helpers/fakeIndexedDb';

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function loadDb() {
  vi.resetModules();
  return import('../../src/storage/db');
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('constantes de retentativa', () => {
  it('3 tentativas, esperando 200 ms e 600 ms entre elas', async () => {
    const db = await loadDb();
    expect(db.DB_OPEN_ATTEMPTS).toBe(3);
    expect([...db.DB_OPEN_RETRY_DELAYS_MS]).toEqual([200, 600]);
  });
});

describe('openDb() com falha transitória', () => {
  it('falha 2 vezes e abre na 3ª: 3 chamadas, esperas de 200 e 600 ms, e o banco continua PERSISTENTE', async () => {
    const { open } = fakeIndexedDb(['error', 'error', 'ok']);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();

    const p = db.openDb();
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(199);
    expect(open, 'ainda dentro dos 200 ms de espera').toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(open).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(599);
    expect(open, 'ainda dentro dos 600 ms de espera').toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(open).toHaveBeenCalledTimes(3);

    const handle = await p;
    expect(handle).not.toBeNull();
    expect(db.isPersistent()).toBe(true);
  });

  it('abre na 2ª tentativa: só 2 chamadas e sem fallback em memória', async () => {
    const { open } = fakeIndexedDb(['error', 'ok']);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();
    const p = db.openDb();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
    expect(db.isPersistent()).toBe(true);
  });

  it('onblocked conta como falha e é repetido', async () => {
    const { open } = fakeIndexedDb(['blocked', 'ok']);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();
    const p = db.openDb();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
    expect(db.isPersistent()).toBe(true);
  });

  it('exceção em open() também é repetida', async () => {
    const { open } = fakeIndexedDb(['throw', 'throw', 'ok']);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();
    const p = db.openDb();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await p).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(3);
    expect(db.isPersistent()).toBe(true);
  });

  it('dados JÁ gravados continuam visíveis depois de uma falha transitória (o cofre não "some")', async () => {
    const backing = new Map() as Backing;
    backing.set('pluggy_credentials', new Map([['vault', { id: 'vault', version: 1, wrappedDek: 'x' }]]));
    const { open } = fakeIndexedDb(['error', 'ok'], backing);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();

    const p = db.idbGet<{ id: string; version: number }>('pluggy_credentials', 'vault');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).toMatchObject({ id: 'vault', version: 1 });
    expect(db.isPersistent()).toBe(true);
  });

  it('gravações depois da recuperação vão para o banco real (não para a memória)', async () => {
    const backing = new Map() as Backing;
    const { open } = fakeIndexedDb(['error', 'ok'], backing);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();
    const p = db.idbPut('pluggy_credentials', { id: 'credentials', blob: 'cifrado' });
    await vi.advanceTimersByTimeAsync(1_000);
    await p;
    expect(backing.get('pluggy_credentials')?.get('credentials')).toMatchObject({ blob: 'cifrado' });
  });
});

describe('openDb() sem recuperação', () => {
  it('3 falhas → fallback em memória (isPersistent() === false) e idbPut/idbGet continuam funcionando', async () => {
    const { open } = fakeIndexedDb(['error']);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();
    const p = db.openDb();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toBeNull();
    expect(open).toHaveBeenCalledTimes(3);
    expect(db.isPersistent()).toBe(false);

    await db.idbPut('user_preferences', { id: 'prefs', value: 1 });
    expect(await db.idbGet('user_preferences', 'prefs')).toMatchObject({ value: 1 });
    // depois de decidir pela memória não insiste no banco a cada chamada
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('SecurityError NÃO é repetido: vai direto para a memória, sem esperar', async () => {
    const { open } = fakeIndexedDb(['security']);
    vi.stubGlobal('indexedDB', { open });
    const db = await loadDb();
    const p = db.openDb();
    await flush();
    expect(await p).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(db.isPersistent()).toBe(false);
  });

  it('indexedDB indefinido → memória imediata, sem esperas', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const db = await loadDb();
    const p = db.openDb();
    await flush();
    expect(await p).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(db.isPersistent()).toBe(false);
  });
});
