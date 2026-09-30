/**
 * Pede ao navegador que trate o armazenamento deste site como "persistente".
 * Sem isso o IndexedDB é "best-effort": com pouco espaço em disco o navegador pode descartá-lo inteiro
 * (cofre, credenciais cifradas e cache somem). Não grava nada e não altera o que é cifrado.
 */
export interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

/** true/false = estado do armazenamento; null = o navegador não oferece a API (ou ela falhou). Nunca lança. */
export async function requestPersistentStorage(storage: StorageManagerLike | null | undefined = globalThis.navigator?.storage): Promise<boolean | null> {
  try {
    if (!storage || typeof storage.persist !== 'function') return null;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}
