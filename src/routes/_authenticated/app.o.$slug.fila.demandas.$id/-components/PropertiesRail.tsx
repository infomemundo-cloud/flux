import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PanelRightClose,
  Trash2,
  UserCheck,
  Flag,
  CalendarClock,
  UserCog,
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { STATE_COLOR } from "@/lib/demandas/state-colors";
import { STATE_LABEL } from "@/components/demandas-ui";

const NEXT_STATES = ["novo", "em_analise", "aguardando_cliente", "aguardando_revisao_humana", "concluido"] as const;
const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;

/** Classe compartilhada dos "gatilhos" compactos do trilho (Select e Prazo). */
export const RAIL_TRIGGER_CLS =
  "w-full h-8 px-2 rounded-md border border-border/60 bg-card text-xs font-medium text-left hover:bg-accent/50 focus:ring-1 focus:ring-ring transition-colors";

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDueLabel(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Popover de prazo (calendário + hora/minuto) — usado só pelo trilho. */
function DueDatePicker({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfDay(value ? new Date(value) : new Date()));
  const [selected, setSelected] = useState<Date | null>(value ? new Date(value) : null);
  const [hour, setHour] = useState(value ? new Date(value).getHours() : new Date().getHours());
  const [minute, setMinute] = useState(value ? new Date(value).getMinutes() : 0);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const base = value ? new Date(value) : new Date();
      setView(startOfDay(base));
      setSelected(value ? new Date(value) : null);
      setHour(value ? new Date(value).getHours() : new Date().getHours());
      setMinute(value ? new Date(value).getMinutes() : 0);
    }
    setOpen(next);
  };

  const commit = (day: Date, h: number, m: number) => {
    const dt = new Date(day);
    dt.setHours(h, m, 0, 0);
    onChange(dt.toISOString());
  };

  const pickDay = (day: Date) => {
    setSelected(day);
    commit(day, hour, minute);
  };

  const changeHour = (h: number) => {
    setHour(h);
    if (selected) commit(selected, h, minute);
  };

  const changeMinute = (m: number) => {
    setMinute(m);
    if (selected) commit(selected, hour, m);
  };

  const pickToday = () => {
    const now = new Date();
    const day = startOfDay(now);
    setSelected(day);
    setView(day);
    setHour(now.getHours());
    setMinute(now.getMinutes());
    commit(day, now.getHours(), now.getMinutes());
  };

  const cells: { date: Date; inMonth: boolean }[] = [];
  const firstWeekday = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const daysInPrev = new Date(view.getFullYear(), view.getMonth(), 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(view.getFullYear(), view.getMonth() - 1, daysInPrev - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(view.getFullYear(), view.getMonth(), d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }

  const todayMs = startOfDay(new Date()).getTime();
  const selectedMs = selected ? startOfDay(selected).getTime() : null;

  const navBtn =
    "grid place-items-center h-7 w-7 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-90 transition-all duration-150";
  const timeSelect =
    "h-8 flex-1 rounded-md border border-border/60 bg-card px-1.5 text-xs font-medium tabular-nums text-foreground outline-none transition-colors hover:bg-accent/50 focus:ring-1 focus:ring-ring cursor-pointer";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className={`${RAIL_TRIGGER_CLS} group flex items-center justify-between gap-1.5`}>
          {value ? (
            <span className="truncate tabular-nums">{formatDueLabel(value)}</span>
          ) : (
            <span className="text-muted-foreground font-normal">Sem prazo</span>
          )}
          <CalendarClock className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="center"
        sideOffset={10}
        collisionPadding={12}
        className="w-[252px] rounded-xl border-border/60 p-3 shadow-lg max-h-[calc(100vh-24px)] overflow-y-auto scrollbar-thin"
      >
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            className={navBtn}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="text-xs font-semibold capitalize text-foreground">
            {MONTHS_PT[view.getMonth()]} {view.getFullYear()}
          </div>
          <button
            type="button"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            className={navBtn}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {WEEKDAYS_PT.map((w, i) => (
            <div key={i} className="grid h-6 place-items-center text-[10px] font-semibold text-muted-foreground/60">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((c, i) => {
            const ms = startOfDay(c.date).getTime();
            const isSel = ms === selectedMs;
            const isToday = ms === todayMs;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pickDay(c.date)}
                className={`grid h-7 w-7 place-items-center rounded-lg text-[11px] tabular-nums transition-all duration-150 active:scale-90 ${
                  isSel
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm scale-105"
                    : isToday
                    ? "text-primary font-semibold ring-1 ring-primary/40 hover:bg-primary/10"
                    : c.inMonth
                    ? "text-foreground hover:bg-secondary"
                    : "text-muted-foreground/40 hover:bg-secondary/60"
                }`}
              >
                {c.date.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-2.5">
          <Clock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <select aria-label="Hora" value={hour} onChange={(e) => changeHour(Number(e.target.value))} className={timeSelect}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {pad2(h)}
              </option>
            ))}
          </select>
          <span className="text-xs font-semibold text-muted-foreground">:</span>
          <select aria-label="Minuto" value={minute} onChange={(e) => changeMinute(Number(e.target.value))} className={timeSelect}>
            {Array.from({ length: 60 }, (_, m) => (
              <option key={m} value={m}>
                {pad2(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:text-destructive hover:bg-destructive/10 active:scale-95"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={pickToday}
            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-all duration-150 hover:bg-primary/10 active:scale-95"
          >
            Hoje
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Trilho de propriedades (Estado/Prioridade/Prazo/Responsável + Zona de Perigo).
 * Puramente apresentacional + estado local de confirmação de exclusão;
 * mutations e identidade de atores vêm prontas do route via props.
 */
export function PropertiesRail({
  demanda,
  onUpdate,
  onCollapseRail,
  orgUserId,
  isManager,
  operators,
  nameOf,
  canDelete,
  onDelete,
  deletePending,
}: {
  demanda: { state: string; priority: string; due_at: string | null; assignee_id: string | null };
  onUpdate: (patch: Record<string, unknown>) => void;
  onCollapseRail: () => void;
  orgUserId?: string;
  isManager: boolean;
  operators: { user_id: string; email: string | null }[];
  nameOf: (uid?: string | null, fallback?: string) => string;
  canDelete: boolean;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <aside className="hidden md:flex md:flex-col w-[195px] shrink-0 border-l border-border/80 bg-muted/15 select-none overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-card/50">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Propriedades</span>
        <button
          onClick={onCollapseRail}
          title="Recolher painel"
          aria-label="Recolher painel"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="divide-y divide-border/50 text-xs">
        <div className="p-2.5 space-y-1">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Estado
          </label>
          <Select value={demanda.state} onValueChange={(v) => onUpdate({ state: v })}>
            <SelectTrigger className={RAIL_TRIGGER_CLS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="text-xs">
              {NEXT_STATES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${STATE_COLOR[s] ?? "bg-muted-foreground/40"}`} />
                    {STATE_LABEL[s]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="p-2.5 space-y-1">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Flag className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Prioridade
          </label>
          <Select value={demanda.priority} onValueChange={(v) => onUpdate({ priority: v })}>
            <SelectTrigger className={RAIL_TRIGGER_CLS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="text-xs">
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p} className="text-xs capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="p-2.5 space-y-1">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Prazo
          </label>
          <DueDatePicker value={demanda.due_at ?? null} onChange={(iso) => onUpdate({ due_at: iso })} />
        </div>
        {orgUserId !== undefined && (
          <div className="p-2.5 space-y-1">
            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <UserCog className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Responsável
            </label>
            {isManager ? (
              <Select
                value={demanda.assignee_id ?? "none"}
                onValueChange={(v) => onUpdate({ assignee_id: v === "none" ? null : v })}
              >
                <SelectTrigger className={RAIL_TRIGGER_CLS}>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent align="end" className="text-xs">
                  <SelectItem value="none" className="text-xs">
                    — Sem responsável —
                  </SelectItem>
                  {operators.map((o) => (
                    <SelectItem key={o.user_id} value={o.user_id} className="text-xs">
                      {o.email ?? o.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className={`${RAIL_TRIGGER_CLS} flex items-center truncate`}>
                {demanda.assignee_id ? nameOf(demanda.assignee_id) : <span className="text-muted-foreground font-normal">Sem responsável</span>}
              </div>
            )}
            {demanda.assignee_id !== orgUserId && (
              <button
                onClick={() => onUpdate({ assignee_id: orgUserId })}
                className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <UserCheck className="h-3 w-3" /> Atribuir a mim
              </button>
            )}
          </div>
        )}
      </div>
      {canDelete && (
        <div className="mt-auto border-t border-border/60 p-2.5 bg-card/40">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full h-7 flex items-center justify-center gap-1.5 rounded-md border border-destructive/20 text-destructive text-[11px] font-medium hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Excluir demanda
            </button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground text-center">Excluir permanentemente?</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deletePending}
                  className="h-7 flex-1 rounded border border-border bg-card text-[11px] font-medium hover:bg-secondary"
                >
                  Não
                </button>
                <button
                  onClick={onDelete}
                  disabled={deletePending}
                  className="h-7 flex-1 rounded bg-destructive text-destructive-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {deletePending ? "..." : "Sim"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
