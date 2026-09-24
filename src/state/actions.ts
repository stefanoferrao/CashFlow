/**
 * Ações da aplicação: orquestram cofre (segurança), repositórios (persistência),
 * cliente Pluggy (API) e normalização, e publicam o resultado no estado central.
 * Nenhum cálculo financeiro acontece aqui.
 */
import { APP_CONFIG } from '../config/app.config';
import {
  type CardCycleSetting,
  type CategoryOverride,
  type CategoryRule,
  type AppCategoryId,
  type ConnectorInfo,
  type InstitutionIdentity,
  type NetWorthSnapshot,
  type PlannedEntry,
  type ProductLogo,
  type UserCategorization,
  type UserLabels,
  emptyCategorization,
  emptyDataset,
  emptyLabels,
  normalizeLabels,
} from '../models/finance';
import { PluggyClient } from '../pluggy/client';
import { oauthRedirectUriFor, openPluggyConnect } from '../pluggy/connect';
import { FRIENDLY_MESSAGES, PluggyError, toPluggyError } from '../pluggy/errors';
import { fetchItemBundle, waitForItemReady } from '../pluggy/sync';
import type { PluggyCategory } from '../pluggy/types';
import { debugLog, setDebugLogging } from '../security/redact';
import * as vault from '../security/vault';
import { isWebCryptoAvailable } from '../security/crypto';
import { CategoryResolver } from '../services/categories';
import { buildDemoDataset } from '../services/demoData';
import { createSnapshot, calculateNetWorth, upsertSnapshot } from '../services/financialCalculator';
import { applyIdentities, isHexColor, toHexColor, validDay } from '../services/institutions';
import { bankIcon, isAllowedLogoUrl, isLocalIconUrl, isUploadedLogo } from '../services/bankIcons';
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
import { notify, notifyAction } from './notify';
import { type AppState, store } from './store';

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

/**
 * Publica dados no estado: guarda o dataset original e o dataset APRESENTADO
 * (identidades das instituições, apelidos e ciclos manuais aplicados — services/institutions.ts).
 */
