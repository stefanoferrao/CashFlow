import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/config/app.config';
import { BUNDLED_RELEASE_NOTES } from '../../src/config/releaseNotes';

describe('Notas de Atualização embutidas no app', () => {
  it('trazem a data de lançamento logo na abertura', () => {
    expect(BUNDLED_RELEASE_NOTES).toMatch(/^Lançada em \*\*\d{2}\/\d{2}\/\d{4}\*\*/);
  });

  it('têm as seções que a tela de novidades espera', () => {
    for (const h of ['## Novidades', '## Correções', '## Privacidade e segurança', '## Como atualizar']) expect(BUNDLED_RELEASE_NOTES).toContain(h);
  });

  it('a versão do app é uma versão com três números', () => {
    expect(APP_CONFIG.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
