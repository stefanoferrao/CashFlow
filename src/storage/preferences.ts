/**
 * Preferências de interface (não sensíveis).
 * - Tema: localStorage ('cashflow.theme') para ser aplicado antes da primeira pintura.
 * - Demais preferências e layout do dashboard: IndexedDB (store user_preferences / dashboard_layout), sem cifra.
 */
import { APP_CONFIG, type ApiMode } from '../config/app.config';
import { plainRepo } from './repository';

export type ThemePref = 'light' | 'dark' | 'system';

export interface UserPreferences {
  /** Último modo usado: evita reabrir o onboarding a cada visita. */
  mode: 'real' | 'demo' | null;
  apiMode: ApiMode;
  autoLockMinutes: number;
  cacheTtlHours: number;
  includeSandbox: boolean;
  /** Oculta valores na tela (privacidade em locais públicos). */
  hideValues: boolean;
  /** Inclui recorrências estimadas nas projeções. */
  includeEstimates: boolean;
  debug: boolean;
  /** Última versão do app cujas novidades o usuário já viu (aviso "CashFlow atualizado"). */
  lastSeenVersion: string | null;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  mode: null,
  apiMode: 'direct',
  autoLockMinutes: APP_CONFIG.security.defaultAutoLockMinutes,
  cacheTtlHours: APP_CONFIG.cache.defaultTtlHours,
  includeSandbox: false,
  hideValues: false,
  includeEstimates: true,
  debug: false,
  lastSeenVersion: null,
};

const THEME_KEY = 'cashflow.theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

export function applyTheme(pref: ThemePref): 'light' | 'dark' {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.setAttribute('data-theme-pref', pref);
  root.setAttribute('data-theme', resolved);
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  meta.forEach((m) => m.setAttribute('content', resolved === 'dark' ? '#0F1115' : '#F6F7F9'));
  return resolved;
}

export function setThemePref(pref: ThemePref): 'light' | 'dark' {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* armazenamento indisponível: aplica só nesta sessão */
  }
  return applyTheme(pref);
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const saved = await plainRepo.get<Partial<UserPreferences>>('user_preferences', 'prefs');
    return { ...DEFAULT_PREFERENCES, ...(saved ?? {}) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await plainRepo.put('user_preferences', 'prefs', prefs);
}

// ---------- Layout do dashboard ----------

export interface WidgetLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  pinned: boolean;
}

export interface DashboardLayout {
  version: number;
  widgets: WidgetLayout[];
  /** Ordem dos cards no layout em coluna (tablet/mobile). */
  mobileOrder?: string[];
}

export async function loadLayout(): Promise<DashboardLayout | null> {
  try {
    return await plainRepo.get<DashboardLayout>('dashboard_layout', 'main');
  } catch {
    return null;
  }
}

export async function saveLayout(layout: DashboardLayout): Promise<void> {
  await plainRepo.put('dashboard_layout', 'main', layout);
}

export async function clearLayout(): Promise<void> {
  await plainRepo.delete('dashboard_layout', 'main');
}

/** Exporta somente a configuração visual (sem dados financeiros e sem credenciais). */
export async function exportVisualConfig(): Promise<string> {
  const prefs = await loadPreferences();
  const layout = await loadLayout();
  return JSON.stringify(
    {
      app: 'cashflow',
      kind: 'visual-config',
      version: 1,
      exportedAt: new Date().toISOString(),
      theme: getThemePref(),
      preferences: { hideValues: prefs.hideValues, includeEstimates: prefs.includeEstimates },
      dashboardLayout: layout,
    },
    null,
    2,
  );
}

export async function importVisualConfig(json: string): Promise<void> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.');
  }
  const d = data as { app?: string; kind?: string; theme?: ThemePref; preferences?: Partial<UserPreferences>; dashboardLayout?: DashboardLayout | null };
  if (d.app !== 'cashflow' || d.kind !== 'visual-config') throw new Error('Este arquivo não é uma configuração visual do CashFlow.');
  if (d.theme === 'light' || d.theme === 'dark' || d.theme === 'system') setThemePref(d.theme);
  const prefs = await loadPreferences();
  await savePreferences({
    ...prefs,
    hideValues: typeof d.preferences?.hideValues === 'boolean' ? d.preferences.hideValues : prefs.hideValues,
    includeEstimates: typeof d.preferences?.includeEstimates === 'boolean' ? d.preferences.includeEstimates : prefs.includeEstimates,
  });
  if (d.dashboardLayout && Array.isArray(d.dashboardLayout.widgets)) {
    const widgets = d.dashboardLayout.widgets.filter(
      (w) => typeof w.id === 'string' && [w.x, w.y, w.w, w.h].every((n) => Number.isInteger(n) && n >= 0 && n <= 200),
    );
    const mobileOrder = Array.isArray(d.dashboardLayout.mobileOrder) ? d.dashboardLayout.mobileOrder.filter((x) => typeof x === 'string') : undefined;
    await saveLayout({ version: d.dashboardLayout.version ?? 1, widgets, ...(mobileOrder ? { mobileOrder } : {}) });
  }
}
