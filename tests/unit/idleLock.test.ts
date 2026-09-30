/**
 * Auto-bloqueio por inatividade — contrato do módulo src/security/idleLock.ts (injeção de dependências, sem DOM real).
 *
 * Bug original (H1): só pointerdown/keydown/wheel/touchstart contavam como atividade; mover o mouse, rolar a página e
 * focar campos não adiavam o bloqueio → o app pedia a senha local de novo enquanto o usuário estava usando.
 * Além disso, voltar para a aba só era percebido no próximo tick do timer (até 15 s com os dados à mostra).
 */
import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/config/app.config';
import { ACTIVITY_EVENTS, IDLE_CHECK_INTERVAL_MS, createIdleLock, inactivityNotice, isIdleExpired } from '../../src/security/idleLock';
import settingsSource from '../../src/pages/settings.ts?raw';

const MIN = 60_000;

type Fn = (e?: unknown) => void;
interface Registered {
  type: string;
  fn: Fn;
  opts: unknown;
}

function fakeTarget() {
  const regs: Registered[] = [];
  return {
    regs,
    addEventListener(type: string, fn: Fn, opts?: unknown) {
      regs.push({ type, fn, opts });
    },
    removeEventListener(type: string, fn: Fn, opts?: unknown) {
      const cap = (o: unknown) => (typeof o === 'boolean' ? o : !!(o as { capture?: boolean } | undefined)?.capture);
      const i = regs.findIndex((r) => r.type === type && r.fn === fn && cap(r.opts) === cap(opts));
      if (i >= 0) regs.splice(i, 1);
    },
    emit(type: string) {
      for (const r of [...regs]) if (r.type === type) r.fn({ type });
    },
    count(type?: string) {
      return regs.filter((r) => !type || r.type === type).length;
    },
  };
}

function setup(initial: { minutes?: number; enabled?: boolean } = {}) {
  let t = 1_700_000_000_000;
  const cfg = { minutes: initial.minutes ?? 15, enabled: initial.enabled ?? true };
  const win = fakeTarget();
  const doc = Object.assign(fakeTarget(), { visibilityState: 'visible' });
  const intervals: Array<{ id: number; fn: () => void; ms: number; cleared: boolean }> = [];
  let locks = 0;

  const lock = createIdleLock({
    getMinutes: () => cfg.minutes,
    isEnabled: () => cfg.enabled,
    onLock: () => {
      locks++;
    },
    now: () => t,
    win,
    doc,
    setIntervalFn: (fn, ms) => {
      const id = intervals.length + 1;
      intervals.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearIntervalFn: (id) => {
      const it = intervals.find((x) => x.id === id);
      if (it) it.cleared = true;
    },
  });

  return {
    lock,
    cfg,
    win,
    doc,
    intervals,
    locks: () => locks,
    now: () => t,
    activeIntervals: () => intervals.filter((i) => !i.cleared),
    /** Avança o relógio rodando o timer a cada 15 s (aba em primeiro plano / timers normais). */
    advance(ms: number) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + IDLE_CHECK_INTERVAL_MS);
        for (const i of this.activeIntervals()) i.fn();
      }
    },
    /** Avança o relógio SEM rodar o timer (aba oculta/congelada, notebook suspenso). */
    jump(ms: number) {
      t += ms;
    },
  };
}

describe('constantes', () => {
  it('intervalo de verificação de 15 s e eventos de atividade reais (mouse, rolagem, foco, teclado, toque)', () => {
    expect(IDLE_CHECK_INTERVAL_MS).toBe(15_000);
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart', 'touchmove', 'input', 'focusin']) {
      expect(ACTIVITY_EVENTS, ev).toContain(ev);
    }
  });

  it('padrão de 15 min e opções 5/15/30/60/nunca inalterados', () => {
    expect(APP_CONFIG.security.defaultAutoLockMinutes).toBe(15);
    expect(settingsSource).toContain('[5, 15, 30, 60, 0]');
  });
});

