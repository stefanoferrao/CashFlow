/**
 * Notas de Atualização — lidas das Releases públicas do repositório no GitHub.
 *
 * - Só é consultado quando a tela "Notas de Atualização" é aberta (nunca em segundo plano).
 * - Requisição anônima (sem cookies, sem referrer). Nenhum dado financeiro ou credencial é enviado.
 * - Cache local de 6 horas (conteúdo público) e, sem internet, as notas desta versão que vêm dentro do app.
 */
import { APP_CONFIG } from '../config/app.config';
import { plainRepo } from '../storage/repository';

export interface ReleaseNote {
  tag: string;
  version: string;
  name: string;
  body: string;
  publishedAt: string | null;
  url: string;
  prerelease: boolean;
}

interface CachedReleases {
  fetchedAt: string;
  releases: ReleaseNote[];
}

const CACHE_KEY = 'releases';
const TTL_MS = 6 * 3600_000;

/** "v1.2.0" / "1.2.0" / "CashFlow 1.2.0" → "1.2.0" */
export function normalizeVersion(tag: string): string {
  const m = String(tag).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? `${m[1]}.${m[2]}.${m[3] ?? '0'}` : String(tag).trim();
}

/** >0 quando a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map(Number);
  const pb = normalizeVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export function parseReleases(json: unknown): ReleaseNote[] {
  if (!Array.isArray(json)) return [];
  return (json as GitHubRelease[])
    .filter((r) => r && !r.draft && typeof r.tag_name === 'string')
    .map((r) => ({
      tag: r.tag_name!,
      version: normalizeVersion(r.tag_name!),
      name: (r.name ?? '').trim() || `CashFlow ${r.tag_name}`,
      body: typeof r.body === 'string' ? r.body.slice(0, 60_000) : '',
      publishedAt: r.published_at ?? null,
      url: typeof r.html_url === 'string' && /^https:\/\/github\.com\//.test(r.html_url) ? r.html_url : APP_CONFIG.releases.pageUrl,
      prerelease: !!r.prerelease,
    }))
    .sort((a, b) => compareVersions(b.version, a.version) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

export interface ReleasesResult {
  releases: ReleaseNote[];
  source: 'github' | 'cache' | 'bundled';
  fetchedAt: string | null;
  /** Motivo quando não foi possível consultar o GitHub. */
  error: string | null;
}

async function readCache(): Promise<CachedReleases | null> {
  try {
    return (await plainRepo.get<CachedReleases>('user_preferences', CACHE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function loadReleases(opts: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<ReleasesResult> {
  const cached = await readCache();
  if (!opts.force && cached && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS && cached.releases.length) {
    return { releases: cached.releases, source: 'cache', fetchedAt: cached.fetchedAt, error: null };
  }
  const f = opts.fetchImpl ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await f(APP_CONFIG.releases.apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'O GitHub limitou as consultas por agora (limite por hora). Tente mais tarde.' : `O GitHub respondeu ${res.status}.`);
    const releases = parseReleases(await res.json());
    const fetchedAt = new Date().toISOString();
    try {
      await plainRepo.put('user_preferences', CACHE_KEY, { fetchedAt, releases } satisfies CachedReleases);
    } catch {
      /* sem armazenamento: segue sem cache */
    }
    return { releases, source: 'github', fetchedAt, error: null };
  } catch (e) {
    const msg = e instanceof DOMException && e.name === 'AbortError' ? 'O GitHub demorou demais para responder.' : e instanceof Error && !/fetch/i.test(e.message) ? e.message : 'Sem conexão com o GitHub.';
    if (cached?.releases.length) return { releases: cached.releases, source: 'cache', fetchedAt: cached.fetchedAt, error: msg };
    return { releases: [], source: 'bundled', fetchedAt: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
