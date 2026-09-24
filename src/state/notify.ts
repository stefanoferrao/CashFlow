/**
 * Barramento de notificações: a camada de ações não conhece a UI;
 * o componente de toasts se inscreve aqui.
 */
export type NotifyKind = 'success' | 'error' | 'warn' | 'info';

export interface Notification {
  kind: NotifyKind;
  title: string;
  message?: string;
  /** Botão no aviso (ex.: "Atualizar"). */
  action?: { label: string; run: () => void };
  /** Não some sozinho (até o usuário agir ou fechar). */
  sticky?: boolean;
}

type Listener = (n: Notification) => void;
const listeners = new Set<Listener>();

export function notify(kind: NotifyKind, title: string, message?: string): void {
  const n: Notification = message === undefined ? { kind, title } : { kind, title, message };
  for (const l of listeners) l(n);
}

/** Aviso com botão de ação (fica na tela até o usuário responder). */
export function notifyAction(kind: NotifyKind, title: string, message: string, action: { label: string; run: () => void }): void {
  const n: Notification = { kind, title, message, action, sticky: true };
  for (const l of listeners) l(n);
}

export function onNotify(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
