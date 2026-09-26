import {
  AlertTriangle,
  CheckCheck,
  CircleDashed,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Abas da fila: escopo (Fila/Minhas/Órfãs) + corte de SLA (Atrasadas). */
export type FilaTab = "fila" | "minhas" | "orfas" | "atrasadas";

/** Contagens das 4 abas (head counts do servidor, independentes da paginação). */
export type FilaCounts = { fila: number; mine: number; orphan: number; overdue: number };

/** Opções do filtro de estado (mesma ordem e rótulos do menu anterior). */
const STATES = [
  { v: undefined, label: "Todas" },
  { v: "novo", label: "Novo" },
  { v: "em_analise", label: "Em análise" },
  { v: "aguardando_cliente", label: "Aguardando cliente" },
  { v: "aguardando_revisao_humana", label: "Aguardando revisão" },
  { v: "concluido", label: "Concluído" },
] as const;

/** Cor do dot de estado no gatilho do filtro (mesmos tokens da borda do card). */
function stateDotColor(v: string | undefined): string {
  switch (v) {
    case "novo":
      return "bg-[var(--state-novo)]";
    case "em_analise":
      return "bg-[var(--state-analise)]";
    case "aguardando_cliente":
      return "bg-[var(--state-aguardando)]";
    case "aguardando_revisao_humana":
      return "bg-[var(--pill-violet-fg)]";
    case "concluido":
      return "bg-[var(--state-resolvido)]";
    default:
      return "bg-muted-foreground/30";
  }
}

/**
 * Barra de ferramentas do topo da fila — componente 100% controlado
 * (sem estado de negócio próprio: tab, busca, filtro e mutations vivem
 * no route; popovers/menus gerenciam apenas abrir/fechar).
 *
 * Layout em linha única: strip de abas à esquerda (com scroll horizontal
 * só quando não cabe, no mobile) + cluster de ações à direita (busca em
 * popover, filtro de estado, ações secundárias e o `+` primário).
 * Pills de Minhas/Órfãs somem no zero (padrão sidebar); Atrasadas vira
 * ícone vermelho quando >0.
 */
export function FilaHeaderToolbar({
  tab,
  onTabChange,
  counts,
  search,
  onSearchChange,
  state,
  onStateChange,
  canMarkAll,
  markingAll,
  onMarkAllRead,
  onNewDemanda,
}: {
  tab: FilaTab;
  onTabChange: (t: FilaTab) => void;
  counts: FilaCounts;
  search: string;
  onSearchChange: (v: string) => void;
  state: string | undefined;
  onStateChange: (v: string | undefined) => void;
  canMarkAll: boolean;
  markingAll: boolean;
  onMarkAllRead: () => void;
  onNewDemanda: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      {/* Abas Fila / Minhas / Órfãs / Atrasadas — strip única,
          scroll horizontal só quando não cabe (mobile). */}
      <div className="flex items-center gap-0.5 rounded-xl bg-muted/70 p-1 min-w-0 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => onTabChange("fila")}
          className={`flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold transition-all ${
            tab === "fila"
              ? "bg-card text-foreground shadow-[var(--shadow-card)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Fila
          <span className="rounded-full bg-primary/10 px-0.5 py-px text-[10px] font-bold tabular-nums text-primary">
            {counts.fila}
          </span>
        </button>
        <button
          onClick={() => onTabChange("minhas")}
          title="Minhas demandas"
          aria-label="Minhas demandas"
          className={`flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold transition-all ${
            tab === "minhas"
              ? "bg-card text-foreground shadow-[var(--shadow-card)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserRound className="h-3.5 w-3.5" />
          {counts.mine > 0 && (
            <span
              className={`rounded-full px-0.5 py-px text-[10px] font-bold tabular-nums ${
                tab === "minhas" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"
              }`}
            >
              {counts.mine}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange("orfas")}
          title="Sem responsável (órfãs)"
          aria-label="Sem responsável (órfãs)"
          className={`flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold transition-all ${
            tab === "orfas"
              ? "bg-card text-foreground shadow-[var(--shadow-card)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CircleDashed className="h-3.5 w-3.5" />
          {counts.orphan > 0 && (
            <span
              className={`rounded-full px-0.5 py-px text-[10px] font-bold tabular-nums ${
                tab === "orfas" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"
              }`}
            >
              {counts.orphan}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange("atrasadas")}
          title="Atrasadas (SLA estourado)"
          aria-label="Atrasadas (SLA estourado)"
          className={`flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold transition-all ${
            tab === "atrasadas"
              ? "bg-card text-foreground shadow-[var(--shadow-card)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle
            className={`h-3.5 w-3.5 ${counts.overdue > 0 ? "text-[var(--pill-red-fg)]" : ""}`}
            strokeWidth={2.2}
          />
          {counts.overdue > 0 && (
            <span className="rounded-full bg-[var(--pill-red-bg)] px-0.5 py-px text-[10px] font-bold tabular-nums text-[var(--pill-red-fg)]">
              {counts.overdue}
            </span>
          )}
        </button>
      </div>

      {/* Cluster de ações + ação primária */}
      <div className="flex items-center gap-0.5 shrink-0">
        <div className="flex items-center gap-0.5 rounded-xl bg-muted/70 p-1">
          {/* Busca — ícone abre popover com o campo, some quando fecha */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                title="Buscar"
                aria-label="Buscar"
                className="relative grid place-items-center h-7 w-7 rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground hover:shadow-sm"
              >
                <Search className="h-3.5 w-3.5" />
                {search && (
                  <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Buscar demanda ou contato..."
                  className="h-9 pl-8 pr-7 rounded-xl border border-border/60 bg-background text-xs w-full outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
                {search && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {/* Filtro de estado — ícone abre menu, fecha sozinho ao escolher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Filtrar por status"
                aria-label="Filtrar por status"
                className="relative grid place-items-center h-7 w-7 rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground hover:shadow-sm"
              >
                <Filter className="h-3.5 w-3.5" />
                {state && (
                  <span
                    className={`absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full ${stateDotColor(state)}`}
                  />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl">
              {STATES.map((s) => (
                <DropdownMenuItem
                  key={s.label}
                  onClick={() => onStateChange(s.v)}
                  className={`gap-2 text-xs cursor-pointer rounded-lg ${
                    state === s.v ? "font-semibold text-primary" : ""
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${stateDotColor(s.v)}`} />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Mais opções — ações secundárias (a primária é o + ao lado).
              w-56: o w-196 anterior virava 784px no Tailwind v4 (menu gigante). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Mais opções"
                aria-label="Mais opções"
                className="grid place-items-center h-7 w-7 rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground hover:shadow-sm"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuItem
                onClick={onMarkAllRead}
                disabled={markingAll || !canMarkAll}
                className="gap-2 text-xs cursor-pointer rounded-lg"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAll ? "Marcando..." : "Marcar todas como lidas"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Ação primária: nova demanda (visível, nunca escondida) */}
        <button
          onClick={onNewDemanda}
          title="Nova demanda"
          aria-label="Nova demanda"
          className="grid place-items-center h-7 w-7 rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:brightness-110 hover:shadow-md active:scale-[0.96]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}