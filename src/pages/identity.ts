/**
 * Personalização das instituições e cartões:
 *  - identidade de cada conexão (nome exibido, logo/ícone/iniciais e cor);
 *  - apelidos de contas e cartões;
 *  - dias de fechamento e vencimento de cartões cuja instituição não informa as datas.
 * Tudo fica cifrado neste navegador e é aplicado em todo o app pela camada de identidade.
 */
import { html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { openModal } from '../components/modal';
import { instLogo } from '../components/ui';
import { ACCOUNT_TYPE_LABEL, type ConnectorInfo, type InstitutionIdentity, type InstitutionLogo, type NormalizedCard } from '../models/finance';
import {
  IDENTITY_COLORS,
  IDENTITY_ICONS,
  defaultAccountName,
  defaultCardName,
  identityForItem,
  initialsOf,
  isHexColor,
  readableTextOn,
  searchConnectors,
} from '../services/institutions';
import * as actions from '../state/actions';
import { notify } from '../state/notify';
import { store } from '../state/store';
import { debounce } from '../utils/async';
import { formatDate } from '../utils/format';

interface Draft {
  name: string;
  color: string;
  logo: InstitutionLogo;
  icon: string;
  connectorId: number | null;
  imageUrl: string | null;
}

function nickRow(id: string, kind: 'wallet' | 'card', title: string, raw: string, nickname: string | null | undefined, placeholder: string): SafeHtml {
  return html`<div class="nick-row">
    <label class="nick-row__meta" for="nick-${id}">
      <span class="nick-row__icon">${icon(kind)}</span>
      <span class="stack-sm" style="gap:1px;min-width:0"><strong class="truncate">${title}</strong><span class="muted truncate">Na instituição: ${raw}</span></span>
    </label>
    <input class="input input--sm" id="nick-${id}" data-nick="${id}" value="${nickname ?? ''}" placeholder="${placeholder}" maxlength="40" autocomplete="off" spellcheck="false" />
  </div>`;
}

/** Abre a personalização de uma conexão. `focusId`: conta/cartão cujo apelido recebe o foco. */
export function openInstitutionEditor(itemId: string, focusId?: string): void {
  const s = store.state;
  const ident = identityForItem(s.baseDataset, itemId, s.labels, s.connectors);
  const presented = s.dataset.items.find((i) => i.id === itemId);
  if (!ident || !presented) {
    notify('info', 'Sincronize esta conexão primeiro', 'A personalização fica disponível depois que os dados da instituição forem baixados.');
    return;
  }
  const demo = s.mode === 'demo';
  const userIdent = s.labels.identities[itemId] ?? null;
  const connectors: readonly ConnectorInfo[] = s.connectors;
  const accounts = s.dataset.accounts.filter((a) => a.itemId === itemId);
  const cards = s.dataset.cards.filter((c) => c.itemId === itemId);
  const invCount = s.dataset.investments.filter((i) => i.itemId === itemId).length;

  const draft: Draft = {
    name: ident.name,
    color: ident.color,
    logo: ident.logo,
    icon: ident.icon ?? 'bank',
    connectorId: userIdent?.connectorId ?? ident.suggestion?.connector?.id ?? presented.institution.connectorId ?? null,
    imageUrl: ident.imageUrl,
  };
  let touched = false;

  const sourceNote = (): SafeHtml => {
    if (ident.source === 'detected') {
      return html`<div class="callout callout--info">${icon('sparkle')}<div>Identificamos <strong>${ident.name}</strong> pelos próprios dados: “${ident.detectedFrom ?? ''}”. Confira e ajuste se precisar.</div></div>`;
    }
    if (ident.source === 'unidentified') {
      return html`<div class="callout callout--warn">${icon('info')}<div>Esta conexão vem do <strong>${ident.via ?? 'Meu Pluggy'}</strong>, que não informa o banco de origem, e os dados não permitiram identificá-lo. Dê um nome e uma cor para reconhecê-la em todo o app.</div></div>`;
    }
    if (ident.source === 'user' && ident.suggestion && ident.suggestion.name !== ident.name) {
      return html`<div class="callout callout--info">${icon('sparkle')}<div>Sugestão automática: <strong>${ident.suggestion.name}</strong> (a partir de “${ident.suggestion.from}”). <button type="button" class="link-btn" data-use-suggestion>Usar sugestão</button></div></div>`;
    }
    return html``;
  };

  const logoChoice = (value: InstitutionLogo, label: string) =>
    html`<label class="choice"><input type="radio" name="ident-logo" value="${value}" ${draft.logo === value ? 'checked' : ''} ${value === 'image' && !draft.imageUrl ? 'disabled' : ''} /><span>${label}</span></label>`;

  const m = openModal({
    title: 'Personalizar instituição',
    wide: true,
    initialFocus: focusId ? `[data-nick="${CSS.escape(focusId)}"]` : '[name="ident-name"]',
    body: html`<div class="ident-editor">
      <div class="ident-preview" data-preview aria-live="polite"></div>
      ${sourceNote()}
      <label class="field">
        <span class="field__label">Nome exibido</span>
        <input class="input" name="ident-name" value="${draft.name}" maxlength="40" autocomplete="off" spellcheck="false" />
        <span class="field__hint">Aparece em contas, cartões, faturas, transações, investimentos e no dashboard.</span>
        <span class="field__error" data-name-error hidden>Informe um nome.</span>
      </label>
      ${connectors.length
        ? html`<div class="field">
            <label class="field__label" for="ident-search">Buscar o logo da instituição</label>
            <div class="input-group">${icon('search')}<input id="ident-search" class="input" data-search placeholder="Ex.: Nubank, Inter, Itaú" autocomplete="off" spellcheck="false" /></div>
            <div class="ident-results" data-results></div>
            <span class="field__hint">Logos e cores do catálogo oficial de instituições da Pluggy.</span>
          </div>`
        : html`<p class="field__hint">${demo ? 'No modo demonstração o catálogo de logos da Pluggy não é usado — escolha iniciais ou um ícone.' : 'O catálogo de logos da Pluggy é baixado na sincronização. Enquanto isso, use iniciais ou um ícone.'}</p>`}
      <fieldset class="field">
        <legend class="field__label">Aparência</legend>
        <div class="choice-row">${logoChoice('image', 'Logo')}${logoChoice('initials', 'Iniciais')}${logoChoice('icon', 'Ícone')}</div>
        <div class="icon-grid" data-icon-grid ${draft.logo === 'icon' ? '' : 'hidden'}>
          ${IDENTITY_ICONS.map(
            (i) => html`<label class="icon-choice" title="${i.label}"><input type="radio" name="ident-icon" value="${i.value}" ${draft.icon === i.value ? 'checked' : ''} /><span>${icon(i.value)}<span class="sr-only">${i.label}</span></span></label>`,
          )}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend class="field__label">Cor</legend>
        <div class="swatches">
          ${IDENTITY_COLORS.map(
            (c) => html`<label class="swatch-choice" title="${c.label}"><input type="radio" name="ident-color" value="${c.value}" ${draft.color.toUpperCase() === c.value ? 'checked' : ''} /><span style="background:${c.value}"></span><span class="sr-only">${c.label}</span></label>`,
          )}
          <label class="swatch-choice swatch-choice--custom" title="Outra cor"><input type="color" data-custom-color value="${draft.color.toLowerCase()}" aria-label="Escolher outra cor" /></label>
        </div>
      </fieldset>
      ${accounts.length + cards.length
        ? html`<fieldset class="field">
            <legend class="field__label">Nomes das contas e cartões</legend>
            <div class="nick-list">
              ${accounts.map((a) =>
                nickRow(
                  a.id,
                  'wallet',
                  `${ACCOUNT_TYPE_LABEL[a.type]}${a.lastDigits ? ` · •••• ${a.lastDigits}` : ''}`,
                  a.rawName ?? a.name,
                  a.nickname,
                  defaultAccountName({ name: a.rawName ?? a.name, type: a.type }, ident.connectorName),
                ),
              )}
              ${cards.map((c) =>
                nickRow(
                  c.id,
                  'card',
                  `Cartão${c.lastFourDigits ? ` · final ${c.lastFourDigits}` : ''}`,
                  c.rawName ?? c.name,
                  c.nickname,
                  defaultCardName({ name: c.rawName ?? c.name, brand: c.brand, level: c.level }, ident.connectorName),
                ),
              )}
            </div>
            <span class="field__hint">Deixe em branco para usar o nome padrão (mostrado em cinza).</span>
          </fieldset>`
        : ''}
    </div>`,
    footer: html`${userIdent ? html`<button type="button" class="btn btn--ghost" data-reset>${icon('refresh')}Voltar ao automático</button>` : ''}
      <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>${icon('check')}Salvar</button>`,
  });

  const el = m.el;
  const q = <T extends Element>(sel: string) => el.querySelector<T>(sel);
  const nameInput = q<HTMLInputElement>('[name="ident-name"]')!;
  const preview = q<HTMLElement>('[data-preview]')!;
  const results = q<HTMLElement>('[data-results]');
  const custom = q<HTMLInputElement>('[data-custom-color]')!;
  const iconGrid = q<HTMLElement>('[data-icon-grid]')!;

  const paintPreview = () => {
    const name = draft.name.trim() || 'Sem nome';
    const inst = { name, imageUrl: draft.imageUrl, primaryColor: draft.color, logo: draft.logo, icon: draft.icon, initials: initialsOf(name), textColor: readableTextOn(draft.color) };
    const sample = accounts[0]
      ? (el.querySelector<HTMLInputElement>(`[data-nick="${CSS.escape(accounts[0].id)}"]`)?.value.trim() || accounts[0].name)
      : cards[0]?.name ?? 'Investimentos';
    render(
      preview,
      html`${instLogo(inst, 'lg')}
        <div class="stack-sm" style="gap:2px;min-width:0">
          <strong class="truncate" style="font-size:17px">${name}</strong>
          <span class="muted" style="font-size:13px">${ident.via ? `via ${ident.via} · ` : ''}${accounts.length} conta(s) · ${cards.length} cartão(ões) · ${invCount} investimento(s)</span>
          <span class="ident-sample">${instLogo(inst, 'xs')}<span>${name} · ${sample}</span></span>
        </div>`,
    );
  };

  const syncControls = () => {
    nameInput.value = draft.name;
    const imageRadio = q<HTMLInputElement>('[name="ident-logo"][value="image"]')!;
    imageRadio.disabled = !draft.imageUrl;
    el.querySelectorAll<HTMLInputElement>('[name="ident-logo"]').forEach((r) => (r.checked = r.value === draft.logo));
    el.querySelectorAll<HTMLInputElement>('[name="ident-color"]').forEach((r) => (r.checked = r.value === draft.color.toUpperCase()));
    custom.value = draft.color.toLowerCase();
    iconGrid.hidden = draft.logo !== 'icon';
  };

  const pick = (c: ConnectorInfo) => {
    draft.name = c.name;
    draft.imageUrl = c.imageUrl;
    draft.connectorId = c.id;
    if (isHexColor(c.primaryColor)) draft.color = c.primaryColor.toUpperCase();
    draft.logo = c.imageUrl ? 'image' : 'initials';
    touched = true;
    syncControls();
    paintPreview();
  };

  const paintResults = debounce((query: string) => {
    if (!results) return;
    const found = searchConnectors(query, connectors);
    render(
      results,
      query.trim().length < 2
        ? html``
        : found.length
          ? html`${found.map(
              (c) => html`<button type="button" class="ident-result" data-pick="${String(c.id)}">${instLogo({ name: c.name, imageUrl: c.imageUrl, primaryColor: c.primaryColor }, 'sm')}<span class="truncate">${c.name}</span>${c.isOpenFinance ? html`<span class="muted" style="font-size:11px">Open Finance</span>` : ''}</button>`,
            )}`
          : html`<p class="muted" style="font-size:13px;margin:4px 2px">Nenhuma instituição encontrada. Você pode usar iniciais ou um ícone.</p>`,
    );
  }, 120);

  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t === nameInput) {
      draft.name = t.value;
      touched = true;
      q<HTMLElement>('[data-name-error]')!.hidden = true;
      paintPreview();
    } else if (t.matches('[data-search]')) {
      paintResults(t.value);
    } else if (t === custom) {
      const v = t.value.toUpperCase();
      if (isHexColor(v)) {
        draft.color = v;
        touched = true;
        el.querySelectorAll<HTMLInputElement>('[name="ident-color"]').forEach((r) => (r.checked = r.value === v));
        paintPreview();
      }
    } else if (t.matches('[data-nick]')) {
      paintPreview();
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'ident-logo') {
      draft.logo = t.value as InstitutionLogo;
      iconGrid.hidden = draft.logo !== 'icon';
    } else if (t.name === 'ident-icon') {
      draft.icon = t.value;
    } else if (t.name === 'ident-color') {
      draft.color = t.value;
      custom.value = t.value.toLowerCase();
    } else {
      return;
    }
    touched = true;
    paintPreview();
  });

  el.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const pickBtn = target.closest<HTMLElement>('[data-pick]');
    if (pickBtn) {
      const c = connectors.find((x) => String(x.id) === pickBtn.dataset.pick);
      if (c) pick(c);
      const search = q<HTMLInputElement>('[data-search]');
      if (search) search.value = '';
      if (results) render(results, html``);
      nameInput.focus();
      return;
    }
    if (target.closest('[data-use-suggestion]') && ident.suggestion) {
      const sug = ident.suggestion;
      if (sug.connector) pick(sug.connector);
      else {
        draft.name = sug.name;
        touched = true;
        syncControls();
        paintPreview();
      }
      draft.name = sug.name;
      nameInput.value = sug.name;
      paintPreview();
      return;
    }
    const nicknames = () => Object.fromEntries(Array.from(el.querySelectorAll<HTMLInputElement>('[data-nick]')).map((i) => [i.dataset.nick!, i.value]));
    if (target.closest('[data-reset]')) {
      await actions.saveInstitutionCustomization(itemId, null, nicknames());
      m.close();
      return;
    }
    if (target.closest('[data-save]')) {
      if (touched && !draft.name.trim()) {
        q<HTMLElement>('[data-name-error]')!.hidden = false;
        nameInput.setAttribute('aria-invalid', 'true');
        nameInput.focus();
        return;
      }
      const identity: InstitutionIdentity | null = touched
        ? { name: draft.name, color: draft.color, logo: draft.logo, icon: draft.logo === 'icon' ? draft.icon : null, connectorId: draft.connectorId, imageUrl: draft.imageUrl, updatedAt: new Date().toISOString() }
        : userIdent;
      await actions.saveInstitutionCustomization(itemId, identity, nicknames());
      m.close();
    }
  });

  paintPreview();
}

