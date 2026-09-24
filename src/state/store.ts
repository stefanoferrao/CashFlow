/**
 * Estado central (appState). Único ponto de verdade da interface.
 * Componentes leem daqui e disparam ações (state/actions.ts); nenhuma lógica financeira aqui.
 */
import type { VaultMode } from '../security/vault';
import {
  type ConnectorInfo,
  type FinancialDataset,
  type PlannedEntry,
  type UserCategorization,
  type UserLabels,
  emptyCategorization,
  emptyDataset,
  emptyLabels,
} from '../models/finance';
import type { PluggyErrorKind } from '../pluggy/errors';
import { DEFAULT_PREFERENCES, type ThemePref, type UserPreferences } from '../storage/preferences';

export type AppMode = 'booting' | 'onboarding' | 'locked' | 'demo' | 'real';

export interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  /** Etapa atual (ex.: "Banco X: transações"). */
  progress: string | null;
  lastSyncAt: string | null;
  errorKind: PluggyErrorKind | null;
  errorTitle: string | null;
  errorMessage: string | null;
}

export interface ConnectionState {
  hasCredentials: boolean;
  clientIdHint: string | null;
  /** Resultado do último teste/uso das credenciais. */
  status: 'unknown' | 'ok' | 'error';
  lastError: string | null;
  vaultMode: VaultMode | null;
  /** false quando IndexedDB indisponível ou modo sessão. */
  persistent: boolean;
}

export interface AppState {
  mode: AppMode;
  /** Dataset APRESENTADO: dados normalizados + identidades/apelidos aplicados. É o que as páginas usam. */
  dataset: FinancialDataset;
  /** Dados normalizados originais (cache/sincronização), antes das identidades. */
  baseDataset: FinancialDataset;
  /** Identidades das conexões e apelidos de contas/cartões (definidos pelo usuário). */
  labels: UserLabels;
  /** Catálogo de conectores da Pluggy (logo e cor das instituições). */
  connectors: ConnectorInfo[];
  categorization: UserCategorization;
  planned: PlannedEntry[];
  itemIds: string[];
  preferences: UserPreferences;
  theme: { pref: ThemePref; resolved: 'light' | 'dark' };
  sync: SyncState;
  connection: ConnectionState;
  online: boolean;
  /** Mudanças de dados (datasets/categorização) incrementam a versão. */
  dataVersion: number;
}

export const initialState = (): AppState => ({
  mode: 'booting',
  dataset: emptyDataset(),
  baseDataset: emptyDataset(),
  labels: emptyLabels(),
  connectors: [],
  categorization: emptyCategorization(),
  planned: [],
  itemIds: [],
  preferences: { ...DEFAULT_PREFERENCES },
  theme: { pref: 'system', resolved: 'light' },
  sync: { status: 'idle', progress: null, lastSyncAt: null, errorKind: null, errorTitle: null, errorMessage: null },
  connection: { hasCredentials: false, clientIdHint: null, status: 'unknown', lastError: null, vaultMode: null, persistent: true },
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  dataVersion: 0,
});

type Listener = (state: AppState, prev: AppState) => void;

class Store {
  private current: AppState = initialState();
  private readonly listeners = new Set<Listener>();

  get state(): Readonly<AppState> {
    return this.current;
  }

  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
    const prev = this.current;
    const p = typeof patch === 'function' ? patch(prev) : patch;
    const dataChanged = 'dataset' in p || 'categorization' in p || 'planned' in p || 'labels' in p;
    this.current = { ...prev, ...p, dataVersion: dataChanged ? prev.dataVersion + 1 : prev.dataVersion };
    for (const l of this.listeners) l(this.current, prev);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Volta ao estado inicial (bloqueio/logout), preservando tema e preferências. */
  reset(keep: Partial<AppState> = {}): void {
    const prev = this.current;
    this.current = { ...initialState(), theme: prev.theme, preferences: prev.preferences, online: prev.online, ...keep, dataVersion: prev.dataVersion + 1 };
    for (const l of this.listeners) l(this.current, prev);
  }
}

export const store = new Store();
