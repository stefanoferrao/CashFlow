/**
 * Utilidades compartilhadas pelas páginas (sem regra financeira).
 */
import { html, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { openModal } from '../components/modal';
import { stateBlock } from '../components/ui';
import { computeAnalytics, type Analytics } from '../services/analytics';
import * as actions from '../state/actions';
import { notify } from '../state/notify';
import { store, type AppState } from '../state/store';
import { toPluggyError } from '../pluggy/errors';
import type { InvestmentClass } from '../models/finance';

/** Índice da paleta por entidade (fixo — a cor segue a entidade, nunca a posição/ranking). */
export const CLASS_COLOR: Record<'contas' | InvestmentClass, number> = { contas: 1, renda_fixa: 2, fundos: 3, acoes: 4, etfs: 5, previdencia: 6, outros: 7 };

export function analytics(): Analytics {
  const s = store.state;
  return computeAnalytics(s.dataset, s.categorization, s.planned, s.preferences.includeEstimates);
}

/** Re-renderiza quando dados, preferências relevantes ou estado de sync mudam. */
export function onDataChange(fn: (s: AppState, prev: AppState) => void): () => void {
  return store.subscribe((s, prev) => {
    if (
      s.dataVersion !== prev.dataVersion ||
      s.preferences.includeEstimates !== prev.preferences.includeEstimates ||
      (s.sync.status !== prev.sync.status && s.sync.status !== 'syncing') ||
      s.itemIds !== prev.itemIds
    ) {
      fn(s, prev);
    }
  });
}

export function hasAnyData(s: AppState = store.state): boolean {
  const d = s.dataset;
  return d.accounts.length + d.cards.length + d.investments.length + d.transactions.length > 0;
}

/** Estado vazio padrão (modo real, sem instituições/dados). */
export function noDataState(s: AppState = store.state): SafeHtml {
  if (s.mode === 'real' && !s.connection.hasCredentials) {
    return stateBlock({
      kind: 'empty',
      title: 'Configure sua conexão Pluggy',
      text: 'Informe seu Client ID e Client Secret para começar. Eles ficam cifrados somente neste navegador.',
      action: { label: 'Ir para Configurações', action: 'goto', data: 'configuracoes', icon: 'settings' },
    });
  }
  if (s.sync.status === 'syncing') {
    return stateBlock({ kind: 'loading', title: 'Sincronizando seus dados', text: s.sync.progress ?? 'Buscando informações na Pluggy…' });
  }
  if (s.sync.status === 'error' && s.itemIds.length) {
    return stateBlock({
      kind: s.sync.errorKind === 'offline' ? 'offline' : 'error',
      title: s.sync.errorTitle ?? 'Erro na sincronização',
      text: s.sync.errorMessage ?? undefined,
      action: { label: 'Tentar novamente', action: 'sync-now', icon: 'refresh' },
    });
  }
  if (!s.itemIds.length) {
    return stateBlock({
      kind: 'empty',
      title: 'Conecte sua primeira instituição para começar.',
      text: 'Use o Pluggy Connect ou informe o Item ID de uma conexão do Meu Pluggy.',
      action: { label: 'Adicionar instituição', action: 'add-institution', icon: 'plus' },
      secondary: { label: 'Ver demonstração', action: 'start-demo', icon: 'sparkle' },
    });
  }
  return stateBlock({
    kind: 'empty',
    title: 'Sem dados ainda',
    text: 'As instituições estão registradas, mas ainda não há dados sincronizados.',
    action: { label: 'Atualizar agora', action: 'sync-now', icon: 'refresh' },
  });
}

/** Ações comuns disparadas por estados vazios/erros em qualquer página. */
export const commonHandlers: Record<string, (el: HTMLElement, ev: Event) => void> = {
  goto: (el) => {
    location.hash = `#/${el.dataset.value ?? 'dashboard'}`;
  },
  'sync-now': () => void actions.syncAll(),
  'add-institution': () => openAddInstitution(),
  'start-demo': () => actions.startDemo(),
  'toggle-table': (el) => {
    const id = el.dataset.target!;
    const frame = document.getElementById(id);
    if (!frame) return;
    const table = frame.querySelector<HTMLElement>('[data-table-view]');
    const chart = frame.querySelector<HTMLElement>('[data-chart-view]');
    const showTable = table?.hidden ?? false;
    if (table) table.hidden = !showTable;
    if (chart) chart.hidden = showTable;
    el.setAttribute('aria-pressed', String(showTable));
    el.querySelector('span')!.textContent = showTable ? 'Gráfico' : 'Tabela';
  },
};

export function tableToggle(target: string): SafeHtml {
  return html`<button type="button" class="btn btn--ghost btn--sm" data-action="toggle-table" data-target="${target}" aria-pressed="false" aria-controls="${target}">${icon('list')}<span>Tabela</span></button>`;
}

export interface TableSpec {
  caption: string;
  headers: string[];
  rows: Array<Array<string | SafeHtml>>;
  numericFrom?: number;
}

export function dataTable(t: TableSpec): SafeHtml {
  const nf = t.numericFrom ?? 1;
  return html`<div class="table-wrap"><table class="table">
    <caption class="sr-only">${t.caption}</caption>
    <thead><tr>${t.headers.map((h, i) => html`<th scope="col" class="${i >= nf ? 'num' : ''}">${h}</th>`)}</tr></thead>
    <tbody>${t.rows.map((r) => html`<tr>${r.map((c, i) => html`<td class="${i >= nf ? 'num' : ''}">${c}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

/** Área de gráfico com alternativa em tabela (acessibilidade: nenhum valor fica só no gráfico). */
export function chartFrame(id: string, height: number, ariaLabel: string, table: TableSpec): SafeHtml {
  return html`<div class="chart-frame" id="${id}">
    <div class="chart-box" style="height:${height}px" data-chart-view><canvas data-chart="${id}" role="img" aria-label="${ariaLabel}"></canvas></div>
    <div data-table-view hidden>${dataTable(table)}</div>
  </div>`;
}

export function canvasFor(root: ParentNode, id: string): HTMLCanvasElement | null {
  return root.querySelector<HTMLCanvasElement>(`canvas[data-chart="${id}"]`);
}

// ------------------------------------------------------------------ adicionar instituição

export function openAddInstitution(): void {
  const s = store.state;
  if (s.mode === 'demo') {
    notify('info', 'Modo demonstração', 'Saia da demonstração e configure a Pluggy para conectar instituições reais.');
    return;
  }
  if (!s.connection.hasCredentials) {
    notify('warn', 'Pluggy não configurada', 'Informe o Client ID e o Client Secret em Configurações → Pluggy.');
    location.hash = '#/configuracoes';
    return;
  }
  const m = openModal({
    title: 'Adicionar instituição',
    wide: true,
    body: html`
      <p class="muted">Escolha como trazer seus dados. Nada passa por servidores do CashFlow — a comunicação é direta entre este navegador e a Pluggy.</p>
      <div class="option-grid">
        <div class="option-card">
          <div class="row">${icon('plug')}<strong>Pluggy Connect</strong></div>
          <p class="muted">Abre o widget oficial da Pluggy para conectar um banco (Open Finance ou conectores disponíveis no seu plano).</p>
          <label class="check"><input type="checkbox" data-sandbox ${s.preferences.includeSandbox ? 'checked' : ''} /> Incluir conectores de teste (sandbox)</label>
          <button type="button" class="btn btn--primary" data-connect>${icon('plus')}Abrir Pluggy Connect</button>
        </div>
        <div class="option-card">
          <div class="row">${icon('link')}<strong>Tenho um Item ID</strong></div>
          <p class="muted">Para conexões do <strong>Meu Pluggy</strong>: vincule o banco no Dashboard da Pluggy (conector MeuPluggy) e copie o Item ID.</p>
          <label class="field"><span class="field__label">Item ID</span><input class="input" data-item-id placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false" /></label>
          <p class="field__error" data-item-error hidden></p>
          <button type="button" class="btn btn--secondary" data-add-id>${icon('check')}Adicionar Item</button>
        </div>
      </div>
      <details class="details">
        <summary>Buscar automaticamente os Items da minha aplicação</summary>
        <p class="muted">Usa <code>GET /v2/items</code>, um recurso <strong>opcional</strong> que precisa ser habilitado pelo suporte da Pluggy. Se não estiver habilitado, você verá um aviso.</p>
        <button type="button" class="btn btn--ghost btn--sm" data-discover>${icon('search')}Buscar Items</button>
      </details>`,
  });
  const sandbox = m.el.querySelector<HTMLInputElement>('[data-sandbox]')!;
  sandbox.addEventListener('change', () => void actions.updatePreferences({ includeSandbox: sandbox.checked }));
  m.el.querySelector('[data-connect]')!.addEventListener('click', () => {
    m.close();
    void actions.connectInstitution();
  });
  const input = m.el.querySelector<HTMLInputElement>('[data-item-id]')!;
  const errEl = m.el.querySelector<HTMLElement>('[data-item-error]')!;
  const addBtn = m.el.querySelector<HTMLButtonElement>('[data-add-id]')!;
  addBtn.addEventListener('click', async () => {
    errEl.hidden = true;
    addBtn.disabled = true;
    try {
      await actions.addItemById(input.value);
      m.close();
      notify('success', 'Item adicionado', 'Sincronizando os dados da instituição.');
    } catch (e) {
      const msg = e instanceof Error && !(e as { kind?: string }).kind ? e.message : toPluggyError(e).message;
      errEl.textContent = msg;
      errEl.hidden = false;
      input.setAttribute('aria-invalid', 'true');
    } finally {
      addBtn.disabled = false;
    }
  });
  m.el.querySelector('[data-discover]')!.addEventListener('click', async () => {
    try {
      const n = await actions.discoverItems();
      m.close();
      notify(n ? 'success' : 'info', n ? `${n} item(ns) encontrados` : 'Nenhum item novo', n ? 'Sincronizando os dados.' : 'Todos os Items da aplicação já estão adicionados.');
    } catch (e) {
      const err = toPluggyError(e);
      notify(err.kind === 'forbidden' || err.kind === 'not_found' ? 'info' : 'error', 'Busca automática indisponível', err.kind === 'forbidden' || err.kind === 'not_found' ? 'O recurso GET /v2/items não está habilitado para sua aplicação. Adicione o Item ID manualmente.' : err.message);
    }
  });
}