function setData(patch: Partial<AppState> = {}): void {
  const s = store.state;
  const baseDataset = patch.baseDataset ?? s.baseDataset;
  const labels = patch.labels ?? s.labels;
  const connectors = patch.connectors ?? s.connectors;
  store.set({ ...patch, baseDataset, labels, connectors, dataset: applyIdentities(baseDataset, labels, connectors) });
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
  capturePendingConnect();
  if (preferences.mode === null && preferences.lastSeenVersion === null) {
    newInstall = true;
    void updatePreferences({ lastSeenVersion: APP_CONFIG.version });
  }

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

// ------------------------------------------------------------------ novidades da versão

let versionAnnounced = false;
/** Primeira abertura do app neste navegador (sem preferências salvas): não há "atualização" a anunciar. */
let newInstall = false;

/**
 * Depois de uma atualização do app, avisa uma única vez: "CashFlow atualizado para a versão X — Ver novidades".
 * Na primeira instalação não há aviso (não há o que comparar).
 */
export function announceNewVersion(open: () => void): void {
  if (versionAnnounced) return;
  versionAnnounced = true;
  const prefs = store.state.preferences;
  if (prefs.lastSeenVersion === APP_CONFIG.version || newInstall) return;
  void updatePreferences({ lastSeenVersion: APP_CONFIG.version });
  notifyAction('info', `CashFlow atualizado para a versão ${APP_CONFIG.version}`, 'Veja o que mudou nas Notas de Atualização.', { label: 'Ver novidades', run: open }, { durationMs: 15000 });
}

/** Chamado ao abrir as Notas de Atualização. */
export async function markVersionSeen(): Promise<void> {
  if (store.state.preferences.lastSeenVersion !== APP_CONFIG.version) await updatePreferences({ lastSeenVersion: APP_CONFIG.version });
}

// ------------------------------------------------------------------ modo demonstração

export function startDemo(persist = true): void {
  setData({
    mode: 'demo',
    baseDataset: buildDemoDataset(),
    labels: emptyLabels(),
    connectors: [],
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
  void resumePendingConnect();
}

// ------------------------------------------------------------------ retorno da autorização no banco (celular)

const PENDING_KEY = 'cashflow.pendingItem';

/**
 * No celular, depois de autorizar no app do banco, a Pluggy devolve o usuário ao endereço do CashFlow
 * (`oauthRedirectUri`). Se o endereço trouxer o ID da conexão, ele é guardado (só nesta aba) para ser
 * registrado assim que o app for desbloqueado — e a URL é limpa.
 */
function capturePendingConnect(): void {
  try {
    const q = new URLSearchParams(location.search);
    const raw = q.get('itemId') ?? q.get('item_id') ?? q.get('item') ?? '';
    if (!raw && ![...q.keys()].some((k) => /^(itemid|item_id|item|status|error|code|state)$/i.test(k))) return;
    if (ITEM_ID.test(raw)) sessionStorage.setItem(PENDING_KEY, raw.toLowerCase());
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
  } catch {
    /* sem sessionStorage/history: ignora */
  }
}

async function resumePendingConnect(): Promise<void> {
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(PENDING_KEY);
    if (id) sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return;
  }
  if (!id || store.state.mode !== 'real' || !store.state.connection.hasCredentials) return;
  if (store.state.itemIds.includes(id)) return;
  try {
    await getClient().getItem(id);
    await registerItem(id);
    await syncAll({ onlyItemId: id });
    notify('success', 'Conexão concluída', 'A autorização no banco foi concluída e a conexão foi adicionada ao CashFlow.');
  } catch (e) {
    const err = toPluggyError(e);
    debugLog('connect', 'retorno da autorização não registrado', err.kind);
  }
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
  else if (hasCredentials) void ensureConnectors();
  if (hasCredentials) void resumePendingConnect();
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
  // Logos guardados pelo app instalado indicam quais instituições apareceram na tela: também saem.
  // (Os arquivos do próprio app ficam, para ele continuar abrindo offline.)
  try {
    if ('caches' in window) await Promise.all(['cashflow-banks-v1', 'cashflow-logos-v1'].map((k) => caches.delete(k)));
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
  const [{ ids, parts, oldest }, snaps, uc, planned, labels, connectors] = await Promise.all([
    readItemParts(),
    secureRepo.get<NetWorthSnapshot[]>('snapshots', 'netWorth'),
    secureRepo.get<UserCategorization>('categories', 'user'),
    secureRepo.get<PlannedEntry[]>('categories', 'planned'),
    secureRepo.get<UserLabels>('categories', 'labels'),
    secureRepo.get<ConnectorInfo[]>('categories', 'connectors'),
  ]);
  const dataset = parts.length ? mergeItemData(parts, snaps?.value ?? []) : { ...emptyDataset('pluggy'), snapshots: snaps?.value ?? [] };
  setData({
    baseDataset: dataset,
    labels: normalizeLabels(labels?.value),
    connectors: connectors?.value ?? [],
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
        setData({ baseDataset: buildDemoDataset() });
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
    setData({ baseDataset: { ...store.state.baseDataset, snapshots: snaps } });
    void ensureConnectors();
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

/**
 * Identificador estável do usuário para a Pluggy (`clientUserId`): derivado do Client ID por SHA-256 — o mesmo valor
 * em qualquer aparelho, sem revelar o Client ID. A Pluggy agrupa as conexões por ele e o usa para barrar duplicatas.
 */
async function pluggyUserId(): Promise<string | undefined> {
  try {
    const clientId = await vault.useCredentials(async (c) => c.clientId);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cashflow|${clientId.trim().toLowerCase()}`));
    return `cashflow-${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)}`;
  } catch {
    return undefined;
  }
}

export function isMeuPluggyItem(itemId: string): boolean {
  const it = store.state.baseDataset.items.find((i) => i.id === itemId) ?? store.state.dataset.items.find((i) => i.id === itemId);
  return !!it && it.institution.connectorId === APP_CONFIG.pluggy.meuPluggyConnectorId;
}

/**
 * A Pluggy recusou criar uma conexão repetida (mesmas credenciais) e informou as que já existem:
 * em vez de mostrar erro, o CashFlow passa a usar a conexão existente — sem criar outra.
 */
async function adoptExistingItems(ids: string[]): Promise<boolean> {
  const already = ids.find((id) => store.state.itemIds.includes(id));
  if (already) {
    notify('info', 'Esta conta já está conectada', 'A Pluggy identificou que essas credenciais já têm uma conexão, e ela já está no CashFlow. Os dados dela serão atualizados agora.');
    await syncAll({ onlyItemId: already });
    return true;
  }
  const c = getClient();
  setSync({ status: 'syncing', progress: 'Recuperando a conexão que já existe na Pluggy' });
  const found = (await Promise.allSettled(ids.slice(0, 10).map((id) => c.getItem(id))))
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof c.getItem>>> => r.status === 'fulfilled')
    .map((r) => r.value);
  setSync({ status: 'idle', progress: null });
  if (!found.length) {
    notify('error', 'Conexão repetida', 'A Pluggy informou que essa conta já está conectada, mas a conexão existente não pôde ser lida. Use "Tenho um Item ID" com o ID mostrado no Dashboard da Pluggy.');
    return false;
  }
  // Prefere a conexão saudável e mais recente.
  const score = (it: (typeof found)[number]) => (it.status === 'UPDATED' ? 2 : it.status === 'UPDATING' ? 1 : 0);
  found.sort((a, b) => score(b) - score(a) || (b.lastUpdatedAt ?? b.updatedAt ?? '').localeCompare(a.lastUpdatedAt ?? a.updatedAt ?? ''));
  const chosen = found[0]!;
  await registerItem(chosen.id);
  await syncAll({ onlyItemId: chosen.id });
  notify(
    'success',
    'Conexão existente reaproveitada',
    `${chosen.connector?.name ?? 'Instituição'}: a Pluggy já tinha esta conexão e ela foi adicionada ao CashFlow — nenhuma conexão nova foi criada.${found.length > 1 ? ` Há ${found.length} conexões com as mesmas credenciais na sua aplicação; as demais podem ser excluídas no Dashboard da Pluggy.` : ''}`,
  );
  return true;
}

/** "Adicionar instituição": abre o Pluggy Connect com um connect token criado no navegador. */
export async function connectInstitution(updateItemId?: string): Promise<boolean> {
  if (updateItemId && isMeuPluggyItem(updateItemId)) {
    notify(
      'info',
      'Conexão do Meu Pluggy',
      'Conexões do Meu Pluggy são reconectadas e atualizadas no próprio Meu Pluggy (meu.pluggy.ai). O CashFlow recebe as mudanças automaticamente — use "Atualizar dados".',
    );
    return false;
  }
  const c = getClient();
  setSync({ status: 'syncing', progress: 'Preparando o Pluggy Connect' });
  const clientUserId = await pluggyUserId();
  const oauthRedirectUri = oauthRedirectUriFor(location);
  const tokenOpts = { ...(updateItemId ? { itemId: updateItemId } : {}), ...(clientUserId ? { clientUserId } : {}) };
  let token: string;
  try {
    token = await c.createConnectToken({ ...tokenOpts, ...(oauthRedirectUri ? { oauthRedirectUri } : {}) });
  } catch (e) {
    let err = toPluggyError(e);
    let recovered: string | null = null;
    // Algumas aplicações recusam um endereço de retorno não cadastrado: tenta de novo sem ele.
    if (oauthRedirectUri && err.kind === 'bad_request') {
      try {
        recovered = await c.createConnectToken(tokenOpts);
      } catch (e2) {
        err = toPluggyError(e2);
      }
    }
    if (!recovered) {
      setSync({ status: 'idle', progress: null });
      notify('error', err.title, err.message);
      return false;
    }
    token = recovered;
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
    debugLog('connect', 'erro do widget', result.error?.code ?? '', result.error?.message ?? '');
    if (result.error?.duplicate && result.error.existingItemIds.length) return adoptExistingItems(result.error.existingItemIds);
    if (result.item) {
      const n = normalizeItem(result.item);
      notify('error', `Conexão não concluída — ${n.institution.name}`, n.message ?? 'A instituição recusou o acesso. Confira os dados e tente novamente.');
      return false;
    }
    notify(
      'error',
      'Conexão não concluída',
      result.error?.duplicate
        ? 'A Pluggy informou que esta conta já está conectada à sua aplicação. Use "Tenho um Item ID" com o ID mostrado no Dashboard da Pluggy (ou no Meu Pluggy).'
        : 'O Pluggy Connect informou um erro. Tente novamente em instantes; se persistir, confira no Dashboard da Pluggy se o conector está habilitado para a sua aplicação.',
    );
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
  notify('success', updateItemId ? 'Instituição reconectada' : 'Instituição conectada', result.item.connector?.name);
  if (!updateItemId) void offerDuplicateCleanup(itemId);
  return true;
}

/**
 * Depois de uma conexão nova: se ela repete outra já registrada (mesmo conector e mesmas contas/cartões),
 * oferece manter só a nova — a antiga já fica fora dos totais para não somar o mesmo dinheiro duas vezes.
 */
async function offerDuplicateCleanup(newItemId: string): Promise<void> {
  const dups = (store.state.baseDataset.duplicates ?? []).filter((d) => d.duplicateOf === newItemId);
  if (!dups.length) return;
  const { confirmDialog } = await import('../components/modal');
  const ok = await confirmDialog({
    title: 'Conexão repetida',
    message: `Esta instituição já estava conectada (${dups.length === 1 ? 'uma conexão anterior' : `${dups.length} conexões anteriores`} com as mesmas contas). A conexão antiga já foi desconsiderada nos totais. Remover a antiga deste navegador e excluí-la na Pluggy, para não acumular conexões?`,
    confirmLabel: 'Manter só a nova',
  });
  if (!ok) return;
  await removeDuplicateItems(dups.map((d) => d.itemId), true);
}

/** Remove conexões repetidas deste navegador (e, se pedido, exclui na Pluggy). */
export async function removeDuplicateItems(itemIds: string[], alsoOnPluggy: boolean): Promise<void> {
  let deleted = 0;
  for (const id of itemIds) {
    if (alsoOnPluggy && store.state.mode === 'real') {
      try {
        await getClient().deleteItem(id);
        deleted++;
      } catch (e) {
        debugLog('items', 'não excluído na Pluggy', id, toPluggyError(e).kind);
      }
    }
    await removeItemLocally(id, true);
  }
  await loadCache();
  notify('success', 'Conexões repetidas removidas', alsoOnPluggy ? `${itemIds.length} removida(s) deste navegador${deleted ? ` e ${deleted} excluída(s) na Pluggy` : ''}.` : `${itemIds.length} removida(s) deste navegador.`);
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
export async function removeItemLocally(itemId: string, quiet = false): Promise<void> {
  await Promise.all([
    secureRepo.delete('pluggy_items', itemId),
    secureRepo.delete('accounts', itemId),
    secureRepo.delete('credit_cards', itemId),
    secureRepo.delete('bills', itemId),
    secureRepo.delete('transactions', itemId),
    secureRepo.delete('investments', itemId),
  ]);
  // Personalizações da conexão (nome, aparência, apelidos e ciclos dos cartões dela) também saem.
  const ds = store.state.baseDataset;
  const ownIds = new Set([...ds.accounts, ...ds.cards].filter((x) => x.itemId === itemId).map((x) => x.id));
  const cur = store.state.labels;
  if (cur.identities[itemId] || [...ownIds].some((id) => cur.nicknames[id] || cur.cardCycles[id] || cur.productLogos[id])) {
    const identities = { ...cur.identities };
    delete identities[itemId];
    const keep = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([id]) => !ownIds.has(id)));
    await secureRepo.put('categories', 'labels', {
      identities,
      nicknames: keep(cur.nicknames),
      cardCycles: keep(cur.cardCycles),
      productLogos: keep(cur.productLogos),
    } satisfies UserLabels);
  }
  if (quiet) return;
  await loadCache();
  notify('success', 'Instituição removida deste navegador', 'Para revogar o acesso de fato, remova o item no Dashboard da Pluggy ou no Meu Pluggy.');
}

/** Limpa somente o cache financeiro (mantém credenciais e Items registrados). */
export async function clearFinancialCache(): Promise<void> {
  const ids = [...store.state.itemIds];
  // Preserva o que é do usuário (categorização, previstos e personalizações) — só os dados financeiros saem.
  const keep = await Promise.all((['user', 'planned', 'labels'] as const).map(async (k) => [k, await secureRepo.get<unknown>('categories', k)] as const));
  await secureRepo.clearAll();
  for (const [k, rec] of keep) if (rec) await secureRepo.put('categories', k, rec.value);
  for (const id of ids) await secureRepo.put('pluggy_items', id, { itemId: id, addedAt: new Date().toISOString(), data: null } satisfies ItemRecord);
  await loadCache();
  notify('success', 'Cache local apagado', 'Os Items continuam registrados; use "Atualizar agora" para baixar os dados novamente.');
}

// ------------------------------------------------------------------ identidade das instituições

const CONNECTORS_TTL_MS = 7 * 24 * 3600_000;

export interface CatalogResult {
  ok: boolean;
  /** Motivo amigável quando não foi possível obter o catálogo. */
  message?: string;
}

/**
 * Catálogo de conectores da Pluggy (GET /connectors) — logo e cor oficiais para instituições que não estão
 * na biblioteca local de ícones. Cache cifrado de 7 dias. Chamado ao desbloquear, após sincronizar e
 * sob demanda na personalização (com mensagem de erro visível).
 */
export async function ensureConnectors(force = false): Promise<CatalogResult> {
  if (store.state.mode !== 'real') return { ok: false, message: 'No modo demonstração o catálogo da Pluggy não é usado.' };
  if (!vault.isUnlocked() || !store.state.connection.hasCredentials) return { ok: false, message: 'Configure as credenciais da Pluggy para usar o catálogo.' };
  const cached = await secureRepo.get<ConnectorInfo[]>('categories', 'connectors');
  if (!force && cached && !cached.expired && cached.value.length) {
    if (!store.state.connectors.length) setData({ connectors: cached.value });
    return { ok: true };
  }
  if (!store.state.online) {
    if (cached?.value.length && !store.state.connectors.length) setData({ connectors: cached.value });
    return { ok: !!cached?.value.length, message: 'Sem conexão com a internet.' };
  }
  const client = getClient();
  let list: Awaited<ReturnType<typeof client.getConnectors>> = [];
  let lastErr: unknown = null;
  // Alguns ambientes recusam o filtro por país; tenta sem ele antes de desistir.
  for (const country of [true, false]) {
    try {
      list = await client.getConnectors(country);
      if (list.length) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!list.length) {
    const err = lastErr ? toPluggyError(lastErr) : null;
    debugLog('connectors', 'catálogo indisponível', err?.kind ?? 'vazio');
    if (cached?.value.length && !store.state.connectors.length) setData({ connectors: cached.value });
    return { ok: !!cached?.value.length, message: err ? `${err.title}: ${err.message}` : 'A Pluggy não retornou instituições.' };
  }
  const info: ConnectorInfo[] = list
    .filter((c) => typeof c.id === 'number' && typeof c.name === 'string')
    .map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: typeof c.imageUrl === 'string' && /^https:\/\/[^\s"'<>]+$/.test(c.imageUrl) ? c.imageUrl : null,
      primaryColor: toHexColor(c.primaryColor ?? null),
      type: c.type ?? null,
      isOpenFinance: !!c.isOpenFinance,
    }));
  await secureRepo.put('categories', 'connectors', info, CONNECTORS_TTL_MS);
  setData({ connectors: info });
  return { ok: true };
}

async function saveLabels(labels: UserLabels): Promise<void> {
  setData({ labels });
  if (store.state.mode === 'real') await secureRepo.put('categories', 'labels', labels);
}

function cleanIdentity(i: InstitutionIdentity): InstitutionIdentity | null {
  const name = i.name.trim().slice(0, 40);
  if (!name) return null;
  const bank = bankIcon(i.bank)?.slug ?? null;
  const imageUrl = !bank && isAllowedLogoUrl(i.imageUrl) && !isLocalIconUrl(i.imageUrl) ? i.imageUrl : null;
  const hasImage = !!(bank || imageUrl);
  return {
    name,
    color: isHexColor(i.color) ? i.color.toUpperCase() : '#64748B',
    logo: i.logo === 'image' && !hasImage ? 'initials' : i.logo,
    icon: i.logo === 'icon' ? i.icon : null,
    connectorId: imageUrl && /^https:/.test(imageUrl) ? i.connectorId : null,
    imageUrl,
    bank,
    updatedAt: new Date().toISOString(),
  };
}

function cleanProductLogo(p: ProductLogo | null): ProductLogo | null {
  if (!p) return null;
  if (p.inherit) return { bank: null, imageUrl: null, inherit: true };
  const bank = bankIcon(p.bank)?.slug ?? null;
  const imageUrl = !bank && isUploadedLogo(p.imageUrl) ? p.imageUrl : null;
  return bank || imageUrl ? { bank, imageUrl } : null;
}

/**
 * Salva a personalização de uma conexão: identidade (null = voltar ao automático)
 * e apelidos das contas/cartões dela (string vazia = remover apelido).
 */
export async function saveInstitutionCustomization(
  itemId: string,
  identity: InstitutionIdentity | null,
  nicknames: Record<string, string>,
  productLogos: Record<string, ProductLogo | null> = {},
): Promise<void> {
  const cur = store.state.labels;
  const identities = { ...cur.identities };
  const clean = identity ? cleanIdentity(identity) : null;
  if (clean) identities[itemId] = clean;
  else delete identities[itemId];
  const nick = { ...cur.nicknames };
  for (const [id, value] of Object.entries(nicknames)) {
    const v = value.trim().slice(0, 40);
    if (v) nick[id] = v;
    else delete nick[id];
  }
  const logos = { ...cur.productLogos };
  for (const [id, value] of Object.entries(productLogos)) {
    const v = cleanProductLogo(value);
    if (v) logos[id] = v;
    else delete logos[id];
  }
  await saveLabels({ ...cur, identities, nicknames: nick, productLogos: logos });
  notify('success', 'Personalização salva', 'O novo nome e a aparência já valem em todo o app.');
}

/** Dias de fechamento/vencimento de um cartão (null = usar só o que a instituição informa). */
export async function setCardCycle(cardId: string, cycle: CardCycleSetting | null): Promise<void> {
  const cur = store.state.labels;
  const cardCycles = { ...cur.cardCycles };
  const closingDay = validDay(cycle?.closingDay);
  const dueDay = validDay(cycle?.dueDay);
  if (closingDay || dueDay) cardCycles[cardId] = { closingDay, dueDay };
  else delete cardCycles[cardId];
  await saveLabels({ ...cur, cardCycles });
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
