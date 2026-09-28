/**
 * Limite de crédito de um cartão: limite total, limite utilizado e limite disponível. Funções puras.
 *
 * Baseado na documentação da Pluggy (docs.pluggy.ai/docs/accounts):
 *  - `balance` do cartão: em conectores Open Finance (o Meu Pluggy é um deles) é o LIMITE UTILIZADO do cartão; nos
 *    demais, é o saldo em aberto da fatura do mês.
 *  - `creditLimit`/`availableCreditLimit` são os campos gerais do limite.
 *  - `disaggregatedCreditLimits` traz cada linha de crédito (limite total e limites por modalidade, individuais ou
 *    compartilhados entre cartões). A documentação manda usá-lo quando o saldo do cartão parece incorreto e para não
 *    contar duas vezes um limite compartilhado.
 *
 * Ordem de confiança para o limite utilizado (a fonte usada fica registrada em `source`):
 *  1. linha de limite TOTAL (`credit-line`): informada pela própria instituição, com usado/disponível da linha;
 *  2. Open Finance com saldo do cartão (`balance`): o saldo é o limite utilizado; se o disponível informado pela Pluggy
 *     não bate com ele, vale o saldo (e a diferença é sinalizada em `note`);
 *  3. limite − disponível (`available`): conectores que não são Open Finance.
 */
import type { PluggyCreditData, PluggyDisaggregatedCreditLimit } from '../pluggy/types';
import { formatMoney } from '../utils/format';

export type LimitSource = 'credit-line' | 'balance' | 'available';

export interface ResolvedLimits {
  limit: number | null;
  available: number | null;
  used: number | null;
  /** De onde veio o limite utilizado (null = não informado). */
  source: LimitSource | null;
  /** O que a Pluggy informou de diferente do que o app usa (mostrado no cartão). */
  note: string | null;
  /** Limite compartilhado com outros cartões: cartões com a mesma chave dividem o mesmo limite (contado uma vez nos totais). */
  sharedKey: string | null;
}

/** Diferença (em reais) abaixo da qual dois valores são considerados iguais. */
const TOLERANCE = 1;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Limite disponível de uma linha: o informado, ou limite − usado. */
function lineAvailable(l: PluggyDisaggregatedCreditLimit): number {
  if (finite(l.availableAmount)) return l.availableAmount;
  return (l.limitAmount ?? 0) - (finite(l.usedAmount) ? l.usedAmount : 0);
}

/**
 * Linha do limite TOTAL do cartão. Se houver mais de uma (individual e compartilhada), vale a mais restritiva — a que
 * deixa menos limite disponível é a que barra uma compra.
 */
export function totalCreditLine(lines: readonly PluggyDisaggregatedCreditLimit[] | null | undefined): PluggyDisaggregatedCreditLimit | null {
  const candidates = (lines ?? []).filter(
    (l) => l && /TOTAL/i.test(l.creditLineLimitType ?? '') && finite(l.limitAmount) && l.limitAmount > 0 && (finite(l.usedAmount) || finite(l.availableAmount)),
  );
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => lineAvailable(a) - lineAvailable(b))[0]!;
}

export function resolveCardLimits(cd: PluggyCreditData | null | undefined, balance: number, opts: { itemId: string; openFinanceData: boolean }): ResolvedLimits {
  const topLimit = finite(cd?.creditLimit) ? cd.creditLimit : null;
  const topAvailable = finite(cd?.availableCreditLimit) ? cd.availableCreditLimit : null;
  const topUsed = topLimit !== null && topAvailable !== null ? round2(Math.max(0, topLimit - topAvailable)) : null;

  // 1) Linha de limite total informada pela instituição.
  const line = totalCreditLine(cd?.disaggregatedCreditLimits);
  if (line && finite(line.limitAmount)) {
    const limit = round2(line.limitAmount);
    const used = round2(clamp(finite(line.usedAmount) ? line.usedAmount : limit - lineAvailable(line), 0, limit));
    const shared = /consolid/i.test(line.consolidationType ?? '');
    const differs = topUsed !== null && Math.abs(topUsed - used) > TOLERANCE;
    return {
      limit,
      used,
      available: round2(limit - used),
      source: 'credit-line',
      note: differs
        ? `Os campos gerais da Pluggy informam limite utilizado de ${formatMoney(topUsed)}, mas a instituição detalha ${formatMoney(used)} na linha de limite total — é esse valor que o CashFlow usa.`
        : null,
      sharedKey: shared ? `${opts.itemId}|${line.identificationNumber ?? 'consolidado'}|${limit}` : null,
    };
  }

  if (topLimit === null || topLimit <= 0) return { limit: topLimit, available: topAvailable, used: topUsed, source: topUsed === null ? null : 'available', note: null, sharedKey: null };

  // 2) Open Finance: o saldo do cartão é o limite utilizado.
  const balanceUsed = opts.openFinanceData && finite(balance) && balance > 0 ? round2(Math.min(balance, topLimit)) : null;
  if (balanceUsed !== null && (topUsed === null || Math.abs(balanceUsed - topUsed) > TOLERANCE)) {
    return {
      limit: topLimit,
      used: balanceUsed,
      available: round2(topLimit - balanceUsed),
      source: 'balance',
      note:
        topUsed === null
          ? null
          : `A Pluggy informou limite disponível de ${formatMoney(topAvailable ?? 0)} (uso de ${formatMoney(topUsed)}), mas o saldo do cartão é ${formatMoney(balanceUsed)}. Em conectores Open Finance o saldo é o limite utilizado, e é ele que o CashFlow usa.`,
      sharedKey: null,
    };
  }

  // 3) Limite − disponível.
  return { limit: topLimit, available: topAvailable, used: topUsed, source: topUsed === null ? null : 'available', note: null, sharedKey: null };
}
