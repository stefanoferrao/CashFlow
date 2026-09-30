/**
 * Armazenamento persistente (navigator.storage.persist): sem isso o IndexedDB é "best-effort" e o navegador pode
 * despejar o cofre sob pressão de espaço — e o usuário vê as credenciais "sumirem".
 *
 * Contrato (src/storage/persistence.ts): requestPersistentStorage() NUNCA lança; ausente → null; já persistido → true
 * sem chamar persist(); senão devolve o resultado de persist(). Nada é gravado.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../../src/storage/persistence';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestPersistentStorage', () => {
  it('sem storage (null/undefined/sem persist) → null', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistentStorage(null)).toBeNull();
    expect(await requestPersistentStorage({})).toBeNull();
    expect(await requestPersistentStorage({ persisted: async () => false })).toBeNull();
    expect(await requestPersistentStorage()).toBeNull(); // navigator sem storage
  });

  it('já persistido → true e persist() NÃO é chamado', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistentStorage({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('ainda não persistido → devolve o resultado de persist() (true ou false)', async () => {
    const yes = vi.fn(async () => true);
    expect(await requestPersistentStorage({ persisted: async () => false, persist: yes })).toBe(true);
    expect(yes).toHaveBeenCalledTimes(1);

    const no = vi.fn(async () => false);
    expect(await requestPersistentStorage({ persisted: async () => false, persist: no })).toBe(false);
    expect(no).toHaveBeenCalledTimes(1);
  });

  it('sem persisted(), chama persist() direto', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistentStorage({ persist })).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('NUNCA lança: exceção síncrona, rejeição e persisted() que falha viram null', async () => {
    await expect(
      requestPersistentStorage({
        persisted: async () => false,
        persist: () => {
          throw new Error('SecurityError');
        },
      }),
    ).resolves.toBeNull();
    await expect(requestPersistentStorage({ persisted: async () => false, persist: async () => Promise.reject(new Error('negado')) })).resolves.toBeNull();
    await expect(
      requestPersistentStorage({
        persisted: () => Promise.reject(new Error('indisponível')),
        persist: async () => true,
      }),
    ).resolves.toBeNull();
    await expect(
      requestPersistentStorage({
        persisted: () => {
          throw new Error('indisponível');
        },
        persist: async () => true,
      }),
    ).resolves.toBeNull();
  });

  it('padrão do parâmetro: navigator.storage', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('null EXPLÍCITO não cai no navigator.storage', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } });
    expect(await requestPersistentStorage(null)).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it('não escreve nada em localStorage/sessionStorage/IndexedDB', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: () => null, removeItem() {} });
    vi.stubGlobal('sessionStorage', { setItem, getItem: () => null, removeItem() {} });
    await requestPersistentStorage({ persisted: async () => false, persist: async () => true });
    expect(setItem).not.toHaveBeenCalled();
  });
});
