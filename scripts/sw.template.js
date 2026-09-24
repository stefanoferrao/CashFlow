/*
 * CashFlow — service worker (gerado no build por scripts/pwa.mjs; não editar dist/sw.js).
 *
 * O que ele guarda: SOMENTE arquivos estáticos do próprio app (HTML, JS, CSS, fontes, ícones) e logos de
 * instituições. NUNCA guarda respostas da API da Pluggy, credenciais ou dados financeiros — esses continuam
 * cifrados no IndexedDB e as chamadas à Pluggy passam direto pela rede.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `cashflow-shell-${VERSION}`;
const BANKS = 'cashflow-banks-v1';
const LOGOS = 'cashflow-logos-v1';
const MAX_LOGOS = 40;
const scopeUrl = new URL('./', self.location.href);
const indexUrl = new URL('./index.html', self.location.href).href;
/** Só estes caminhos (e os logos em /banks/) são servidos do cache — qualquer outra coisa vai direto à rede. */
const APP_PATHS = new Set(PRECACHE.map((u) => new URL(u, self.location.href).pathname));
const BANKS_PATH = `${scopeUrl.pathname}banks/`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE.map((u) => new Request(new URL(u, self.location.href).href, { cache: 'reload' })))),
  );
  // Não chama skipWaiting(): a página pergunta ao usuário antes de trocar de versão.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('cashflow-shell-') && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(scopeUrl.pathname) || url.pathname.includes('/pluggy-api')) return; // proxy local da Pluggy: nunca
    if (req.mode === 'navigate') {
      event.respondWith(navigation(req));
      return;
    }
    if (url.pathname.startsWith(BANKS_PATH) && url.pathname.endsWith('.svg')) {
      event.respondWith(cacheFirst(req, BANKS));
      return;
    }
    if (APP_PATHS.has(url.pathname)) event.respondWith(shellAsset(req));
    return;
  }

  // Logos do catálogo da Pluggy (imagens). API, Pluggy Connect e scripts de terceiros: sempre rede, sem cache.
  if (url.hostname === 'cdn.pluggy.ai' && req.destination === 'image') {
    event.respondWith(staleWhileRevalidate(req, LOGOS));
  }
});

/** Página: rede primeiro (versão nova quando online); sem rede, o index.html guardado. */
async function navigation(req) {
  try {
    const res = await withTimeout(fetch(req), 5000);
    if (res && res.ok) {
      const cache = await caches.open(SHELL);
      await cache.put(indexUrl, res.clone());
    }
    return res;
  } catch {
    const cached = (await caches.match(indexUrl)) || (await caches.match(req));
    return cached || new Response('<!doctype html><meta charset="utf-8"><title>CashFlow</title><p>Sem conexão e sem cópia do app neste aparelho.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/** Arquivos do app: cache primeiro (nomes com hash nunca mudam de conteúdo). */
async function shellAsset(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    const cache = await caches.open(SHELL);
    await cache.put(req, res.clone());
  }
  return res;
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then(async (res) => {
      if (res.ok || res.type === 'opaque') {
        await cache.put(req, res.clone());
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_LOGOS))) await cache.delete(k);
      }
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
