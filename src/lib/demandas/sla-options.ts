/**
 * Lista harmonizada de SLA de inatividade (padrão de mercado: Zendesk/
 * Intercom/Freshdesk): cobre turno de trabalho (4h/8h), dia útil (24h),
 * 2 dias e semana — sem granularidade excessiva pra gestor não-técnico.
 * FONTE ÚNICA: usada pela aba Atendimento (regra) e, no Passo 2, pela
 * página de Alertas (filtro de exploração) e pelo badge da sidebar.
 */
export const SLA_HOUR_OPTIONS = [
  { value: 1, label: "1 hora" },
  { value: 4, label: "4 horas" },
  { value: 8, label: "8 horas" },
  { value: 24, label: "24 horas (1 dia)" },
  { value: 48, label: "48 horas (2 dias)" },
  { value: 168, label: "7 dias" },
] as const;

export type SlaHours = (typeof SLA_HOUR_OPTIONS)[number]["value"];

export const SLA_DEFAULT_HOURS = 24;

/** Rótulo humanizado pra um valor em horas (fallback: "X horas"). */
export function slaHoursLabel(hours: number): string {
  return SLA_HOUR_OPTIONS.find((o) => o.value === hours)?.label ?? `${hours} horas`;
}