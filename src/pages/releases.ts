/**
 * Notas de Atualização — histórico de versões do CashFlow, lido das Releases do GitHub
 * (https://github.com/stefanoferrao/CashFlow/releases). Consultado só quando esta tela é aberta.
 * Sem internet: mostra a última cópia baixada ou as notas desta versão que vêm dentro do app.
 */
import { delegate, html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { badge, stateBlock } from '../components/ui';
import { APP_CONFIG } from '../config/app.config';
import { BUNDLED_RELEASE_NOTES } from '../config/releaseNotes';
import type { PageContext } from '../router';
import { compareVersions, loadReleases, normalizeVersion, type ReleaseNote, type ReleasesResult } from '../services/releases';
import * as actions from '../state/actions';
import { formatDate, formatDateTime } from '../utils/format';
import { renderMarkdown } from '../utils/markdown';
import { commonHandlers } from './shared';

const CURRENT = normalizeVersion(APP_CONFIG.version);

const normTitle = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();

/** Remove do corpo o título repetido (as notas costumam começar com "# Notas de Atualização — vX"). */
export function stripRepeatedTitle(body: string, name: string): string {
  const m = body.match(/^\s*#{1,3}\s+(.+)\n?/);
  if (m && normTitle(m[1]!) === normTitle(name)) return body.slice(m[0].length);
  return body;
}

function releaseCard(r: ReleaseNote, opts: { latest: boolean; open: boolean }): SafeHtml {
  const isCurrent = r.version === CURRENT;
  const date = r.publishedAt ? formatDate(r.publishedAt.slice(0, 10)) : null;
  const head = html`<div class="release__head">
      <div class="release__title">
        <span class="release__tag">v${r.version}</span>
        <strong>${r.name}</strong>
      </div>
      <div class="row wrap" style="gap:6px">
        ${isCurrent ? badge('Esta versão', 'good', 'check') : ''}
        ${opts.latest && !isCurrent ? badge('Mais recente', 'accent', 'sparkle') : ''}
        ${r.prerelease ? badge('Pré-lançamento', 'warn') : ''}
        ${date ? html`<span class="muted release__date">${icon('calendar')}${date}</span>` : ''}
      </div>
    </div>`;
  const text = stripRepeatedTitle(r.body, r.name).trim();
  const body = html`<div class="release__body md">${text ? renderMarkdown(text) : html`<p class="muted">Sem descrição.</p>`}</div>
    <div class="release__foot"><a href="${r.url}" target="_blank" rel="noopener noreferrer">${icon('external')}Ver no GitHub</a></div>`;
  return opts.open
    ? html`<article class="card release ${isCurrent ? 'release--current' : ''}" id="v-${r.version}">${head}${body}</article>`
    : html`<details class="card release release--collapsed ${isCurrent ? 'release--current' : ''}" id="v-${r.version}"><summary>${head}</summary>${body}</details>`;
}

export function mount(ctx: PageContext): () => void {
  const root = ctx.root;
  let result: ReleasesResult | null = null;
  let loading = true;
  let disposed = false;

  const paint = () => {
    const releases = result?.releases.length ? result.releases : [];
    const stable = releases.filter((r) => !r.prerelease);
    const newestPublished = stable[0] ?? releases[0] ?? null;
    // "Mais recente" só quando a publicada é igual ou mais nova que a versão em uso.
    const latest = newestPublished && compareVersions(newestPublished.version, CURRENT) >= 0 ? newestPublished : null;
    const newer = latest && compareVersions(latest.version, CURRENT) > 0 ? latest : null;
    const hasCurrent = releases.some((r) => r.version === CURRENT);
    const list = releases.length
      ? releases
      : [{ tag: CURRENT, version: CURRENT, name: `Notas de Atualização — v${CURRENT}`, body: BUNDLED_RELEASE_NOTES, publishedAt: null, url: APP_CONFIG.releases.pageUrl, prerelease: false }];

    render(
      root,
      html`<div class="page releases">
        <div class="page-head">
          <p class="page-head__intro">O que mudou em cada versão do CashFlow. Você está usando a <strong>versão ${CURRENT}</strong>.</p>
          <div class="row wrap">
            <a class="btn btn--ghost btn--sm" href="${APP_CONFIG.releases.pageUrl}" target="_blank" rel="noopener noreferrer">${icon('external')}Abrir no GitHub</a>
            <button type="button" class="btn btn--secondary btn--sm" data-action="reload-releases" ${loading ? 'disabled' : ''}>${icon('refresh', loading ? 'spin' : '')}Atualizar lista</button>
          </div>
        </div>

        ${newer
          ? html`<div class="callout callout--info">${icon('sparkle')}<div><strong>Há uma versão mais nova: ${newer.version}.</strong> Recarregue o app (ou use "Atualizar agora" no aviso de nova versão) para recebê-la. Seus dados não são afetados.</div></div>`
          : ''}
        ${result?.error
          ? html`<div class="callout callout--warn">${icon('wifiOff')}<div>${result.error} ${result.source === 'cache' && result.fetchedAt ? html`Mostrando a lista baixada em ${formatDateTime(result.fetchedAt)}.` : 'Mostrando as notas desta versão, que vêm dentro do app.'}</div></div>`
          : ''}
        ${!loading && releases.length && !hasCurrent
          ? html`<p class="field__hint">As notas da versão ${CURRENT} ainda não foram publicadas no GitHub — veja abaixo a cópia que acompanha o app.</p>`
          : ''}

        ${loading && !result
          ? html`<div class="card">${stateBlock({ kind: 'loading', title: 'Buscando as notas de atualização…', compact: true })}</div>`
          : html`<div class="stack">
              ${!hasCurrent && releases.length ? releaseCard({ tag: CURRENT, version: CURRENT, name: `Notas de Atualização — v${CURRENT}`, body: BUNDLED_RELEASE_NOTES, publishedAt: null, url: APP_CONFIG.releases.pageUrl, prerelease: false }, { latest: false, open: true }) : ''}
              ${list.map((r, i) => releaseCard(r, { latest: r === latest, open: i < 2 || r.version === CURRENT }))}
            </div>`}
        <p class="field__hint inline-note">${icon('shield')}A lista vem das Releases públicas do repositório no GitHub e só é consultada quando esta tela é aberta. Nenhum dado seu é enviado.</p>
      </div>`,
    );
  };

  const load = async (force = false) => {
    loading = true;
    paint();
    const r = await loadReleases({ force });
    if (disposed) return;
    result = r;
    loading = false;
    paint();
    void actions.markVersionSeen();
  };

  const off = delegate(root, 'click', {
    ...commonHandlers,
    'reload-releases': () => void load(true),
  });
  void load();
  return () => {
    disposed = true;
    off();
  };
}
