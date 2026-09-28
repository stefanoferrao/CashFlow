/**
 * Tela de carregamento (splash). O HTML está no index.html (aparece antes de qualquer JavaScript) e os estilos em
 * styles/base.css; aqui fica só a saída: espera um tempo mínimo (evita "piscar" quando o app abre muito rápido),
 * some com fade e é removida do DOM.
 */

/** Tempo mínimo na tela, contado desde o início do carregamento da página. */
const MIN_VISIBLE_MS = 700;
/** Igual a --t-slow (tokens.css): duração do fade de saída. */
const FADE_MS = 320;
/** Depois disso sem o app abrir, o texto avisa que está demorando. */
const SLOW_AFTER_MS = 15_000;

let leaving = false;
const slowTimer = window.setTimeout(() => setHint('Está demorando mais que o esperado…'), SLOW_AFTER_MS);

function setHint(text: string): void {
  const hint = document.getElementById('splash-hint');
  if (hint) hint.textContent = text;
}

/** Tira a tela de carregamento. Pode ser chamada várias vezes: só a primeira vale. */
export function hideSplash(): void {
  if (leaving) return;
  leaving = true;
  window.clearTimeout(slowTimer);
  const el = document.getElementById('splash');
  if (!el) return;
  // performance.now() conta desde o início da navegação, então inclui o tempo de carga do JavaScript.
  window.setTimeout(() => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), FADE_MS + 100);
  }, Math.max(0, MIN_VISIBLE_MS - performance.now()));
}

/** O app não conseguiu abrir: mantém a tela e troca a mensagem (em vez de deixar uma animação eterna). */
export function failSplash(): void {
  if (leaving) return;
  window.clearTimeout(slowTimer);
  document.getElementById('splash')?.classList.add('is-error');
  setHint('Não foi possível abrir o CashFlow. Recarregue a página.');
}
