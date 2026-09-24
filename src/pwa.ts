/**
 * PWA — registro do service worker, aviso de nova versão e instalação do aplicativo.
 *
 * O service worker só existe no build de produção (o index.html de produção traz data-sw="on").
 * Ele guarda apenas os arquivos do app e logos; dados e credenciais continuam só no IndexedDB, cifrados.
 */
import { notify, notifyAction } from './state/notify';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  /** Já está rodando como aplicativo instalado. */
  | 'installed'
  /** O navegador oferece instalação (Chrome, Edge, Android). */
  | 'available'
  /** iPhone/iPad: instalação manual pelo menu Compartilhar do Safari. */
  | 'ios'
  /** Navegador sem suporte a instalação ou já instalado em outra janela. */
  | 'unsupported';

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function isStandalone(): boolean {
  return (
    installedNow ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function installState(): InstallState {
  if (isStandalone()) return 'installed';
  if (deferred) return 'available';
  if (isIos()) return 'ios';
  return 'unsupported';
}

export function onInstallStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Abre o diálogo de instalação do navegador. Devolve true se o usuário aceitou. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  emit();
  return outcome === 'accepted';
}

let updateRequested = false;

function offerUpdate(worker: ServiceWorker): void {
  notifyAction('info', 'Nova versão do CashFlow', 'Atualize para usar a versão mais recente. Seus dados não são afetados.', {
    label: 'Atualizar agora',
    run: () => {
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    },
  });
}

async function registerServiceWorker(): Promise<void> {
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => {
      // Só é "atualização" se já havia uma versão controlando a página (na primeira instalação, não).
      if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) window.location.reload();
  });
  // Procura versão nova ao voltar para o app e a cada 6 horas.
  const check = () => void reg.update().catch(() => undefined);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, 6 * 3600_000);
}

export function setupPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // o app mostra o próprio botão "Instalar" (Configurações e menu)
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    emit();
    notify('success', 'CashFlow instalado', 'Abra pelo ícone na tela inicial ou no menu de aplicativos.');
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);

  if (!('serviceWorker' in navigator) || document.documentElement.dataset.sw !== 'on') return;
  if (!window.isSecureContext) return;
  const start = () => void registerServiceWorker().catch(() => undefined);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
