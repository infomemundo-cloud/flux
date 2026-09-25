/**
 * Modos de distribuição automática de demandas (fonte única, espelho do
 * sla-options.ts). Usada pelo card da UI (labels) e pelo serviço
 * (valores canônicos).
 *
 * Padrão de mercado (Zendesk/Freshdesk/Intercom):
 * - round_robin: fila circular sequencial entre operadores ativos
 * - least_busy: atribui ao operador com menor carga de demandas abertas
 */
export const ASSIGNMENT_MODES = [
  { value: "round_robin", label: "Revezamento (round-robin)", description: "Fila circular sequencial entre os operadores ativos." },
  { value: "least_busy", label: "Menor carga de trabalho", description: "Atribui ao operador com menor número de demandas em aberto." },
] as const;

export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number]["value"];

export const ASSIGNMENT_MODE_DEFAULT: AssignmentMode = "round_robin";

/** Rótulo humanizado pra um modo (fallback: valor cru). */
export function assignmentModeLabel(mode: string): string {
  return ASSIGNMENT_MODES.find((m) => m.value === mode)?.label ?? mode;
}