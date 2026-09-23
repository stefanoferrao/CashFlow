/**
 * Ações da aplicação: orquestram cofre (segurança), repositórios (persistência),
 * cliente Pluggy (API) e normalização, e publicam o resultado no estado central.
 * Nenhum cálculo financeiro acontece aqui.
 */
import { APP_CONFIG } from '../config/app.config';
import {
  type CategoryOverride,
  type CategoryRule,
  type AppCategoryId,
  type NetWorthSnapshot,
  type PlannedEntry,
  type UserCategorization,
  emptyCategorization,
  emptyDataset,
} from '../models/finance';
import { PluggyClient } from '../pluggy/client';
import { openPluggyConnect } from '../pluggy/connect';
import { FRIENDLY_MESSAGES, PluggyError, toPluggyError } from '../pluggy/errors';
import { fetchItemBundle, waitForItemReady } from '../pluggy/sync';
import type { PluggyCategory } from '../pluggy/types';
import { debugLog, setDebugLogging } from '../security/redact';
import * as vault from '../security/vault';
import { isWebCryptoAvailable } from '../security/crypto';
import { CategoryResolver } from '../services/categories';
import { buildDemoDataset } from '../services/demoData';
import { createSnapshot, calculateNetWorth, upsertSnapshot } from '../services/financialCalculator';
import { type NormalizedItemData, mergeItemData, normalizeBundle, normalizeItem } from '../services/financialDataService';
import { deleteDatabase, isPersistent } from '../storage/db';
import {
  type ThemePref,
  type UserPreferences,
  applyTheme,
  getThemePref,
  loadPreferences,
  savePreferences,
  setThemePref,
} from '../storage/preferences';
import { secureRepo } from '../storage/repository';
import { uid } from '../utils/async';
import { todayKey } from '../utils/dates';
import { notify } from './notify';
import { store } from './store';

// ------------------------------------------------------------------ cliente Pluggy

let client: PluggyClient | null = null;

function getClient(): PluggyClient {
  if (!client) {
    const proxy = store.state.preferences.apiMode === 'proxy';
    client = new PluggyClient({
      baseUrl: proxy ? APP_CONFIG.pluggy.proxyBaseUrl : APP_CONFIG.pluggy.directBaseUrl,
      isProxy: proxy,
      credentials: (fn) => vault.useCredentials(fn),
      onRateLimited: (s) => notify('warn', 'Limite da Pluggy atingido', `Aguardando ${s} segundos para continuar a sincronização.`),
    });
  }
  return client;
}

function resetClient(): void {
  client?.clearSession();
  client = null;
}

// ------------------------------------------------------------------ inicialização

export async function boot(): Promise<void> {
  const pref = getThemePref();
  const resolved = applyTheme(pref);
  store.set({ theme: { pref, resolved } });

  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (store.state.theme.pref === 'system') store.set({ theme: { pref: 'system', resolved: applyTheme('system') } });
    });
  }
  window.addEventListener('online', () => store.set({ online: true }));
  window.addEventListener('offline', () => store.set({ online: false }));

  const preferences = await loadPreferences();
  setDebugLogging(preferences.debug);
  store.set({ preferences });

  if (!isWebCryptoAvailable()) {
    store.set({ mode: 'onboarding' });
    notify('error', 'Navegador sem suporte', 'Este navegador não oferece a Web Crypto API (contexto não seguro?). Abra o app via https ou localhost.');
    return;
  }

  if (preferences.mode === 'demo') {
    startDemo(false);
    return;
  }
  if (await vault.vaultExists()) {
    store.set({ mode: 'locked', connection: { ...store.state.connection, hasCredentials: await vault.hasStoredCredentials(), persistent: isPersistent() } });
    return;
  }
  store.set({ mode: 'onboarding' });
}

