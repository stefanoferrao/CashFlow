/**
 * Busca automática dos Items que já existem na aplicação Pluggy (Dashboard da Pluggy / Meu Pluggy).
 * Lógica pura (sem rede, sem estado): decide quais Items da listagem entram no app.
 *
 * A listagem (`GET /v2/items`) é um recurso opt-in: enquanto a Pluggy não o habilita, a API responde 403.
 * Nesse caso a busca é "indisponível" e o app segue com o Pluggy Connect e o campo "Tenho um Item ID".
 */
import type { PluggyErrorKind } from './errors';
import type { PluggyItem } from './types';

/** Teto de Items adicionados de uma vez: uma aplicação pode ter conexões de outros usuários, e cada Item vira várias chamadas. */
export const MAX_AUTO_ITEMS = 20;

export interface DiscoveryPlan {
  /** IDs a registrar, do mais recente para o mais antigo. */
  add: string[];
  /** Quantos Items distintos a Pluggy devolveu. */
  found: number;
  /** Já estavam no app. */
  alreadyKnown: number;
  /** Conectores de teste ignorados (a opção "Incluir conectores de teste" está desligada). */
  skippedSandbox: number;
  /** Ficaram de fora por causa do teto (adicione-os pelo Item ID). */
  truncated: number;
}

export function planDiscovery(found: readonly PluggyItem[], known: readonly string[], opts: { includeSandbox: boolean; max?: number }): DiscoveryPlan {
  const max = opts.max ?? MAX_AUTO_ITEMS;
  const have = new Set(known.map((id) => id.toLowerCase()));
  const seen = new Set<string>();
  const fresh: PluggyItem[] = [];
  let alreadyKnown = 0;
  let skippedSandbox = 0;

  for (const it of found) {
    const id = typeof it?.id === 'string' ? it.id.toLowerCase() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (have.has(id)) {
      alreadyKnown++;
    } else if (it.connector?.isSandbox && !opts.includeSandbox) {
      skippedSandbox++;
    } else {
      fresh.push(it);
    }
  }

  // Mais recentes primeiro: se houver corte pelo teto, ficam as conexões mais novas.
  fresh.sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''));
  const add = fresh.slice(0, max).map((it) => it.id);
  return { add, found: seen.size, alreadyKnown, skippedSandbox, truncated: Math.max(0, fresh.length - add.length) };
}

/** A listagem não está habilitada para esta aplicação (403) ou não existe (404): não é falha, é só recurso ausente. */
export function isDiscoveryUnavailable(kind: PluggyErrorKind): boolean {
  return kind === 'forbidden' || kind === 'not_found';
}
