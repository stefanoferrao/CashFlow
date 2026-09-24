/**
 * Personalização das instituições e cartões:
 *  - identidade de cada conexão (nome exibido, logo/ícone/iniciais e cor);
 *  - logo próprio de contas e cartões (ex.: Nubank Ultravioleta), da biblioteca local de ícones ou enviado;
 *  - apelidos de contas e cartões;
 *  - dias de fechamento e vencimento dos cartões.
 * Tudo fica cifrado neste navegador e é aplicado em todo o app pela camada de identidade.
 */
import { html, render, type SafeHtml } from '../components/dom';
import { icon } from '../components/icons';
import { openModal } from '../components/modal';
import { type InstLike, instLogo } from '../components/ui';
import { ACCOUNT_TYPE_LABEL, type ConnectorInfo, type InstitutionIdentity, type InstitutionLogo, type NormalizedCard, type ProductLogo } from '../models/finance';
import { BANK_ICONS, BANK_ICON_GROUPS, type BankIcon, bankIcon, bankIconUrl, productIconFor, searchBankIcons, usableIconColor, variantsOf } from '../services/bankIcons';
import {
  IDENTITY_COLORS,
  IDENTITY_ICONS,
  defaultAccountName,
  defaultCardName,
  identityForItem,
  initialsOf,
  isHexColor,
  logoViewOf,
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
  /** https (catálogo da Pluggy) ou imagem enviada. */
  imageUrl: string | null;
  /** Ícone da biblioteca local. */
  bank: string | null;
}

/** Alvo da escolha de logo: a instituição (conexão) ou uma conta/cartão específico. */
type Target = 'inst' | string;

/** Lê uma imagem do usuário e devolve um PNG quadrado de 128 px (data URL). Sem blob: (a CSP não permite). */
export async function imageFileToLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) throw new Error('Use uma imagem PNG, JPG, WebP, GIF ou SVG.');
  if (file.size > 3 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 3 MB.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = dataUrl;
  });
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não permite processar a imagem.');
  const w = img.naturalWidth || size;
  const h = img.naturalHeight || size;
  const scale = Math.max(size / w, size / h); // preenche o quadrado (recorte central)
  ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
  const out = canvas.toDataURL('image/png');
  if (out.length > 200_000) throw new Error('A imagem ficou grande demais depois de reduzida.');
  return out;
}

function nickRow(id: string, kind: 'wallet' | 'card', title: string, raw: string, nickname: string | null | undefined, placeholder: string): SafeHtml {
  return html`<div class="nick-row">
    <div class="nick-row__meta">
      <button type="button" class="nick-row__logo" data-target="${id}" aria-label="Escolher o logo de ${title}" data-tip="Escolher o logo">${icon(kind)}</button>
      <label class="stack-sm" style="gap:1px;min-width:0" for="nick-${id}"><strong class="truncate">${title}</strong><span class="muted truncate">Na instituição: ${raw}</span></label>
    </div>
    <input class="input input--sm" id="nick-${id}" data-nick="${id}" value="${nickname ?? ''}" placeholder="${placeholder}" maxlength="40" autocomplete="off" spellcheck="false" />
  </div>`;
}