export function setTheme(pref: ThemePref): void {
  const resolved = setThemePref(pref);
  store.set({ theme: { pref, resolved } });
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<void> {
  const next = { ...store.state.preferences, ...patch };
  store.set({ preferences: next });
  if ('apiMode' in patch) resetClient();
  if ('debug' in patch) setDebugLogging(!!patch.debug);
  try {
    await savePreferences(next);
  } catch {
    notify('warn', 'Preferência não salva', 'O armazenamento local não está disponível neste navegador.');
  }
}

/** Relê as preferências salvas (ex.: após importar configuração visual). */
export async function reloadPreferences(): Promise<void> {
  const preferences = await loadPreferences();
  setDebugLogging(preferences.debug);
  store.set({ preferences });
}

// ------------------------------------------------------------------ modo demonstração

export function startDemo(persist = true): void {
  store.set({
    mode: 'demo',
    dataset: buildDemoDataset(),
    categorization: emptyCategorization(),
    planned: [],
    itemIds: [],
    sync: { status: 'idle', progress: null, lastSyncAt: new Date().toISOString(), errorKind: null, errorTitle: null, errorMessage: null },
  });
  if (persist) void updatePreferences({ mode: 'demo' });
}

export async function exitDemo(): Promise<void> {
  await updatePreferences({ mode: null });
  const hasVault = await vault.vaultExists();
  store.reset({ mode: hasVault ? 'locked' : 'onboarding', preferences: store.state.preferences });
}

// ------------------------------------------------------------------ credenciais e cofre

export interface CredentialSetup {
  clientId: string;
  clientSecret: string;
  /** null = modo sessão (nada persistido). */
  passphrase: string | null;
}

/**
 * Fluxo "Conectar Pluggy": valida formato → prepara cofre → testa autenticação → salva.
 * Credenciais inválidas NÃO são mantidas.
 */
export async function configureCredentials(setup: CredentialSetup, opts: { enterApp?: boolean } = {}): Promise<void> {
  const enter = opts.enterApp ?? true;
  const formatError = vault.validateCredentialFormat(setup);
  if (formatError) throw new Error(formatError);

  if (setup.passphrase === null) {
    await vault.startEphemeralSession();
  } else if (!vault.isUnlocked() || vault.getVaultMode() !== 'passphrase') {
    if (await vault.vaultExists()) await vault.unlock(setup.passphrase);
    else await vault.createVault(setup.passphrase);
  }

  const hadStored = setup.passphrase !== null && (await vault.hasStoredCredentials());
  await vault.saveCredentials(setup);
  resetClient();
  try {
    await getClient().testCredentials();
  } catch (e) {
    const err = toPluggyError(e);
    if (err.kind === 'invalid_credentials' && !hadStored) await vault.removeCredentials();
    store.set({ connection: { ...store.state.connection, status: 'error', lastError: err.message } });
    throw err;
  }
  await updatePreferences({ mode: 'real' });
  store.set({
    ...(enter ? { mode: 'real' as const } : {}),
    connection: {
      hasCredentials: true,
      clientIdHint: await vault.getClientIdHint(),
      status: 'ok',
      lastError: null,
      vaultMode: vault.getVaultMode(),
      persistent: vault.canPersistData(),
    },
  });
  await loadCache();
}

/** Conclui o onboarding e entra no app (sincroniza se houver instituições). */
export function enterApp(): void {
  store.set({ mode: 'real' });
  if (store.state.itemIds.length && store.state.online) void syncAll();
}

export async function unlockVault(passphrase: string): Promise<void> {
  await vault.unlock(passphrase);
  const hasCredentials = await vault.hasStoredCredentials();
  await updatePreferences({ mode: 'real' });
  store.set({
    mode: 'real',
    connection: {
      hasCredentials,
      clientIdHint: hasCredentials ? await vault.getClientIdHint() : null,
      status: 'unknown',
      lastError: null,
      vaultMode: 'passphrase',
      persistent: vault.canPersistData(),
    },
  });
  const stale = await loadCache();
  if (hasCredentials && store.state.itemIds.length && stale && store.state.online) void syncAll();
}

export function lockApp(reason: 'manual' | 'inactivity' = 'manual'): void {
  const wasSession = vault.getVaultMode() === 'session';
  vault.lock();
  resetClient();
  secureRepo.clearMemory();
  store.reset({ mode: wasSession ? 'onboarding' : 'locked', connection: { ...store.state.connection, clientIdHint: null, status: 'unknown', lastError: null, vaultMode: null } });
  if (reason === 'inactivity') notify('info', 'Sessão bloqueada', 'Bloqueamos o app por inatividade. Seus dados continuam cifrados neste navegador.');
}

export async function changePassphrase(current: string, next: string): Promise<void> {
  await vault.changePassphrase(current, next);
  notify('success', 'Senha local alterada');
}

export async function testConnection(): Promise<void> {
  try {
    resetClient();
    await getClient().testCredentials();
    store.set({ connection: { ...store.state.connection, status: 'ok', lastError: null } });
    notify('success', 'Conexão com a Pluggy funcionando', 'As credenciais foram aceitas.');
  } catch (e) {
    const err = toPluggyError(e);
    store.set({ connection: { ...store.state.connection, status: 'error', lastError: err.message } });
    notify('error', err.title, err.message);
  }
}

export async function removeCredentials(): Promise<void> {
  await vault.removeCredentials();
  resetClient();
  store.set({ connection: { ...store.state.connection, hasCredentials: false, clientIdHint: null, status: 'unknown' } });
  notify('success', 'Credenciais removidas', 'O Client ID e o Client Secret foram apagados deste navegador.');
}

/** "Apagar todos os dados locais": banco inteiro, preferências de tema e sessão. */
export async function wipeAllLocalData(): Promise<void> {
  vault.lock();
  resetClient();
  secureRepo.clearMemory();
  await deleteDatabase();
  try {
    localStorage.removeItem('cashflow.theme');
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  store.reset({ mode: 'onboarding', preferences: { ...store.state.preferences, mode: null } });
}

// ------------------------------------------------------------------ cache local

interface ItemRecord {
  itemId: string;
  addedAt: string;
  data: Omit<NormalizedItemData, 'accounts' | 'cards' | 'bills' | 'transactions' | 'investments'> | null;
}

async function readItemParts(): Promise<{ ids: string[]; parts: NormalizedItemData[]; oldest: string | null }> {
  const records = await secureRepo.getAll<ItemRecord>('pluggy_items');
  records.sort((a, b) => a.value.addedAt.localeCompare(b.value.addedAt));
  const parts: NormalizedItemData[] = [];
  let oldest: string | null = null;
  for (const r of records) {
    const meta = r.value.data;
    if (!meta) continue;
    const [accounts, cards, bills, transactions, investments] = await Promise.all([
      secureRepo.get<NormalizedItemData['accounts']>('accounts', r.id),
      secureRepo.get<NormalizedItemData['cards']>('credit_cards', r.id),
      secureRepo.get<NormalizedItemData['bills']>('bills', r.id),
      secureRepo.get<NormalizedItemData['transactions']>('transactions', r.id),
      secureRepo.get<NormalizedItemData['investments']>('investments', r.id),
    ]);
    parts.push({
      ...meta,
      accounts: accounts?.value ?? [],
      cards: cards?.value ?? [],
      bills: bills?.value ?? [],
      transactions: transactions?.value ?? [],
      investments: investments?.value ?? [],
    });
    if (!oldest || meta.fetchedAt < oldest) oldest = meta.fetchedAt;
  }
  return { ids: records.map((r) => r.id), parts, oldest };
}

/** Carrega o cache cifrado. Retorna true se estiver vazio ou desatualizado (deve sincronizar). */
export async function loadCache(): Promise<boolean> {
  const [{ ids, parts, oldest }, snaps, uc, planned] = await Promise.all([
    readItemParts(),
    secureRepo.get<NetWorthSnapshot[]>('snapshots', 'netWorth'),
    secureRepo.get<UserCategorization>('categories', 'user'),
    secureRepo.get<PlannedEntry[]>('categories', 'planned'),
  ]);
  const dataset = parts.length ? mergeItemData(parts, snaps?.value ?? []) : { ...emptyDataset('pluggy'), snapshots: snaps?.value ?? [] };
  store.set({
    dataset,
    itemIds: ids,
    categorization: uc?.value ?? emptyCategorization(),
    planned: planned?.value ?? [],
    sync: { ...store.state.sync, lastSyncAt: oldest },
  });
  if (!oldest) return true;
  const ttl = store.state.preferences.cacheTtlHours * 3600_000;
  return Date.now() - new Date(oldest).getTime() > ttl;
}

async function persistItemData(p: NormalizedItemData, addedAt: string): Promise<void> {
  const { accounts, cards, bills, transactions, investments, ...meta } = p;
  const rec: ItemRecord = { itemId: p.item.id, addedAt, data: meta };
  await Promise.all([
    secureRepo.put('pluggy_items', p.item.id, rec),
    secureRepo.put('accounts', p.item.id, accounts),
    secureRepo.put('credit_cards', p.item.id, cards),
    secureRepo.put('bills', p.item.id, bills),
    secureRepo.put('transactions', p.item.id, transactions),
    secureRepo.put('investments', p.item.id, investments),
  ]);
}

async function getResolver(): Promise<CategoryResolver> {
  try {
    const cached = await secureRepo.get<PluggyCategory[]>('categories', 'pluggyTree');
    if (cached && !cached.expired && cached.value.length) return new CategoryResolver(cached.value);
    const cats = await getClient().getCategories();
    await secureRepo.put('categories', 'pluggyTree', cats, APP_CONFIG.cache.categoriesTtlHours * 3600_000);
    return new CategoryResolver(cats);
  } catch (e) {
    debugLog('sync', 'categorias indisponíveis', toPluggyError(e).kind);
    return new CategoryResolver([]);
  }
}

// ------------------------------------------------------------------ sincronização

let syncInFlight: Promise<void> | null = null;

function setSync(patch: Partial<typeof store.state.sync>): void {
  store.set({ sync: { ...store.state.sync, ...patch } });
}

/** "Atualizar agora": baixa novamente os dados de todos os Items da Pluggy. */
export function syncAll(opts: { onlyItemId?: string } = {}): Promise<void> {
  if (store.state.mode === 'demo') {
    setSync({ status: 'syncing', progress: 'Atualizando dados de demonstração' });
    return new Promise((r) =>
      setTimeout(() => {
        store.set({ dataset: buildDemoDataset() });
        setSync({ status: 'idle', progress: null, lastSyncAt: new Date().toISOString() });
        r();
      }, 700),
    );
  }
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync(opts.onlyItemId).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runSync(onlyItemId?: string): Promise<void> {
  const st = store.state;
  if (st.mode !== 'real' || !vault.isUnlocked()) return;
  if (!st.connection.hasCredentials) {
    notify('warn', 'Pluggy não configurada', 'Informe seu Client ID e Client Secret em Configurações → Pluggy.');
    return;
  }
  if (!st.online) {
    setSync({ status: 'error', errorKind: 'offline', errorTitle: FRIENDLY_MESSAGES.offline.title, errorMessage: FRIENDLY_MESSAGES.offline.message });
    return;
  }
  const ids = onlyItemId ? [onlyItemId] : st.itemIds;
  if (!ids.length) return;

  setSync({ status: 'syncing', progress: 'Autenticando na Pluggy', errorKind: null, errorTitle: null, errorMessage: null });
  const c = getClient();
  try {
    await c.authenticate();
    store.set({ connection: { ...store.state.connection, status: 'ok', lastError: null } });
  } catch (e) {
    const err = toPluggyError(e);
    store.set({ connection: { ...store.state.connection, status: 'error', lastError: err.message } });
    setSync({ status: 'error', progress: null, errorKind: err.kind, errorTitle: err.title, errorMessage: err.message });
    notify('error', err.title, err.message);
    return;
  }

  const resolver = await getResolver();
  const existing = await secureRepo.getAll<ItemRecord>('pluggy_items');
  const addedAtById = new Map(existing.map((r) => [r.id, r.value.addedAt]));
  const failures: Array<{ id: string; err: PluggyError }> = [];
  const warnings: string[] = [];

  for (const id of ids) {
    try {
      const bundle = await fetchItemBundle(c, id, (msg) => setSync({ progress: msg }));
      const normalized = normalizeBundle(bundle, resolver);
      warnings.push(...normalized.warnings);
      await persistItemData(normalized, addedAtById.get(id) ?? new Date().toISOString());
    } catch (e) {
      const err = toPluggyError(e);
      failures.push({ id, err });
      debugLog('sync', 'falha no item', id, err.kind, err.debugDetail);
      // Mantém os dados antigos do item e registra o erro no próprio item.
      const prev = existing.find((r) => r.id === id);
      if (prev?.value.data) {
        const data = { ...prev.value.data, item: { ...prev.value.data.item, syncState: 'error' as const, message: err.message } };
        await secureRepo.put('pluggy_items', id, { ...prev.value, data });
      }
    }
  }

  await loadCache();

  // Registro diário do patrimônio (base do histórico/evolução).
  if (failures.length < ids.length) {
    const ds = store.state.dataset;
    const nw = calculateNetWorth(ds.accounts, ds.investments, ds.cards);
    const snaps = upsertSnapshot(ds.snapshots, createSnapshot(todayKey(), nw));
    await secureRepo.put('snapshots', 'netWorth', snaps);
    store.set({ dataset: { ...store.state.dataset, snapshots: snaps } });
  }

  if (failures.length === ids.length) {
    const err = failures[0]!.err;
    setSync({ status: 'error', progress: null, errorKind: err.kind, errorTitle: err.title, errorMessage: err.message });
    notify('error', err.title, err.message);
  } else {
    setSync({ status: 'idle', progress: null, lastSyncAt: new Date().toISOString() });
    if (failures.length) notify('warn', 'Sincronização parcial', `${failures.length} conexão(ões) não puderam ser atualizadas. Veja Contas → Instituições.`);
    else notify('success', 'Dados atualizados', warnings.length ? `${warnings.length} aviso(s) de dados indisponíveis.` : undefined);
  }
}

// ------------------------------------------------------------------ instituições (Items)

const ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function registerItem(itemId: string): Promise<void> {
  const existing = await secureRepo.get<ItemRecord>('pluggy_items', itemId);
  if (!existing) await secureRepo.put('pluggy_items', itemId, { itemId, addedAt: new Date().toISOString(), data: null } satisfies ItemRecord);
  if (!store.state.itemIds.includes(itemId)) store.set({ itemIds: [...store.state.itemIds, itemId] });
}

/** Adiciona um Item pelo ID (fluxo Meu Pluggy / Dashboard da Pluggy). */
export async function addItemById(rawId: string): Promise<void> {
  const itemId = rawId.trim();
  if (!ITEM_ID.test(itemId)) throw new Error('O Item ID deve estar no formato UUID. Copie-o no Dashboard da Pluggy (menu ⋯ → "Copiar Item ID").');
  if (store.state.itemIds.includes(itemId)) throw new Error('Esta instituição já está adicionada.');
  // Valida antes de registrar.
  await getClient().getItem(itemId);
  await registerItem(itemId);
  await syncAll({ onlyItemId: itemId });
}

/** Descobre Items da aplicação via GET /v2/items (recurso opt-in da Pluggy). */
export async function discoverItems(): Promise<number> {
  const items = await getClient().listItems();
  let added = 0;
  for (const it of items) {
    if (!store.state.itemIds.includes(it.id)) {
      await registerItem(it.id);
      added++;
    }
  }
  if (added) await syncAll();
  return added;
}

/** "Adicionar instituição": abre o Pluggy Connect com um connect token criado no navegador. */
export async function connectInstitution(updateItemId?: string): Promise<boolean> {
  const c = getClient();
  setSync({ status: 'syncing', progress: 'Preparando o Pluggy Connect' });
  let token: string;
  try {
    token = await c.createConnectToken(updateItemId);
  } catch (e) {
    const err = toPluggyError(e);
    setSync({ status: 'idle', progress: null });
    notify('error', err.title, err.message);
    return false;
  }
  setSync({ status: 'idle', progress: null });
  let result;
  try {
    result = await openPluggyConnect({
      connectToken: token,
      includeSandbox: store.state.preferences.includeSandbox,
      theme: store.state.theme.resolved,
      ...(updateItemId ? { updateItemId } : {}),
    });
  } catch (e) {
    notify('error', 'Pluggy Connect indisponível', e instanceof Error ? e.message : String(e));
    return false;
  }
  if (result.status === 'closed') return false;
  if (result.status === 'error' || !result.item) {
    notify('error', 'Conexão não concluída', result.message ?? 'O Pluggy Connect informou um erro. Tente novamente.');
    return false;
  }
  const itemId = result.item.id;
  await registerItem(itemId);
  setSync({ status: 'syncing', progress: `${result.item.connector?.name ?? 'Instituição'}: aguardando a coleta da Pluggy` });
  try {
    const ready = await waitForItemReady(c, itemId, (it) => setSync({ progress: `${it.connector?.name ?? 'Instituição'}: ${it.executionStatus}` }));
    const n = normalizeItem(ready);
    if (n.syncState === 'action_required' || n.syncState === 'error') notify('warn', n.institution.name, n.message ?? 'A conexão precisa de atenção.');
  } catch (e) {
    const err = toPluggyError(e);
    notify('warn', err.title, err.message);
  }
  setSync({ status: 'idle', progress: null });
  await syncAll({ onlyItemId: itemId });
  notify('success', 'Instituição conectada', result.item.connector?.name);
  return true;
}

/** Pede à Pluggy uma nova coleta na instituição (PATCH /items/{id}). */
export async function requestInstitutionRefresh(itemId: string): Promise<void> {
  try {
    await getClient().updateItem(itemId);
    notify('info', 'Atualização solicitada', 'A Pluggy vai coletar os dados novamente na instituição. Isso pode levar alguns minutos.');
    setSync({ status: 'syncing', progress: 'Aguardando a Pluggy concluir a coleta' });
    await waitForItemReady(getClient(), itemId);
    setSync({ status: 'idle', progress: null });
    await syncAll({ onlyItemId: itemId });
  } catch (e) {
    const err = toPluggyError(e);
    setSync({ status: 'idle', progress: null });
    notify(err.kind === 'item_cannot_update' ? 'info' : 'error', err.title, err.message);
  }
}

/** Remove a instituição DESTE navegador (não exclui o Item na Pluggy). */
export async function removeItemLocally(itemId: string): Promise<void> {
  await Promise.all([
    secureRepo.delete('pluggy_items', itemId),
    secureRepo.delete('accounts', itemId),
    secureRepo.delete('credit_cards', itemId),
    secureRepo.delete('bills', itemId),
    secureRepo.delete('transactions', itemId),
    secureRepo.delete('investments', itemId),
  ]);
  await loadCache();
  notify('success', 'Instituição removida deste navegador', 'Para revogar o acesso de fato, remova o item no Dashboard da Pluggy ou no Meu Pluggy.');
}

/** Limpa somente o cache financeiro (mantém credenciais e Items registrados). */
export async function clearFinancialCache(): Promise<void> {
  const ids = [...store.state.itemIds];
  await secureRepo.clearAll();
  for (const id of ids) await secureRepo.put('pluggy_items', id, { itemId: id, addedAt: new Date().toISOString(), data: null } satisfies ItemRecord);
  await loadCache();
  notify('success', 'Cache local apagado', 'Os Items continuam registrados; use "Atualizar agora" para baixar os dados novamente.');
}

// ------------------------------------------------------------------ categorização e previstos

async function saveCategorization(uc: UserCategorization): Promise<void> {
  store.set({ categorization: uc });
  if (store.state.mode === 'real') await secureRepo.put('categories', 'user', uc);
}

export async function setTransactionOverride(txId: string, override: CategoryOverride | null): Promise<void> {
  const uc = store.state.categorization;
  const overrides = { ...uc.overrides };
  if (override) overrides[txId] = { ...overrides[txId], ...override };
  else delete overrides[txId];
  await saveCategorization({ ...uc, overrides });
}

export async function addCategoryRule(rule: Omit<CategoryRule, 'id'>): Promise<void> {
  const uc = store.state.categorization;
  await saveCategorization({ ...uc, rules: [...uc.rules, { ...rule, id: uid('rule') }] });
}

export async function removeCategoryRule(id: string): Promise<void> {
  const uc = store.state.categorization;
  await saveCategorization({ ...uc, rules: uc.rules.filter((r) => r.id !== id) });
}

export async function addCustomSubcategory(category: AppCategoryId, name: string): Promise<void> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  const uc = store.state.categorization;
  const list = uc.customSubcategories[category] ?? [];
  if (list.includes(clean)) return;
  await saveCategorization({ ...uc, customSubcategories: { ...uc.customSubcategories, [category]: [...list, clean] } });
}

export async function addPlannedEntry(entry: Omit<PlannedEntry, 'id'>): Promise<void> {
  const planned = [...store.state.planned, { ...entry, id: uid('plan') }];
  store.set({ planned });
  if (store.state.mode === 'real') await secureRepo.put('categories', 'planned', planned);
}

export async function removePlannedEntry(id: string): Promise<void> {
  const planned = store.state.planned.filter((p) => p.id !== id);
  store.set({ planned });
  if (store.state.mode === 'real') await secureRepo.put('categories', 'planned', planned);
}

// ------------------------------------------------------------------ bloqueio automático

let lastActivity = Date.now();
let autoLockTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoLock(): void {
  const bump = () => {
    lastActivity = Date.now();
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, bump, { passive: true });
  if (autoLockTimer) clearInterval(autoLockTimer);
  autoLockTimer = setInterval(() => {
    const minutes = store.state.preferences.autoLockMinutes;
    if (!minutes || store.state.mode !== 'real') return;
    if (Date.now() - lastActivity > minutes * 60_000) lockApp('inactivity');
  }, 15_000);
}
