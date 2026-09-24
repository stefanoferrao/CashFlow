#!/usr/bin/env node
/**
 * Gera os ícones PNG do PWA a partir do desenho do favicon (public/favicon.svg).
 * Uso: node scripts/generate-pwa-icons.mjs   (usa o Chromium do Playwright, já instalado como devDependency)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'));
}

const BG = '#0F1115';
const GLYPH = '<path d="M18 40 L28 30 L35 36 L47 22" fill="none" stroke="#22C55E" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="47" cy="22" r="4" fill="#22C55E"/>';
// "any": cantos arredondados (como o favicon). "maskable"/Apple: fundo em toda a área (o sistema recorta).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BG}"/>${GLYPH}</svg>`;
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/><g transform="translate(6.4 6.4) scale(0.8)">${GLYPH}</g></svg>`;
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/><g transform="translate(3.2 3.2) scale(0.9)">${GLYPH}</g></svg>`;

const targets = [
  ['icon-192.png', 192, rounded],
  ['icon-512.png', 512, rounded],
  ['icon-maskable-192.png', 192, fullBleed],
  ['icon-maskable-512.png', 512, fullBleed],
  ['apple-touch-icon.png', 180, apple],
  ['favicon-32.png', 32, rounded],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, svg] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✓', name);
}
fs.writeFileSync(path.join(out, 'icon-maskable.svg'), fullBleed);
await browser.close();
