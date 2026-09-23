/**
 * Barramento de notificações: a camada de ações não conhece a UI;
 * o componente de toasts se inscreve aqui.
 */
export type NotifyKind = 'success' | 'error' | 'warn' | 'info';

export interface Notification {
  kind: NotifyKind;
  title: string;
  message?: string;
}

type Listener = (n: Notification) => void;
const listeners = new Set<Listener>();

export function notify(kind: NotifyKind, title: string, message?: string): void {
  const n: Notification = message === undefined ? { kind, title } : { kind, title, message };
  for (const l of listeners) l(n);
}

export function onNotify(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
