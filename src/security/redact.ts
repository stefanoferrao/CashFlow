/**
 * Redação de dados sensíveis para logs de depuração LOCAIS.
 * Nenhum log sai do navegador (não há analytics/telemetria no CashFlow).
 */

const SENSITIVE_KEY = /secret|apikey|api_key|x-api-key|token|password|passphrase|senha|authorization|clientid|client_id|taxnumber|cpf|cnpj|document/i;
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function redactString(s: string): string {
  return s
    .replace(JWT, '[jwt-redigido]')
    .replace(CNPJ, '[cnpj-redigido]')
    .replace(CPF, '[cpf-redigido]')
    .replace(UUID, (m) => `${m.slice(0, 4)}…${m.slice(-4)}`);
}

export function redact(value: unknown): string {
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) return redactString(`${value.name}: ${value.message}`);
  try {
    const json = JSON.stringify(value, (key, v) => (key && SENSITIVE_KEY.test(key) ? '[redigido]' : v));
    return redactString(json ?? String(value));
  } catch {
    return '[não serializável]';
  }
}

let debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

/** Log de depuração local e redigido. Desligado por padrão (Configurações → Sobre → modo de depuração). */
export function debugLog(scope: string, ...args: unknown[]): void {
  if (!debugEnabled) return;
  // eslint-disable-next-line no-console
  console.debug(`[CashFlow:${scope}]`, ...args.map(redact));
}
