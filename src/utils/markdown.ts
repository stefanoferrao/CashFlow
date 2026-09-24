/**
 * Markdown → HTML SEGURO, para as Notas de Atualização (texto que vem do GitHub, portanto não confiável).
 *
 * Tudo é escapado primeiro; só a marcação gerada aqui vira HTML. Suporta o que as notas usam:
 * títulos (#…####), parágrafos, listas (com um nível de aninhamento), listas numeradas, **negrito**,
 * *itálico*, `código`, blocos ``` ```, citações (>), linhas (---), tabelas simples e links http(s)
 * (abrem em nova aba, sem referrer). Imagens e HTML embutido NÃO são renderizados.
 */
import { escapeHtml, raw, type SafeHtml } from '../components/dom';

function safeUrl(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
}

/** Formatação dentro de uma linha. Recebe texto CRU e devolve HTML seguro. */
export function inlineMarkdown(text: string): string {
  // 1) separa trechos de código (não recebem outra formatação)
  const parts = text.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      let s = escapeHtml(part);
      // links [texto](https://…) — o texto já está escapado; a URL é validada e escapada.
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
        const url = safeUrl(href.replace(/&amp;/g, '&'));
        return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
      });
      // links "soltos"
      s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre: string, href: string) => {
        const url = safeUrl(href.replace(/&amp;/g, '&'));
        return url ? `${pre}<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${href}</a>` : m;
      });
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      return s;
    })
    .join('');
}

interface ListItem {
  text: string;
  children: string[];
}

export function renderMarkdown(md: string): SafeHtml {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const isBlank = (l: string) => /^\s*$/.test(l);
  const isList = (l: string) => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  const isHeading = (l: string) => /^#{1,6}\s+/.test(l);
  const isFence = (l: string) => /^\s*```/.test(l);
  const isRule = (l: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
  const isQuote = (l: string) => /^\s*>/.test(l);
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }
    if (isFence(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i]!)) buf.push(lines[i++]!);
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (isHeading(line)) {
      const level = Math.min(6, line.match(/^#+/)![0].length);
      // h1/h2 das notas viram h3/h4 dentro da página (a página já tem título).
      const tag = `h${Math.min(6, level + 2)}`;
      out.push(`<${tag}>${inlineMarkdown(line.replace(/^#+\s+/, '').replace(/\s+#+\s*$/, ''))}</${tag}>`);
      i++;
      continue;
    }
    if (isRule(line)) {
      out.push('<hr />');
      i++;
      continue;
    }
    if (isQuote(line)) {
      const buf: string[] = [];
      while (i < lines.length && isQuote(lines[i]!)) buf.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n')).value}</blockquote>`);
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]!)) rows.push(cells(lines[i++]!));
      out.push(
        `<div class="table-wrap"><table class="table"><thead><tr>${head.map((h) => `<th scope="col">${inlineMarkdown(h)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_, k) => `<td>${inlineMarkdown(r[k] ?? '')}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (isList(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const baseIndent = line.match(/^\s*/)![0].length;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        if (isBlank(l)) {
          // lista continua se a próxima linha não vazia for item
          let j = i + 1;
          while (j < lines.length && isBlank(lines[j]!)) j++;
          if (j < lines.length && isList(lines[j]!) && lines[j]!.match(/^\s*/)![0].length >= baseIndent) {
            i = j;
            continue;
          }
          break;
        }
        const indent = l.match(/^\s*/)![0].length;
        if (isList(l) && indent <= baseIndent + 1) {
          items.push({ text: l.replace(/^\s*([-*+]|\d+[.)])\s+/, ''), children: [] });
        } else if (isList(l) && items.length) {
          items[items.length - 1]!.children.push(l.replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        } else if (items.length && !isHeading(l) && !isFence(l)) {
          // continuação da linha do item
          items[items.length - 1]!.text += ` ${l.trim()}`;
        } else break;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}>${items
          .map((it) => `<li>${inlineMarkdown(it.text)}${it.children.length ? `<ul>${it.children.map((c) => `<li>${inlineMarkdown(c)}</li>`).join('')}</ul>` : ''}</li>`)
          .join('')}</${tag}>`,
      );
      continue;
    }
    // parágrafo: junta linhas até uma linha vazia ou outro bloco
    const buf: string[] = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]!) && !isList(lines[i]!) && !isHeading(lines[i]!) && !isFence(lines[i]!) && !isQuote(lines[i]!) && !isRule(lines[i]!) && !isTableRow(lines[i]!)) {
      buf.push(lines[i++]!.trim());
    }
    out.push(`<p>${inlineMarkdown(buf.join(' '))}</p>`);
  }
  return raw(out.join('\n'));
}
