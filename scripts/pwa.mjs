/**
 * PWA — gera dist/sw.js a partir de scripts/sw.template.js com a lista de arquivos do build (precache)
 * e uma versão derivada do conteúdo. Usado pelo plugin do Vite (vite.config.ts) depois do build.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Fora do precache: logos (baixados sob demanda), o próprio SW e arquivos que não são do app. */
const SKIP = [/^banks\//, /^sw\.js$/, /\.map$/, /^icons\/icon-maskable\.svg$/, /(^|\/)\.[^/]+$/, /LICENSE/i];

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function writeServiceWorker(outDir) {
  const files = listFiles(outDir)
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(f).update(fs.readFileSync(path.join(outDir, f)));
  const version = hash.digest('hex').slice(0, 12);
  const precache = ['./', ...files.map((f) => `./${f}`)];
  const template = fs.readFileSync(path.join(here, 'sw.template.js'), 'utf8');
  const sw = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2));
  fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
  return { version, count: precache.length };
}

/** Marca o HTML de produção: só ele registra o service worker (o servidor de desenvolvimento não). */
export function markProductionHtml(html) {
  return html.replace(/<html(\s[^>]*)?>/, (m) => (m.includes('data-sw=') ? m : m.replace('<html', '<html data-sw="on"')));
}