// ------------------------------------------------------------------ fechamento e vencimento

export function dayOptions(current: number | null | undefined, emptyLabel = 'Não definido'): SafeHtml {
  return html`<option value="" ${current ? '' : 'selected'}>${emptyLabel}</option>${Array.from({ length: 31 }, (_, i) => i + 1).map(
    (d) => html`<option value="${String(d)}" ${current === d ? 'selected' : ''}>Dia ${String(d)}</option>`,
  )}`;
}

/** Texto do que a instituição informa sobre as datas do cartão. */
export function institutionDatesText(c: NormalizedCard): string {
  if (c.closingDate && c.dueDate) return `A instituição informa fechamento em ${formatDate(c.closingDate)} e vencimento em ${formatDate(c.dueDate)}.`;
  if (c.closingDate) return `A instituição informa só o fechamento (${formatDate(c.closingDate)}).`;
  if (c.dueDate) return `A instituição informa só o vencimento (${formatDate(c.dueDate)}).`;
  return 'A instituição não informa fechamento nem vencimento deste cartão.';
}

/** Define os dias de fechamento/vencimento de um cartão. */
export function openCardCycleEditor(cardId: string): void {
  const card = store.state.dataset.cards.find((c) => c.id === cardId);
  if (!card) return;
  const both = !!(card.closingDate && card.dueDate);
  const m = openModal({
    title: 'Fechamento e vencimento',
    initialFocus: '[data-closing]',
    body: html`<div class="stack">
      <div class="row" style="gap:10px">${instLogo(store.state.dataset.items.find((i) => i.id === card.itemId)?.institution ?? { name: card.institution, imageUrl: null, primaryColor: card.institutionColor }, 'sm')}<strong>${card.label ?? card.name}${card.lastFourDigits ? ` · final ${card.lastFourDigits}` : ''}</strong></div>
      <div class="callout ${both ? 'callout--info' : 'callout--warn'}">${icon('info')}<div>${institutionDatesText(card)} ${
        both ? 'Os dias abaixo só serão usados se a instituição deixar de informar.' : 'Defina os dias para calcular a fatura atual, a previsão de fechamento e o melhor dia de compra.'
      }</div></div>
      <div class="form-grid-2">
        <label class="field"><span class="field__label">Dia de fechamento</span><select class="select" data-closing>${dayOptions(card.manualClosingDay)}</select></label>
        <label class="field"><span class="field__label">Dia de vencimento</span><select class="select" data-due>${dayOptions(card.manualDueDay)}</select></label>
      </div>
      <p class="field__hint">Em meses mais curtos vale o último dia do mês. Melhor dia de compra = dia seguinte ao fechamento.</p>
    </div>`,
    footer: html`<button type="button" class="btn btn--ghost" data-clear>${icon('trash')}Limpar</button>
      <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>${icon('check')}Salvar</button>`,
  });
  const val = (sel: string) => {
    const v = m.el.querySelector<HTMLSelectElement>(sel)?.value;
    return v ? Number(v) : null;
  };
  m.el.querySelector('[data-save]')!.addEventListener('click', async () => {
    await actions.setCardCycle(cardId, { closingDay: val('[data-closing]'), dueDay: val('[data-due]') });
    notify('success', 'Datas do cartão salvas', 'Fatura atual, previsão e saldo projetado foram recalculados.');
    m.close();
  });
  m.el.querySelector('[data-clear]')!.addEventListener('click', async () => {
    await actions.setCardCycle(cardId, null);
    notify('info', 'Datas manuais removidas');
    m.close();
  });
}
