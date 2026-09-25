/**
 * Estado global "Modo Avançado" persistido em localStorage.
 * Revela configurações técnicas (URLs de webhook, criação de tokens,
 * diagnósticos de infraestrutura) pra usuários que precisam (ex: integração
 * com CRM externo). 95% dos gestores nunca ativam.
 */
const STORAGE_KEY = "flux:advanced_mode";

export function getAdvancedMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setAdvancedMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}