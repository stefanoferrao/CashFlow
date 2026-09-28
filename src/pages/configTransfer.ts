/**
 * Exportar e importar as personalizações (Configurações → Segurança), no computador e no celular.
 * O que entra no arquivo e o que nunca entra está em services/userConfig.ts; aqui fica só a interface:
 *  - Exportar arquivo: no celular abre a folha de compartilhar (salvar em Arquivos/Drive, enviar por mensagem);
 *    no computador (ou onde não existe) baixa o arquivo.
 *  - Copiar / Colar: o mesmo conteúdo como texto, para aparelhos onde arquivo é incômodo.
 *  - Importar: antes de aplicar, mostra o que o arquivo vai mudar.
 */
import { html } from '../components/dom';
import { icon } from '../components/icons';
import { openModal } from '../components/modal';
import { MAX_CONFIG_BYTES, describeUserConfig, parseUserConfig, type ParsedUserConfig } from '../services/userConfig';
import * as actions from '../state/actions';
import { notify } from '../state/notify';
import { store } from '../state/store';

const EXPORT_NOTE = 'Tem nomes, aparência, datas dos cartões, dashboard e categorização. Não tem credenciais, senha nem dados da Pluggy.';

const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function download(name: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exporta um arquivo .json: folha de compartilhar no celular, download no computador. */
export async function exportConfigFile(): Promise<void> {
  const json = await actions.exportUserConfig();
  const name = `cashflow-personalizacoes-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (isTouch() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Personalizações do CashFlow' });
      notify('success', 'Personalizações prontas', 'Escolha onde salvar o arquivo ou para onde enviá-lo.');
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // a pessoa fechou a folha de compartilhar
      // qualquer outra falha: baixa o arquivo normalmente
    }
  }
  download(name, json);
  notify('success', 'Personalizações exportadas', EXPORT_NOTE);
}

/** Copia o mesmo conteúdo como texto; se o navegador não deixar, mostra o texto para copiar à mão. */
export async function copyConfig(): Promise<void> {
  const json = await actions.exportUserConfig();
  try {
    await navigator.clipboard.writeText(json);
    notify('success', 'Personalizações copiadas', 'No outro aparelho, use "Colar" em Configurações → Segurança.');
    return;
  } catch {
    /* sem permissão para a área de transferência: mostra o texto abaixo */
  }
  const m = openModal({
    title: 'Copiar personalizações',
    body: html`<p class="muted">O navegador não permitiu copiar sozinho. Selecione o texto abaixo, copie e, no outro aparelho, use <strong>Colar</strong>.</p>
      <label class="field"><span class="field__label">Personalizações</span><textarea class="textarea" rows="8" readonly spellcheck="false" data-config-text>${json}</textarea></label>`,
    footer: html`<button type="button" class="btn btn--secondary" data-modal-close>Fechar</button>
      <button type="button" class="btn btn--primary" data-select-all>${icon('check')}Selecionar tudo</button>`,
    initialFocus: '[data-select-all]',
  });
  m.el.querySelector('[data-select-all]')!.addEventListener('click', () => {
    const t = m.el.querySelector<HTMLTextAreaElement>('[data-config-text]')!;
    t.focus();
    t.select();
  });
}

/** Mostra o que o arquivo vai aplicar e pede confirmação. Resolve true se a pessoa confirmar. */
function confirmImport(parsed: ParsedUserConfig, lines: string[]): Promise<boolean> {
  const demo = store.state.mode === 'demo';
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const m = openModal({
      title: 'Importar personalizações',
      body: html`<p class="muted">Este arquivo vai aplicar neste aparelho:</p>
        <ul class="feature-list" data-config-summary>${lines.map((l) => html`<li>${icon('check')}<span>${l}</span></li>`)}</ul>
        <p class="muted" style="font-size:13px">O que já existe aqui é mantido; se houver conflito, vale o do arquivo.</p>
        ${demo ? html`<div class="callout">${icon('info')}<div>No modo demonstração só o tema, as preferências e o dashboard são aplicados. Nomes, ícones e datas dos cartões ficam para o modo com a Pluggy conectada.</div></div>` : ''}
        ${parsed.ignored.length
          ? html`<div class="callout callout--warn" data-config-ignored>${icon('shield')}<div><strong>Campos de segurança ignorados.</strong> O arquivo trazia ${parsed.ignored.join(', ')}. Credenciais e dados de conexão nunca são importados.</div></div>`
          : html`<div class="callout callout--good">${icon('shield')}<div>Credenciais, senha local e dados de conexão nunca são importados.</div></div>`}
        ${parsed.dropped ? html`<p class="muted" style="font-size:13px">${parsed.dropped} item(ns) inválido(s) do arquivo foram descartados.</p>` : ''}`,
      footer: html`<button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
        <button type="button" class="btn btn--primary" data-config-confirm>${icon('upload')}Importar</button>`,
      onClose: () => finish(false),
      initialFocus: '[data-config-confirm]',
    });
    m.el.querySelector('[data-config-confirm]')!.addEventListener('click', () => {
      finish(true);
      m.close();
    });
  });
}

/** Valida, mostra o que muda, pede confirmação e aplica. */
async function importParsed(parsed: ParsedUserConfig): Promise<void> {
  const lines = describeUserConfig(parsed.config);
  if (!lines.length) {
    notify('info', 'Nada para importar', 'O arquivo não traz nenhuma personalização que possa ser aplicada.');
    return;
  }
  if (!(await confirmImport(parsed, lines))) return;
  try {
    const { savedData } = await actions.importUserConfig(parsed.config);
    const c = parsed.config;
    const hadData = !!(c.labels || c.categorization || c.planned);
    notify(
      'success',
      'Personalizações importadas',
      hadData && !savedData ? 'Tema, preferências e dashboard aplicados. O restante só é gravado fora do modo demonstração.' : 'Já valem em todo o app.',
    );
  } catch (e) {
    notify('error', 'Não foi possível importar', e instanceof Error ? e.message : 'Tente novamente.');
  }
}

/** Importar arquivo (seletor do computador ou do celular). */
export async function importConfigFile(file: File): Promise<void> {
  if (file.size > MAX_CONFIG_BYTES) {
    notify('error', 'Arquivo grande demais', 'Este arquivo é maior que uma configuração do CashFlow.');
    return;
  }
  try {
    await importParsed(parseUserConfig(await file.text()));
  } catch (e) {
    notify('error', 'Não foi possível importar', e instanceof Error ? e.message : 'Arquivo inválido.');
  }
}

/** Importar texto colado (o que foi copiado em "Copiar", no outro aparelho). */
export function openPasteDialog(): void {
  const m = openModal({
    title: 'Colar personalizações',
    body: html`<p class="muted">Cole o texto copiado no outro aparelho (Configurações → Segurança → <strong>Copiar</strong>).</p>
      <label class="field"><span class="field__label">Texto copiado</span><textarea class="textarea" rows="8" spellcheck="false" autocomplete="off" autocapitalize="off" data-config-text placeholder='{ "app": "cashflow", … }'></textarea></label>
      <p class="field__error" data-config-error hidden></p>`,
    footer: html`<button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-config-next>${icon('chevronRight')}Continuar</button>`,
    initialFocus: '[data-config-text]',
  });
  const text = m.el.querySelector<HTMLTextAreaElement>('[data-config-text]')!;
  const error = m.el.querySelector<HTMLElement>('[data-config-error]')!;
  m.el.querySelector('[data-config-next]')!.addEventListener('click', () => {
    error.hidden = true;
    text.removeAttribute('aria-invalid');
    let parsed: ParsedUserConfig;
    try {
      parsed = parseUserConfig(text.value.trim());
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Texto inválido.';
      error.hidden = false;
      text.setAttribute('aria-invalid', 'true');
      return;
    }
    m.close();
    void importParsed(parsed);
  });
}
