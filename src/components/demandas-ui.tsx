export const STATE_LABEL: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aguardando_cliente: "Aguardando cliente",
  aguardando_revisao_humana: "Aguardando revisão humana",
  concluido: "Concluído",
};

const STATE_COLOR: Record<string, string> = {
  novo: "bg-[oklch(0.55_0.18_250/0.15)] text-[oklch(0.4_0.18_250)] border-[oklch(0.55_0.18_250/0.3)]",
  em_analise: "bg-[oklch(0.65_0.18_80/0.15)] text-[oklch(0.42_0.15_80)] border-[oklch(0.65_0.18_80/0.3)]",
  aguardando_cliente: "bg-[oklch(0.65_0.18_40/0.15)] text-[oklch(0.5_0.18_40)] border-[oklch(0.65_0.18_40/0.3)]",
  aguardando_revisao_humana: "bg-[oklch(0.65_0.16_290/0.15)] text-[oklch(0.42_0.16_290)] border-[oklch(0.65_0.16_290/0.3)]",
  concluido: "bg-[oklch(0.6_0.17_160/0.15)] text-[oklch(0.4_0.17_160)] border-[oklch(0.6_0.17_160/0.3)]",
};

export function StateBadge({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATE_COLOR[state] ?? ""}`}>
      {STATE_LABEL[state] ?? state}
    </span>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  baixa: "text-muted-foreground",
  media: "text-[oklch(0.5_0.15_240)]",
  alta: "text-[oklch(0.55_0.18_60)]",
  urgente: "text-destructive font-semibold",
};
export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`text-xs uppercase tracking-wide ${PRIORITY_COLOR[priority] ?? ""}`}>{priority}</span>;
}

export function formatRelative(iso: string) {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `há ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}