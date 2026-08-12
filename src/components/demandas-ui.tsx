export const STATE_LABEL: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aguardando_cliente: "Aguardando cliente",
  aguardando_revisao_humana: "Aguardando revisão humana",
  concluido: "Concluído",
};

const STATE_COLOR: Record<string, { pill: string; dot: string }> = {
  novo: { pill: "bg-[oklch(0.55_0.2_264/0.1)] text-[oklch(0.44_0.2_264)]", dot: "bg-[oklch(0.55_0.2_264)]" },
  em_analise: { pill: "bg-[oklch(0.7_0.16_75/0.14)] text-[oklch(0.46_0.14_65)]", dot: "bg-[oklch(0.68_0.16_70)]" },
  aguardando_cliente: { pill: "bg-[oklch(0.68_0.17_40/0.14)] text-[oklch(0.5_0.17_38)]", dot: "bg-[oklch(0.66_0.17_40)]" },
  aguardando_revisao_humana: { pill: "bg-[oklch(0.65_0.16_300/0.14)] text-[oklch(0.45_0.16_300)]", dot: "bg-[oklch(0.62_0.16_300)]" },
  concluido: { pill: "bg-[oklch(0.62_0.15_162/0.14)] text-[oklch(0.42_0.14_162)]", dot: "bg-[oklch(0.58_0.15_162)]" },
};

export function StateBadge({ state }: { state: string }) {
  const c = STATE_COLOR[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${c?.pill ?? "bg-secondary text-secondary-foreground"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c?.dot ?? "bg-muted-foreground"}`} />
      {STATE_LABEL[state] ?? state}
    </span>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  baixa: "bg-secondary text-muted-foreground",
  media: "bg-[oklch(0.55_0.2_264/0.09)] text-[oklch(0.45_0.18_264)]",
  alta: "bg-[oklch(0.68_0.17_50/0.14)] text-[oklch(0.48_0.16_45)]",
  urgente: "bg-destructive/12 text-destructive",
};
export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${PRIORITY_COLOR[priority] ?? "bg-secondary text-muted-foreground"}`}
    >
      {priority}
    </span>
  );
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