describe('dica visível do bloqueio automático (Configurações → Conta)', () => {
  it.each(['mouse, rolagem e digitação contam como uso', '30 ou 60 minutos', 'Economia de memória', 'Abas inativas'])('o texto da linha "Bloqueio automático" cita "%s"', (frase) => {
    expect(settingsSource).toContain(frase);
  });
});

describe('isIdleExpired', () => {
  it('só expira quando o tempo parado é ESTRITAMENTE maior que o limite', () => {
    expect(isIdleExpired(0, 15 * MIN, 15)).toBe(false);
    expect(isIdleExpired(0, 15 * MIN + 1, 15)).toBe(true);
    expect(isIdleExpired(1_000, 1_000 + 5 * MIN, 5)).toBe(false);
    expect(isIdleExpired(1_000, 1_000 + 5 * MIN + 1, 5)).toBe(true);
  });

  it('"nunca" (0), negativo e valores não finitos jamais expiram', () => {
    const far = 10 * 24 * 60 * MIN;
    expect(isIdleExpired(0, far, 0)).toBe(false);
    expect(isIdleExpired(0, far, -5)).toBe(false);
    expect(isIdleExpired(0, far, Number.NaN)).toBe(false);
    expect(isIdleExpired(0, far, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('start / stop', () => {
  it('start(): zera a janela e registra atividade (passive+capture), focus, pageshow, visibilitychange e o timer de 15 s', () => {
    const e = setup();
    e.lock.start();
    expect(e.lock.lastActivity()).toBe(e.now());
    for (const ev of ACTIVITY_EVENTS) {
      const r = e.win.regs.filter((x) => x.type === ev);
      expect(r, `listener de ${ev} na window`).toHaveLength(1);
      expect(r[0]!.opts).toMatchObject({ passive: true, capture: true });
    }
    expect(e.win.count('focus')).toBe(1);
    expect(e.win.count('pageshow')).toBe(1);
    expect(e.doc.count('visibilitychange')).toBe(1);
    expect(e.activeIntervals()).toHaveLength(1);
    expect(e.activeIntervals()[0]!.ms).toBe(IDLE_CHECK_INTERVAL_MS);
  });

  it('start() duas vezes NÃO duplica listeners nem timers', () => {
    const e = setup();
    e.lock.start();
    const w = e.win.count();
    const d = e.doc.count();
    e.lock.start();
    expect(e.win.count()).toBe(w);
    expect(e.doc.count()).toBe(d);
    expect(e.activeIntervals()).toHaveLength(1);
  });

  it('stop(): remove todos os listeners, limpa o timer e nada mais bloqueia', () => {
    const e = setup();
    e.lock.start();
    e.lock.stop();
    expect(e.win.count()).toBe(0);
    expect(e.doc.count()).toBe(0);
    expect(e.activeIntervals()).toHaveLength(0);
    e.jump(60 * MIN);
    e.win.emit('pointerdown');
    e.win.emit('focus');
    e.doc.visibilityState = 'visible';
    e.doc.emit('visibilitychange');
    expect(e.locks()).toBe(0);
  });
});

describe('atividade real adia o bloqueio (regressão H1)', () => {
  it('controle: sem nenhuma atividade bloqueia logo depois de 15 min (nunca antes)', () => {
    const e = setup();
    e.lock.start();
    e.advance(15 * MIN);
    expect(e.locks()).toBe(0);
    e.advance(MIN);
    expect(e.locks()).toBe(1);
  });

  it.each(['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart', 'touchmove', 'input', 'focusin'])(
    '%s a cada minuto mantém desbloqueado por 45 min (muito além do limite)',
    (ev) => {
      const e = setup();
      e.lock.start();
      for (let i = 0; i < 45; i++) {
        e.advance(MIN);
        e.win.emit(ev);
      }
      expect(e.locks()).toBe(0);
      expect(e.lock.lastActivity()).toBe(e.now());
    },
  );

  it('uma atividade a 14 min reinicia a contagem: só bloqueia 15 min depois dela', () => {
    const e = setup();
    e.lock.start();
    e.advance(14 * MIN);
    e.win.emit('pointermove');
    e.advance(14 * MIN);
    expect(e.locks()).toBe(0);
    e.advance(2 * MIN);
    expect(e.locks()).toBe(1);
  });

  it('touch() direto renova a janela e devolve true', () => {
    const e = setup();
    e.lock.start();
    e.jump(10 * MIN);
    expect(e.lock.touch()).toBe(true);
    expect(e.lock.lastActivity()).toBe(e.now());
    expect(e.locks()).toBe(0);
  });
});

describe('atividade NÃO ressuscita sessão vencida', () => {
  it('clique depois do prazo (timer ainda não rodou) bloqueia na hora, em vez de renovar', () => {
    const e = setup();
    e.lock.start();
    e.jump(16 * MIN); // timers congelados: nenhum tick de 15 s rodou
    e.win.emit('pointerdown');
    expect(e.locks()).toBe(1);
    // janela nova depois do bloqueio: um segundo evento no mesmo instante não bloqueia em loop
    e.win.emit('pointerdown');
    expect(e.locks()).toBe(1);
  });

  it('touch() devolve false quando a sessão já venceu e está habilitado', () => {
    const e = setup();
    e.lock.start();
    e.jump(16 * MIN);
    expect(e.lock.touch()).toBe(false);
    expect(e.locks()).toBe(1);
  });

  it('dentro do prazo, o mesmo evento só renova (não bloqueia)', () => {
    const e = setup();
    e.lock.start();
    e.jump(14 * MIN);
    e.win.emit('pointerdown');
    expect(e.locks()).toBe(0);
    expect(e.lock.lastActivity()).toBe(e.now());
  });
});

describe('check()', () => {
  it('desabilitado (tela de bloqueio/demo) nunca chama onLock, mesmo vencido', () => {
    const e = setup({ enabled: false });
    e.lock.start();
    e.jump(5 * 60 * MIN);
    expect(e.lock.check()).toBe(false);
    e.advance(MIN);
    expect(e.locks()).toBe(0);
  });

  it('"nunca" (0 min) não bloqueia, nem depois de horas', () => {
    const e = setup({ minutes: 0 });
    e.lock.start();
    e.advance(6 * 60 * MIN);
    expect(e.lock.check()).toBe(false);
    expect(e.locks()).toBe(0);
  });

  it('vencido: chama onLock UMA vez e recomeça a janela (sem laço de bloqueios)', () => {
    const e = setup();
    e.lock.start();
    e.jump(20 * MIN);
    expect(e.lock.check()).toBe(true);
    expect(e.locks()).toBe(1);
    expect(e.lock.lastActivity()).toBe(e.now());
    expect(e.lock.check()).toBe(false);
    e.advance(10 * MIN);
    expect(e.locks()).toBe(1);
  });

  it('não vencido devolve false', () => {
    const e = setup();
    e.lock.start();
    e.jump(15 * MIN);
    expect(e.lock.check()).toBe(false);
    expect(e.locks()).toBe(0);
  });

  it('o limite é lido a cada verificação: mudar a preferência vale na hora', () => {
    const e = setup({ minutes: 15 });
    e.lock.start();
    e.advance(6 * MIN);
    expect(e.locks()).toBe(0);
    e.cfg.minutes = 5; // preferência trocada em runtime: 6 min parados > 5
    expect(e.lock.check()).toBe(true);
    expect(e.locks()).toBe(1);
  });

  it('mudar de 15 para "nunca" em runtime deixa de bloquear', () => {
    const e = setup({ minutes: 15 });
    e.lock.start();
    e.advance(10 * MIN);
    e.cfg.minutes = 0;
    e.advance(3 * 60 * MIN);
    expect(e.locks()).toBe(0);
  });
});

describe('voltar para a aba (visibilitychange / focus / pageshow)', () => {
  it('aba oculta há mais que o limite: bloqueia NA HORA ao voltar, sem esperar o tick de 15 s', () => {
    const e = setup();
    e.lock.start();
    e.doc.visibilityState = 'hidden';
    e.doc.emit('visibilitychange');
    e.jump(30 * MIN); // timers congelados em segundo plano
    expect(e.locks()).toBe(0);
    e.doc.visibilityState = 'visible';
    e.doc.emit('visibilitychange');
    expect(e.locks()).toBe(1);
  });

  it('evento de visibilidade com a aba OCULTA não faz nada (nem bloqueia, nem renova)', () => {
    const e = setup();
    e.lock.start();
    const start = e.lock.lastActivity();
    e.jump(30 * MIN);
    e.doc.visibilityState = 'hidden';
    e.doc.emit('visibilitychange');
    expect(e.locks()).toBe(0);
    expect(e.lock.lastActivity()).toBe(start);
  });

  it('tempo com a aba oculta conta como inatividade (conservador)', () => {
    const e = setup();
    e.lock.start();
    e.doc.visibilityState = 'hidden';
    e.doc.emit('visibilitychange');
    e.advance(16 * MIN); // timer de segundo plano continua rodando
    expect(e.locks()).toBe(1);
  });

  it('voltar antes do limite não bloqueia e NÃO conta como atividade', () => {
    const e = setup();
    e.lock.start();
    const start = e.lock.lastActivity();
    e.doc.visibilityState = 'hidden';
    e.doc.emit('visibilitychange');
    e.jump(10 * MIN);
    e.doc.visibilityState = 'visible';
    e.doc.emit('visibilitychange');
    expect(e.locks()).toBe(0);
    expect(e.lock.lastActivity()).toBe(start);
    // e como não renovou, o tempo restante continua contando a partir da última interação real
    e.advance(6 * MIN);
    expect(e.locks()).toBe(1);
  });

  it.each(['focus', 'pageshow'])('%s depois do prazo bloqueia na hora; antes do prazo não renova a janela', (ev) => {
    const a = setup();
    a.lock.start();
    a.jump(20 * MIN);
    a.win.emit(ev);
    expect(a.locks()).toBe(1);

    const b = setup();
    b.lock.start();
    const start = b.lock.lastActivity();
    b.jump(5 * MIN);
    b.win.emit(ev);
    expect(b.locks()).toBe(0);
    expect(b.lock.lastActivity()).toBe(start);
  });

  it('retorno à aba com bloqueio desabilitado (já trancado ou demo) não chama onLock', () => {
    const e = setup({ enabled: false });
    e.lock.start();
    e.jump(40 * MIN);
    e.doc.emit('visibilitychange');
    e.win.emit('focus');
    e.win.emit('pageshow');
    expect(e.locks()).toBe(0);
  });
});

describe('ciclo bloquear → desbloquear', () => {
  it('com o app trancado (desabilitado) a atividade ainda atualiza a janela: o desbloqueio começa uma janela NOVA', () => {
    const e = setup();
    e.lock.start();
    e.advance(16 * MIN);
    expect(e.locks()).toBe(1);

    e.cfg.enabled = false; // tela de desbloqueio
    e.jump(30 * MIN);
    e.win.emit('keydown'); // digitou a senha
    expect(e.lock.lastActivity()).toBe(e.now());
    expect(e.locks()).toBe(1);

    e.cfg.enabled = true; // desbloqueou
    expect(e.lock.check()).toBe(false);
    e.advance(14 * MIN);
    expect(e.locks()).toBe(1);
    e.advance(2 * MIN);
    expect(e.locks()).toBe(2);
  });
});

describe('inactivityNotice (aviso ao bloquear por inatividade)', () => {
  it('sessão normal: dados continuam cifrados no navegador', () => {
    const n = inactivityNotice(false);
    expect(n.title.length).toBeGreaterThan(0);
    expect(n.message).toContain('cifrados');
  });

  it('modo sessão: título "Sessão encerrada"; não promete dados cifrados e diz que as credenciais foram descartadas da memória', () => {
    const n = inactivityNotice(true);
    expect(n.title).toBe('Sessão encerrada');
    expect(n.message).not.toContain('continuam cifrados');
    expect(n.message).toContain('descartad');
    expect(n.message).toContain('memória');
  });
});
