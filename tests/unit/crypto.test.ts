import { describe, expect, it } from 'vitest';
import {
  decryptJson,
  deriveKek,
  encryptJson,
  fromBase64,
  generateDek,
  passphraseStrength,
  randomBytes,
  toBase64,
  unwrapDek,
  wrapDek,
} from '../../src/security/crypto';

// Iterações reduzidas SÓ nos testes (velocidade). Produção usa 600.000 (APP_CONFIG).
const IT = 1000;

describe('Web Crypto — cofre local', () => {
  it('base64 ida e volta', () => {
    const b = randomBytes(64);
    expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
  });

  it('cifra e decifra JSON com AES-GCM', async () => {
    const key = await generateDek(false);
    const blob = await encryptJson(key, { clientSecret: 'super-secreto' }, 'pluggy_credentials:credentials');
    expect(blob.ct).not.toContain('super-secreto');
    expect(atob(blob.ct)).not.toContain('super-secreto');
    await expect(decryptJson(key, blob, 'pluggy_credentials:credentials')).resolves.toEqual({ clientSecret: 'super-secreto' });
  });

  it('IV é aleatório (mesmo conteúdo → cifras diferentes)', async () => {
    const key = await generateDek(false);
    const a = await encryptJson(key, { v: 1 }, 'x');
    const b = await encryptJson(key, { v: 1 }, 'x');
    expect(a.iv === b.iv).toBe(false);
    expect(a.ct === b.ct).toBe(false);
  });

  it('AAD diferente (registro trocado de lugar) falha na autenticação', async () => {
    const key = await generateDek(false);
    const blob = await encryptJson(key, { v: 1 }, 'accounts:item1');
    await expect(decryptJson(key, blob, 'accounts:item2')).rejects.toThrow();
  });

  it('senha errada não desembrulha a chave de dados', async () => {
    const salt = randomBytes(16);
    const kek = await deriveKek('senha-correta-123', salt, IT);
    const dek = await generateDek(true);
    const { wrapped, iv } = await wrapDek(dek, kek);
    const wrong = await deriveKek('senha-errada-123', salt, IT);
    await expect(unwrapDek(wrapped, iv, wrong)).rejects.toThrow();
    const ok = await unwrapDek(wrapped, iv, kek);
    expect(ok.extractable).toBe(false);
  });

  it('chave desembrulhada decifra o que a original cifrou', async () => {
    const salt = randomBytes(16);
    const kek = await deriveKek('minha senha local', salt, IT);
    const dek = await generateDek(true);
    const blob = await encryptJson(dek, [1, 2, 3], 'aad');
    const { wrapped, iv } = await wrapDek(dek, kek);
    const again = await unwrapDek(wrapped, iv, kek);
    await expect(decryptJson(again, blob, 'aad')).resolves.toEqual([1, 2, 3]);
  });

  it('força da senha local', () => {
    expect(passphraseStrength('abc').score).toBe(0);
    expect(passphraseStrength('Senha-Muito-Boa-2026!').score).toBe(4);
  });
});
