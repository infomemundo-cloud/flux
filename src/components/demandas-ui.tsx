import { CalendarClock, Hash, MessageCircle, User } from "lucide-react";

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

/** Tag de filtro elegante (usada no topo da Fila). */
export function FilterTag({
  active,
  count,
  children,
  onClick,
}: {
  active: boolean;
  count?: number;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold transition-all active:scale-[0.97] ${
        active
          ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_var(--primary)]"
          : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/35 hover:bg-primary/[0.03] shadow-[var(--shadow-card)]"
      }`}
    >
      {children}
      {typeof count === "number" && (
        <span
          className={`min-w-[1.25rem] px-1 rounded-md text-[10px] font-bold leading-4 tabular-nums ${
            active ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Identificador curto da demanda (protocolo quando existir). */
export function ProtocolChip({ protocol, id }: { protocol?: string | null; id: string }) {
  const label = protocol || `#${id.slice(0, 6).toUpperCase()}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground tabular-nums">
      <Hash className="h-3 w-3" strokeWidth={2.4} />
      {label.replace(/^#/, "")}
    </span>
  );
}

/** Contato com ícone do canal (WhatsApp quando aplicável). */
export function ContactLine({
  contact,
  channel,
}: {
  contact?: { name?: string | null; phone?: string | null } | null;
  channel?: { kind?: string | null } | null;
}) {
  const isWhats = (channel?.kind ?? "").toLowerCase().includes("whats");
  const name = contact?.name || contact?.phone || "Sem contato";
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
      {isWhats ? (
        <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[oklch(0.6_0.15_150)]" strokeWidth={2.2} />
      ) : (
        <User className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
      )}
      <span className="truncate font-medium text-foreground/80">{name}</span>
      {contact?.name && contact?.phone && <span className="hidden sm:inline truncate">· {contact.phone}</span>}
    </span>
  );
}

/** Prazo com destaque quando atrasado. */
export function DueChip({ dueAt, overdue }: { dueAt: string; overdue?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${
        overdue ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"
      }`}
    >
      <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.2} />
      {new Date(dueAt).toLocaleDateString("pt-BR")}
    </span>
  );
}

export function UrgentTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-destructive">
      URGENTE
    </span>
  );
}