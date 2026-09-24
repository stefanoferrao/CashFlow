/**
 * Coleta os dados brutos de um Item na Pluggy. O resultado vive apenas em memória:
 * é normalizado em seguida (FinancialDataService) e só o modelo normalizado é persistido (cifrado).
 */
import { APP_CONFIG } from '../config/app.config';
import { addDays, todayKey } from '../utils/dates';
import { sleep } from '../utils/async';
import type { PluggyClient } from './client';
import { PluggyError, toPluggyError } from './errors';
import type { PluggyBill, PluggyInvestmentTransaction, PluggyItem, PluggyTransaction, RawItemBundle } from './types';

export type StepReporter = (message: string) => void;

const PRODUCT_LABEL: Record<string, string> = {
  bills: 'faturas',
  investments: 'investimentos',
  transactions: 'transações',
};

function isSoftFailure(e: PluggyError): boolean {
  // Produto não habilitado no plano / não suportado pela instituição.
  return e.kind === 'forbidden' || e.kind === 'not_found' || e.kind === 'bad_request' || e.kind === 'unavailable_data';
}

export async function fetchItemBundle(client: PluggyClient, itemId: string, report?: StepReporter): Promise<RawItemBundle> {
  const warnings: string[] = [];
  report?.('Consultando status da conexão');
  const item = await client.getItem(itemId);
  const institution = item.connector?.name ?? 'Instituição';

  report?.(`${institution}: contas e cartões`);
  const accounts = await client.getAccounts(itemId);

  const today = todayKey();
  const dateFrom = addDays(today, -APP_CONFIG.pluggy.transactionsHistoryDays);
  const dateTo = addDays(today, APP_CONFIG.pluggy.transactionsFutureDays);

  const transactionsByAccount: Record<string, PluggyTransaction[]> = {};
  const billsByAccount: Record<string, PluggyBill[]> = {};

  report?.(`${institution}: transações`);
  await Promise.all(
    accounts.map(async (acc) => {
      try {
        transactionsByAccount[acc.id] = await client.getAllTransactions(acc.id, dateFrom, dateTo);
      } catch (e) {
        const err = toPluggyError(e);
        if (!isSoftFailure(err)) throw err;
        transactionsByAccount[acc.id] = [];
        warnings.push(`${institution} — ${acc.name}: ${PRODUCT_LABEL.transactions} indisponíveis (${err.title}).`);
      }
      if (acc.type === 'CREDIT') {
        try {
          billsByAccount[acc.id] = await client.getBills(acc.id);
        } catch (e) {
          const err = toPluggyError(e);
          if (!isSoftFailure(err)) throw err;
          billsByAccount[acc.id] = [];
          warnings.push(`${institution} — ${acc.name}: faturas fechadas não disponibilizadas pela instituição.`);
        }
      }
    }),
  );

  report?.(`${institution}: investimentos`);
  let investments: RawItemBundle['investments'] = [];
  try {
    investments = await client.getInvestments(itemId);
  } catch (e) {
    const err = toPluggyError(e);
    if (!isSoftFailure(err)) throw err;
    warnings.push(`${institution}: ${PRODUCT_LABEL.investments} indisponíveis (${err.title}).`);
  }

  // Movimentações de cada investimento (aplicações e resgates): base do cálculo "quanto apliquei × quanto vale hoje".
  const investmentTransactions: Record<string, PluggyInvestmentTransaction[]> = {};
  const active = investments.filter((i) => i.status !== 'TOTAL_WITHDRAWAL').slice(0, 80);
  if (active.length) {
    report?.(`${institution}: movimentações dos investimentos`);
    let unavailable = false;
    let ok = 0;
    let failed = 0;
    for (const inv of active) {
      if (unavailable) break;
      try {
        investmentTransactions[inv.id] = await client.getInvestmentTransactions(inv.id);
        ok++;
      } catch (e) {
        const err = toPluggyError(e);
        if (!isSoftFailure(err)) throw err;
        failed++;
        // Recurso não disponível para esta conexão/plano: não insiste nos demais produtos.
        if (err.kind === 'forbidden' || (ok === 0 && failed >= 3)) unavailable = true;
      }
    }
    if (unavailable) warnings.push(`${institution}: movimentações dos investimentos não disponibilizadas (o rendimento usa os valores informados pela instituição).`);
  }

  return { item, accounts, transactionsByAccount, billsByAccount, investments, investmentTransactions, warnings };
}

const IN_PROGRESS = /IN_PROGRESS$|^CREATING$|^CREATED$|^MERGING$/;

export function isItemBusy(item: Pick<PluggyItem, 'status' | 'executionStatus'>): boolean {
  return item.status === 'UPDATING' || item.status === 'MERGING' || IN_PROGRESS.test(item.executionStatus ?? '');
}

/** Aguarda o Item sair dos estados transitórios (LOGIN pode levar até ~5 minutos). */
export async function waitForItemReady(
  client: PluggyClient,
  itemId: string,
  onStatus?: (item: PluggyItem) => void,
  timeoutMs: number = APP_CONFIG.pluggy.itemPollTimeoutMs,
  intervalMs: number = APP_CONFIG.pluggy.itemPollIntervalMs,
): Promise<PluggyItem> {
  const started = Date.now();
  for (;;) {
    const item = await client.getItem(itemId);
    onStatus?.(item);
    if (!isItemBusy(item)) return item;
    if (Date.now() - started > timeoutMs) return item;
    await sleep(intervalMs);
  }
}
