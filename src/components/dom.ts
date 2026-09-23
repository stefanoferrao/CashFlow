/**
 * Templating seguro. TODA interpolação é escapada por padrão — descrições de transações
 * vêm de bancos e são tratadas como texto não confiável. Só `raw()` insere HTML sem escape,
 * e ele é usado exclusivamente para marcação estática do próprio app (ícones SVG).
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'`]/g, (c) => ESCAPES[c] ?? c);
}

/** Marca uma string como HTML confiável. Use SOMENTE com marcação estática do app. */
export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += renderValue(values[i]);
  }
  return new SafeHtml(out);
}

export function render(target: Element, content: SafeHtml): void {
  target.innerHTML = content.value;
}

export function $(selector: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector);
}

export function $$(selector: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/**
 * Delegação de eventos por `data-action`. Retorna função para remover o listener.
 * handlers[action](element, event)
 */
export function delegate(
  root: HTMLElement,
  type: string,
  handlers: Record<string, (el: HTMLElement, ev: Event) => void>,
): () => void {
  const listener = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    const el = target?.closest<HTMLElement>('[data-action]');
    if (!el || !root.contains(el)) return;
    const action = el.dataset.action;
    if (!action) return;
    const fn = handlers[action];
    if (fn) fn(el, ev);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

/**
 * Anima um número (contagem) respeitando prefers-reduced-motion.
 * O valor FINAL já está no HTML; a animação é só cosmética e um timeout garante o valor exato
 * mesmo que requestAnimationFrame seja suspenso (aba em segundo plano).
 */
export function animateNumbers(root: ParentNode, format: (n: number) => string): void {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || document.visibilityState !== 'visible') return;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-count]'))) {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target) || !el.dataset.currency) continue;
    const finalText = format(target);
    const start = performance.now();
    const duration = 600;
    const from = target * 0.9;
    let done = false;
    const finish = () => {
      done = true;
      el.textContent = finalText;
    };
    const step = (now: number) => {
      if (done) return;
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) return finish();
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(from + (target - from) * eased);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(finish, duration + 80);
  }
}