/** Abre a personalização de uma conexão. `focusId`: conta/cartão que já abre selecionado (logo) e com o apelido em foco. */
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
  const accounts = s.dataset.accounts.filter((a) => a.itemId === itemId);
  const cards = s.dataset.cards.filter((c) => c.itemId === itemId);
  const invCount = s.dataset.investments.filter((i) => i.itemId === itemId).length;
  const products = [
    ...cards.map((c) => ({ id: c.id, kind: 'card' as const, title: `Cartão${c.lastFourDigits ? ` · final ${c.lastFourDigits}` : ''}`, card: c })),
    ...accounts.map((a) => ({ id: a.id, kind: 'wallet' as const, title: `${ACCOUNT_TYPE_LABEL[a.type]}${a.lastDigits ? ` · •••• ${a.lastDigits}` : ''}`, card: null })),
  ];

  const draft: Draft = {
    name: ident.name,
    color: ident.color,
    logo: ident.logo,
    icon: ident.icon ?? 'bank',
    connectorId: userIdent?.connectorId ?? ident.suggestion?.connector?.id ?? presented.institution.connectorId ?? null,
    imageUrl: ident.bank ? null : ident.imageUrl,
    bank: ident.bank,
  };
  let touched = false;
  /** O usuário digitou o nome: escolher um logo não o substitui mais. */
  let nameEdited = !!userIdent;
  /** Logos próprios em edição (undefined = sem alteração; null = usar o da instituição). */
  const productDraft = new Map<string, ProductLogo | null>();
  const productInitial = (id: string): ProductLogo | null => s.labels.productLogos[id] ?? null;
  let target: Target = focusId && products.some((p) => p.id === focusId && p.kind === 'card') ? focusId : 'inst';
  let query = '';
  let catalogState: 'idle' | 'loading' | 'error' = 'idle';
  let catalogMessage = '';

  const instImage = () => (draft.bank ? bankIconUrl(draft.bank) : draft.imageUrl);
  const instView = (): InstLike => {
    const name = draft.name.trim() || 'Sem nome';
    return { name, imageUrl: instImage(), primaryColor: draft.color, logo: draft.logo, icon: draft.icon, initials: initialsOf(name), textColor: readableTextOn(draft.color) };
  };
  /** Logo efetivo de uma conta/cartão com o rascunho aplicado. */
  const productView = (id: string): { view: InstLike; own: boolean; auto: boolean } => {
    const p = productDraft.has(id) ? productDraft.get(id)! : productInitial(id);
    const prod = products.find((x) => x.id === id);
    if (p && !p.inherit) {
      const v = logoViewOf(prod?.title ?? '', p.bank, p.imageUrl, draft.color);
      if (v) return { view: v, own: true, auto: false };
    }
    if (!p?.inherit && prod?.card) {
      const c = prod.card;
      const auto = productIconFor(draft.logo === 'image' ? draft.bank : null, [c.rawName ?? c.name, c.brand, c.level].filter(Boolean).join(' '));
      if (auto) return { view: logoViewOf(c.name, auto.slug, null, draft.color)!, own: false, auto: true };
    }
    return { view: instView(), own: false, auto: false };
  };
  const currentSlug = (): string | null => {
    if (target === 'inst') return draft.logo === 'image' ? draft.bank : null;
    const p = productDraft.has(target) ? productDraft.get(target) : productInitial(target);
    return p?.bank ?? null;
  };

  const sourceNote = (): SafeHtml => {
    if (ident.source === 'detected') {
      return html`<div class="callout callout--info">${icon('sparkle')}<div>Identificamos <strong>${ident.name}</strong> pelos próprios dados: “${ident.detectedFrom ?? ''}”. Confira e ajuste se precisar.</div></div>`;
    }
    if (ident.source === 'unidentified') {
      return html`<div class="callout callout--warn">${icon('info')}<div>Esta conexão vem do <strong>${ident.via ?? 'Meu Pluggy'}</strong>, que não informa o banco de origem, e os dados não permitiram identificá-lo. Escolha o banco na lista abaixo — o nome, o logo e a cor passam a valer em todo o app.</div></div>`;
    }
    if (ident.source === 'user' && ident.suggestion && ident.suggestion.name !== ident.name) {
      return html`<div class="callout callout--info">${icon('sparkle')}<div>Sugestão automática: <strong>${ident.suggestion.name}</strong> (a partir de “${ident.suggestion.from}”). <button type="button" class="link-btn" data-use-suggestion>Usar sugestão</button></div></div>`;
    }
    return html``;
  };

  const logoChoice = (value: InstitutionLogo, label: string) =>
    html`<label class="choice"><input type="radio" name="ident-logo" value="${value}" ${draft.logo === value ? 'checked' : ''} ${value === 'image' && !instImage() ? 'disabled' : ''} /><span>${label}</span></label>`;

  const m = openModal({
    title: 'Personalizar instituição',
    wide: true,
    // Aberto por um cartão: foco na busca de logos (o cartão já vem selecionado). Por uma conta: no apelido.
    initialFocus: focusId ? (target !== 'inst' ? '[data-search]' : `[data-nick="${CSS.escape(focusId)}"]`) : '[name="ident-name"]',
    body: html`<div class="ident-editor">
      <div class="ident-preview" data-preview aria-live="polite"></div>
      ${sourceNote()}
      <label class="field">
        <span class="field__label">Nome exibido</span>
        <input class="input" name="ident-name" value="${draft.name}" maxlength="40" autocomplete="off" spellcheck="false" />
        <span class="field__hint">Aparece em contas, cartões, faturas, transações, investimentos e no dashboard.</span>
        <span class="field__error" data-name-error hidden>Informe um nome.</span>
      </label>
      <section class="field logo-picker" aria-labelledby="logo-picker-title">
        <div class="row-between wrap" style="gap:8px">
          <span class="field__label" id="logo-picker-title">Logo</span>
          <label class="btn btn--ghost btn--sm">${icon('upload')}Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" data-upload hidden /></label>
        </div>
        ${products.length
          ? html`<div class="logo-targets" role="radiogroup" aria-label="Aplicar o logo a" data-targets></div>
              <span class="field__hint">Contas e cartões usam o logo da instituição, a não ser que você escolha um próprio — útil para cartões como Nubank Ultravioleta, Itaú Black ou C6 Carbon.</span>`
          : ''}
        <div class="input-group">${icon('search')}<input class="input" data-search placeholder="Buscar banco, cartão ou código (ex.: Inter, Ultravioleta, 077)" autocomplete="off" spellcheck="false" aria-label="Buscar logo" /></div>
        <div class="logo-gallery" data-gallery></div>
        <span class="field__hint">${BANK_ICONS.length} logos de bancos, fintechs, cartões e bandeiras (biblioteca <a href="https://github.com/henriquezolini/react-bancos" target="_blank" rel="noopener noreferrer">react-bancos</a>), guardados no próprio app: nenhum site externo é consultado.</span>
      </section>
      <fieldset class="field" data-appearance>
        <legend class="field__label">Aparência da instituição</legend>
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
        <span class="field__hint">Usada no cartão, nos gráficos e nas iniciais. Ao escolher um logo, a cor dele é aplicada automaticamente.</span>
      </fieldset>
      ${products.length
        ? html`<fieldset class="field">
            <legend class="field__label">Nomes das contas e cartões</legend>
            <div class="nick-list">
              ${products.map((p) => {
                if (p.card) {
                  const c = p.card;
                  return nickRow(c.id, 'card', p.title, c.rawName ?? c.name, c.nickname, defaultCardName({ name: c.rawName ?? c.name, brand: c.brand, level: c.level }, ident.connectorName));
                }
                const a = accounts.find((x) => x.id === p.id)!;
                return nickRow(a.id, 'wallet', p.title, a.rawName ?? a.name, a.nickname, defaultAccountName({ name: a.rawName ?? a.name, type: a.type }, ident.connectorName));
              })}
            </div>
            <span class="field__hint">Deixe em branco para usar o nome padrão (mostrado em cinza).</span>
          </fieldset>`
        : ''}
    </div>`,
    footer: html`${userIdent || Object.keys(s.labels.productLogos).some((id) => products.some((p) => p.id === id))
        ? html`<button type="button" class="btn btn--ghost" data-reset>${icon('refresh')}Voltar ao automático</button>`
        : ''}
      <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>${icon('check')}Salvar</button>`,
  });

  const el = m.el;
  const q = <T extends Element>(sel: string) => el.querySelector<T>(sel);
  const nameInput = q<HTMLInputElement>('[name="ident-name"]')!;
  const preview = q<HTMLElement>('[data-preview]')!;
  const gallery = q<HTMLElement>('[data-gallery]')!;
  const targets = q<HTMLElement>('[data-targets]');
  const custom = q<HTMLInputElement>('[data-custom-color]')!;
  const iconGrid = q<HTMLElement>('[data-icon-grid]')!;

  const nickValue = (id: string) => el.querySelector<HTMLInputElement>(`[data-nick="${CSS.escape(id)}"]`)?.value.trim();

  const paintPreview = () => {
    const inst = instView();
    render(
      preview,
      html`${instLogo(inst, 'lg')}
        <div class="stack-sm" style="gap:4px;min-width:0">
          <strong class="truncate" style="font-size:17px">${inst.name}</strong>
          <span class="muted" style="font-size:13px">${ident.via ? `via ${ident.via} · ` : ''}${accounts.length} conta(s) · ${cards.length} cartão(ões) · ${invCount} investimento(s)</span>
          ${products.length
            ? html`<span class="ident-products">${products.map((p) => {
                const v = productView(p.id).view;
                const label = nickValue(p.id) || (p.card ? p.card.name : accounts.find((a) => a.id === p.id)?.name) || p.title;
                return html`<span class="ident-sample">${instLogo(v, 'xs')}<span>${inst.name} · ${label}</span></span>`;
              })}</span>`
            : ''}
        </div>`,
    );
  };

  const paintTargets = () => {
    if (!targets) return;
    render(
      targets,
      html`<button type="button" class="logo-target" role="radio" aria-checked="${String(target === 'inst')}" data-target="inst">${instLogo(instView(), 'sm')}<span><strong>Instituição</strong><span class="muted">Toda a conexão</span></span></button>
        ${products.map((p) => {
          const pv = productView(p.id);
          const label = nickValue(p.id) || (p.card ? p.card.name : accounts.find((a) => a.id === p.id)?.name) || p.title;
          return html`<button type="button" class="logo-target" role="radio" aria-checked="${String(target === p.id)}" data-target="${p.id}">${instLogo(pv.view, 'sm')}<span><strong class="truncate">${label}</strong><span class="muted">${pv.own ? 'Logo próprio' : pv.auto ? 'Reconhecido pelo nome' : 'Logo da instituição'}</span></span></button>`;
        })}`,
    );
    // Ícones das linhas de apelido acompanham o logo efetivo.
    for (const p of products) {
      const b = el.querySelector<HTMLElement>(`.nick-row__logo[data-target="${CSS.escape(p.id)}"]`);
      if (b) render(b, instLogo(productView(p.id).view, 'sm'));
    }
  };

  const tile = (b: BankIcon, selected: string | null): SafeHtml =>
    html`<button type="button" class="logo-tile" data-bank="${b.slug}" aria-pressed="${String(selected === b.slug)}" title="${b.name}${b.compe ? ` · ${b.compe}` : ''}">
      <img src="${bankIconUrl(b.slug)}" alt="" loading="lazy" width="40" height="40" /><span>${b.name}</span>
    </button>`;

  const paintGallery = () => {
    const selected = currentSlug();
    const hits = searchBankIcons(query);
    const suggested: BankIcon[] = [];
    const push = (b: BankIcon | null) => {
      if (b && !suggested.some((x) => x.slug === b.slug)) suggested.push(b);
    };
    if (!query) {
      if (target !== 'inst') {
        for (const v of variantsOf(draft.bank)) push(v);
        push(bankIcon(draft.bank));
      }
      push(bankIcon(ident.suggestion?.bank));
      push(bankIcon(ident.bank));
    }
    const catalog = query.trim().length >= 2 && target === 'inst' && hits.length < 3 ? searchConnectors(query, store.state.connectors, 6) : [];
    const groups = BANK_ICON_GROUPS.map((g) => ({ ...g, items: hits.filter((b) => b.kind === g.kind) })).filter((g) => g.items.length);
    const inheritTile =
      target !== 'inst'
        ? html`<button type="button" class="logo-tile logo-tile--inherit" data-inherit aria-pressed="${String(!productView(target).own && !productView(target).auto)}"><span class="logo-tile__inherit">${instLogo(instView(), 'md')}</span><span>Igual à instituição</span></button>`
        : '';
    render(
      gallery,
      html`${suggested.length || inheritTile
          ? html`<div class="logo-group"><div class="logo-group__title">Sugestões</div><div class="logo-grid">${inheritTile}${suggested.map((b) => tile(b, selected))}</div></div>`
          : ''}
        ${groups.map(
          (g) => html`<div class="logo-group"><div class="logo-group__title">${g.label} <span class="muted">${g.items.length}</span></div><div class="logo-grid">${g.items.map((b) => tile(b, selected))}</div></div>`,
        )}
        ${catalog.length
          ? html`<div class="logo-group"><div class="logo-group__title">Catálogo da Pluggy</div><div class="logo-grid">${catalog.map(
              (c) => html`<button type="button" class="logo-tile" data-pick="${String(c.id)}" aria-pressed="false" title="${c.name}">${instLogo({ name: c.name, imageUrl: c.imageUrl, primaryColor: c.primaryColor }, 'md')}<span>${c.name}</span></button>`,
            )}</div></div>`
          : ''}
        ${!hits.length && !catalog.length
          ? html`<p class="muted logo-empty">Nada encontrado para “${query}”.${
              catalogState === 'loading' ? ' Consultando o catálogo da Pluggy…' : catalogState === 'error' ? ` ${catalogMessage}` : ''
            } Você pode enviar uma imagem ou usar iniciais.</p>`
          : ''}`,
    );
  };

  const syncControls = () => {
    nameInput.value = draft.name;
    const imageRadio = q<HTMLInputElement>('[name="ident-logo"][value="image"]')!;
    imageRadio.disabled = !instImage();
    el.querySelectorAll<HTMLInputElement>('[name="ident-logo"]').forEach((r) => (r.checked = r.value === draft.logo));
    el.querySelectorAll<HTMLInputElement>('[name="ident-color"]').forEach((r) => (r.checked = r.value === draft.color.toUpperCase()));
    custom.value = draft.color.toLowerCase();
    iconGrid.hidden = draft.logo !== 'icon';
  };

  const repaint = () => {
    paintPreview();
    paintTargets();
    paintGallery();
  };

  /** Aplica um ícone da biblioteca ao alvo atual. */
  const applyBank = (b: BankIcon) => {
    if (target === 'inst' || (ident.source === 'unidentified' && !touched && b.kind === 'bank')) {
      // Conexão sem banco identificado: escolher um banco para um cartão também identifica a conexão.
      draft.bank = b.slug;
      draft.imageUrl = null;
      draft.connectorId = null;
      draft.logo = 'image';
      draft.color = usableIconColor(b) ?? draft.color;
      if (!nameEdited && b.kind === 'bank') draft.name = b.name;
      touched = true;
      if (target !== 'inst') notify('info', `Conexão identificada como ${b.name}`, 'O nome e o logo também passam a valer para a instituição. Ajuste se não for o caso.');
    }
    if (target !== 'inst') productDraft.set(target, b.slug === draft.bank && draft.logo === 'image' ? null : { bank: b.slug, imageUrl: null });
    syncControls();
    repaint();
  };

  const pickConnector = (c: ConnectorInfo) => {
    if (!nameEdited) draft.name = c.name;
    draft.imageUrl = c.imageUrl;
    draft.bank = null;
    draft.connectorId = c.id;
    if (isHexColor(c.primaryColor)) draft.color = c.primaryColor.toUpperCase();
    draft.logo = c.imageUrl ? 'image' : 'initials';
    touched = true;
    syncControls();
    repaint();
  };

  const searchNow = debounce((value: string) => {
    query = value;
    paintGallery();
    // Catálogo da Pluggy como reserva para buscas sem resultado local (só no modo real).
    if (!demo && target === 'inst' && value.trim().length >= 2 && searchBankIcons(value).length < 3 && !store.state.connectors.length && catalogState === 'idle') {
      catalogState = 'loading';
      paintGallery();
      void actions.ensureConnectors().then((r) => {
        catalogState = r.ok ? 'idle' : 'error';
        catalogMessage = r.ok ? '' : `Catálogo da Pluggy indisponível (${r.message ?? 'erro'}).`;
        paintGallery();
      });
    }
  }, 120);

  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t === nameInput) {
      draft.name = t.value;
      touched = true;
      nameEdited = true;
      q<HTMLElement>('[data-name-error]')!.hidden = true;
      paintPreview();
      paintTargets();
    } else if (t.matches('[data-search]')) {
      searchNow(t.value);
    } else if (t === custom) {
      const v = t.value.toUpperCase();
      if (isHexColor(v)) {
        draft.color = v;
        touched = true;
        el.querySelectorAll<HTMLInputElement>('[name="ident-color"]').forEach((r) => (r.checked = r.value === v));
        paintPreview();
        paintTargets();
      }
    } else if (t.matches('[data-nick]')) {
      paintPreview();
      paintTargets();
    }
  });

  el.addEventListener('change', async (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches('[data-upload]')) {
      const file = t.files?.[0];
      t.value = '';
      if (!file) return;
      try {
        const url = await imageFileToLogo(file);
        if (target === 'inst') {
          draft.imageUrl = url;
          draft.bank = null;
          draft.connectorId = null;
          draft.logo = 'image';
          touched = true;
        } else {
          productDraft.set(target, { bank: null, imageUrl: url });
        }
        syncControls();
        repaint();
      } catch (err) {
        notify('error', 'Imagem não usada', err instanceof Error ? err.message : String(err));
      }
      return;
    }
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
    repaint();
  });

  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const targetBtn = t.closest<HTMLElement>('[data-target]');
    if (targetBtn) {
      target = targetBtn.dataset.target === 'inst' ? 'inst' : targetBtn.dataset.target!;
      paintTargets();
      paintGallery();
      if (targetBtn.classList.contains('nick-row__logo')) q<HTMLElement>('.logo-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const bankBtn = t.closest<HTMLElement>('[data-bank]');
    if (bankBtn) {
      const b = bankIcon(bankBtn.dataset.bank);
      if (b) applyBank(b);
      return;
    }
    if (t.closest('[data-inherit]') && target !== 'inst') {
      productDraft.set(target, { bank: null, imageUrl: null, inherit: true });
      repaint();
      return;
    }
    const pickBtn = t.closest<HTMLElement>('[data-pick]');
    if (pickBtn) {
      const c = store.state.connectors.find((x) => String(x.id) === pickBtn.dataset.pick);
      if (c) pickConnector(c);
      return;
    }
    if (t.closest('[data-use-suggestion]') && ident.suggestion) {
      const sug = ident.suggestion;
      const b = bankIcon(sug.bank);
      const prev = target;
      target = 'inst';
      if (b) applyBank(b);
      else if (sug.connector) pickConnector(sug.connector);
      target = prev;
      draft.name = sug.name;
      nameInput.value = sug.name;
      touched = true;
      repaint();
      return;
    }
    const nicknames = () => Object.fromEntries(Array.from(el.querySelectorAll<HTMLInputElement>('[data-nick]')).map((i) => [i.dataset.nick!, i.value]));
    if (t.closest('[data-reset]')) {
      await actions.saveInstitutionCustomization(itemId, null, nicknames(), Object.fromEntries(products.map((p) => [p.id, null])));
      m.close();
      return;
    }
    if (t.closest('[data-save]')) {
      if (touched && !draft.name.trim()) {
        q<HTMLElement>('[data-name-error]')!.hidden = false;
        nameInput.setAttribute('aria-invalid', 'true');
        nameInput.focus();
        return;
      }
      const identity: InstitutionIdentity | null = touched
        ? {
            name: draft.name,
            color: draft.color,
            logo: draft.logo,
            icon: draft.logo === 'icon' ? draft.icon : null,
            connectorId: draft.connectorId,
            imageUrl: draft.bank ? null : draft.imageUrl,
            bank: draft.bank,
            updatedAt: new Date().toISOString(),
          }
        : userIdent;
      await actions.saveInstitutionCustomization(itemId, identity, nicknames(), Object.fromEntries(productDraft));
      m.close();
    }
  });

  repaint();
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
        both ? 'Se as datas da instituição não batem com a sua fatura, defina os dias abaixo: eles têm prioridade.' : 'Defina os dias para calcular a fatura atual, a previsão de fechamento e o melhor dia de compra.'
      }</div></div>
      <div class="form-grid-2">
        <label class="field"><span class="field__label">Dia de fechamento</span><select class="select" data-closing>${dayOptions(card.manualClosingDay)}</select></label>
        <label class="field"><span class="field__label">Dia de vencimento</span><select class="select" data-due>${dayOptions(card.manualDueDay)}</select></label>
      </div>
      <p class="field__hint">Os dias definidos aqui valem mesmo que a instituição informe outros. Em meses mais curtos vale o último dia do mês. Melhor dia de compra = dia seguinte ao fechamento.</p>
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
