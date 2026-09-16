import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { listDemandas } from "@/lib/demandas/demandas.functions";
import { orgDashboard } from "@/lib/demandas/demandas-analytics.functions";
import { STATE_LABEL, PriorityBadge } from "@/components/demandas-ui";
import { AiSuggestionsCard, MemberAvatar, Sparkline, TeamSelector, type TeamOption } from "@/components/dashboard-ui";
import { AlertTriangle, CheckCircle2, Inbox, Info, Layers, Target, TrendingUp } from "lucide-react";
import { DashboardSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/app/o/$slug/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Fluxo" }] }),
  component: Dashboard,
});

const MANAGER_ROLES = new Set(["owner", "admin", "gerente"]);
const COLUMN_STATES = ["novo", "em_analise", "aguardando_cliente", "aguardando_revisao_humana"] as const;

// Scope selector value semantics:
// "me" -> current user | "triage" -> unassigned | "all" -> everyone | UUID -> specific operator
type Scope = "me" | "triage" | "all" | string;

function Dashboard() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/dashboard" });
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });
  const isManager = !!org && MANAGER_ROLES.has(org.role);

  const [scope, setScope] = useState<Scope>(isManager ? "all" : "me");
  // Keep default in sync once org loads
  const effectiveScope: Scope = scope;

  const dashFn = useServerFn(orgDashboard);
  const opsFn = useServerFn(listOperators);

  const scopeFilter = useMemo(() => {
    if (effectiveScope === "me") return { assigneeId: org?.userId } as const;
    if (effectiveScope === "triage") return { assigneeId: null } as const;
    if (effectiveScope === "all") return {} as const;
    return { assigneeId: effectiveScope } as const;
  }, [effectiveScope, org?.userId]);

  const { data: dash } = useQuery({
    queryKey: ["dashboard", org?.id, effectiveScope],
    enabled: !!org?.id,
    queryFn: () => dashFn({ data: { orgId: org!.id, ...scopeFilter } as any }),
  });

  const { data: operators } = useQuery({
    queryKey: ["operators", org?.id],
    enabled: !!org?.id,
    queryFn: () => opsFn({ data: { orgId: org!.id } }),
  });

  const memberLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of operators ?? []) m.set(o.user_id, o.email ?? o.user_id.slice(0, 8));
    return m;
  }, [operators]);

  if (!org || !dash) return <DashboardSkeleton />;

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 space-y-6 max-w-[1400px]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Painel de Comando</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isManager ? "Comando operacional e desempenho do time." : "Suas demandas e a fila de triagem."}
          </p>
        </div>
        <ScopeSelector
          isManager={isManager}
          value={effectiveScope}
          onChange={setScope}
          operators={operators ?? []}
          currentUserId={org.userId}
        />
      </header>

      <CommandPanel dash={dash} />

      <AiSuggestionsCard />

      <TaskColumns
        orgId={org.id}
        slug={slug}
        scope={effectiveScope}
        currentUserId={org.userId}
        memberLabel={memberLabel}
      />

      {isManager && <Timeline dash={dash} />}
    </div>
  );
}

function ScopeSelector({
  isManager, value, onChange, operators, currentUserId,
}: {
  isManager: boolean;
  value: Scope;
  onChange: (v: Scope) => void;
  operators: { user_id: string; role: string; email: string | null }[];
  currentUserId: string;
}) {
  const options: TeamOption[] = [
    { value: "me", label: "Minhas demandas", sub: "Atribuídas a você", kind: "me" },
    { value: "triage", label: "Triagem", sub: "Sem responsável", kind: "triage" },
    ...(isManager ? [{ value: "all", label: "Todo o time", sub: "Visão global", kind: "all" as const }] : []),
    ...(isManager
      ? operators
          .filter((o) => o.user_id !== currentUserId)
          .map((o) => ({
            value: o.user_id,
            label: o.email ?? o.user_id.slice(0, 8),
            sub: o.role,
            kind: "member" as const,
          }))
      : []),
  ];
  return <TeamSelector value={value} options={options} onChange={(v) => onChange(v as Scope)} />;
}

function CommandPanel({ dash }: { dash: any }) {
  const novas = dash.timeline.map((t: any) => t.novas as number);
  const resolvidas = dash.timeline.map((t: any) => t.resolvidas as number);
  const totalSerie = dash.timeline.map((t: any) => (t.novas as number) + (t.resolvidas as number));
  const sum = (a: number[]) => a.reduce((x: number, y: number) => x + y, 0);
  // Quantas demandas a primeira metade da janela precisa ter pra uma % fazer
  // sentido. Com uma base muito pequena (ex: foi de 1 pra 10), a conta dá
  // "+900%" — matematicamente certo, mas engana quem olha, porque parece um
  // salto real e é só reflexo de ainda não ter histórico suficiente.
  const MIN_BASE_PARA_COMPARAR = 3;
  const trend = (a: number[]): number | null => {
    const half = Math.floor(a.length / 2);
    const prev = sum(a.slice(0, half));
    const cur = sum(a.slice(half));
    if (prev < MIN_BASE_PARA_COMPARAR) return null; // "Sem histórico" em vez de % exagerada
    return Math.round(((cur - prev) / prev) * 100);
  };

  return (
    <section className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Kpi
        icon={Inbox}
        label="Demandas abertas"
        value={dash.openTotal}
        hint="Em andamento agora"
        info="Quantas demandas ainda estão em aberto neste momento, sem contar as já concluídas. O selo compara a última semana com a semana anterior."
        series={novas}
        delta={trend(novas)}
        tone="primary"
      />
      <Kpi
        icon={AlertTriangle}
        label="Vencidas"
        value={dash.overdue}
        hint="Fora do prazo"
        info="Demandas em aberto cujo prazo já passou. O selo compara a última semana com a semana anterior."
        series={novas.map((_: number, i: number) => Math.max(0, novas[i] - resolvidas[i]))}
        delta={trend(novas.map((_: number, i: number) => Math.max(0, novas[i] - resolvidas[i])))}
        tone="destructive"
        invert
      />
      <Kpi
        icon={CheckCircle2}
        label="Concluídas"
        value={dash.counts.concluido ?? 0}
        hint="Total desde o início"
        info="Total de demandas já finalizadas desde que a organização começou a usar o Fluxo (não é só dos últimos 14 dias). O selo compara a última semana com a semana anterior."
        series={resolvidas}
        delta={trend(resolvidas)}
        tone="success"
      />
      <Kpi
        icon={Layers}
        label="Total no escopo"
        value={dash.total}
        hint="Volume acumulado"
        info="Soma de todas as demandas dentro do filtro selecionado no topo da página (concluídas ou não)."
        series={totalSerie}
        delta={trend(totalSerie)}
      />
      <Kpi
        icon={Target}
        label="Taxa de conclusão"
        value={dash.total ? Math.round(((dash.counts.concluido ?? 0) / dash.total) * 100) : 0}
        unit="%"
        hint="Concluídas sobre o total do escopo"
        info="De cada 100 demandas dentro do filtro atual, quantas já foram concluídas."
        tone="success"
      />

      <div className="sm:col-span-2 lg:col-span-3 xl:col-span-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.4} /> Distribuição por estado
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          {Object.entries(dash.counts).map(([k, v]) => {
            const pct = dash.total ? Math.round(((v as number) / dash.total) * 100) : 0;
            return (
              <div key={k} className="rounded-xl bg-secondary/60 p-3">
                <div className="text-[11px] font-medium text-muted-foreground truncate">{STATE_LABEL[k]}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums">{v as number}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TaskColumns({
  orgId, slug, scope, currentUserId, memberLabel,
}: { orgId: string; slug: string; scope: Scope; currentUserId: string; memberLabel: Map<string, string> }) {
  const listFn = useServerFn(listDemandas);
  const scopeArg = useMemo(() => {
    if (scope === "me") return { assigneeId: currentUserId };
    if (scope === "triage") return { assigneeId: null as any };
    if (scope === "all") return {};
    return { assigneeId: scope };
  }, [scope, currentUserId]);

  const { data: result } = useQuery({
    queryKey: ["tasks", orgId, scope],
    queryFn: () => listFn({ data: { orgId, ...scopeArg } as any }),
  });
  const rows = result?.rows;

  const byState = useMemo(() => {
    const m: Record<string, any[]> = { novo: [], em_analise: [], aguardando_cliente: [], aguardando_revisao_humana: [] };
    for (const r of (rows ?? []) as any[]) if (m[r.state]) m[r.state].push(r);
    return m;
  }, [rows]);

  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
        {scope === "me" ? "Minhas tarefas" : scope === "triage" ? "Fila de triagem" : scope === "all" ? "Fila do time" : "Tarefas do operador"}
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMN_STATES.map((s) => (
          <div key={s} className="rounded-2xl border border-border bg-card flex flex-col min-h-[130px] shadow-[var(--shadow-card)]">
            <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
              <div className="text-[12px] font-bold">{STATE_LABEL[s]}</div>
              <div className="min-w-[1.25rem] px-1 rounded-md bg-secondary text-center text-[10px] font-bold leading-4 text-muted-foreground tabular-nums">
                {byState[s]?.length ?? 0}
              </div>
            </div>
            <div className="p-2 space-y-2">
              {(byState[s] ?? []).slice(0, 8).map((d: any) => {
                const label = d.assignee_id
                  ? d.assignee_id === currentUserId
                    ? "Você"
                    : (memberLabel.get(d.assignee_id) ?? "Atribuída")
                  : null;
                return (
                <Link
                  key={d.id}
                  to="/app/o/$slug/fila/demandas/$id"
                  params={{ slug, id: d.id }}
                  className="block rounded-xl border border-border bg-background hover:border-primary/35 hover:bg-primary/[0.03] transition-colors p-2.5"
                >
                  <div className="text-[13px] font-semibold truncate">{d.title}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <PriorityBadge priority={d.priority} />
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MemberAvatar label={label} seed={d.assignee_id ?? "none"} size={20} />
                      <span className="text-[11px] text-muted-foreground truncate max-w-[86px]">
                        {label ?? "Sem responsável"}
                      </span>
                    </span>
                  </div>
                  {d.due_at && (
                    <div className={`mt-1 text-[11px] ${new Date(d.due_at) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
                      venc. {new Date(d.due_at).toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </Link>
                );
              })}
              {(byState[s] ?? []).length === 0 && <div className="text-[11px] text-muted-foreground px-1 py-2">Vazio</div>}
              {(byState[s] ?? []).length > 8 && (
                <Link to="/app/o/$slug/fila" params={{ slug }} className="block text-[11px] text-primary px-1">
                  Ver mais {byState[s].length - 8}…
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Timeline({ dash }: { dash: any }) {
  const BAR_AREA = 128; // px — altura fixa da área de barras (o resto do h-40 é a legenda de data embaixo)
  const max = Math.max(1, ...dash.timeline.map((t: any) => Math.max(t.novas, t.resolvidas)));
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-sm font-semibold">Últimos 14 dias</div>
      <div className="mt-4 flex items-stretch gap-2 h-40">
        {dash.timeline.map((t: any) => (
          <div key={t.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: BAR_AREA }}>
              <div
                title={`Novas: ${t.novas}`}
                className="bg-primary/70 rounded-t w-full transition-all"
                style={{ height: `${Math.round((t.novas / max) * BAR_AREA)}px` }}
              />
              <div
                title={`Resolvidas: ${t.resolvidas}`}
                className="bg-[oklch(0.6_0.17_160)] rounded-b w-full transition-all"
                style={{ height: `${Math.round((t.resolvidas / max) * BAR_AREA)}px` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground">{t.date.slice(5)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-primary/70" /> Novas</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-[oklch(0.6_0.17_160)]" /> Resolvidas</span>
      </div>
    </div>
  );
}

/** Ícone "i" pequeno com balãozinho explicativo — hover no desktop, toque no celular. */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="O que é este número?"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground/60 hover:text-foreground focus:text-foreground transition-colors"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 w-60 -translate-x-1/2 rounded-xl border border-border bg-popover px-3.5 py-2.5 text-left text-[12px] font-normal normal-case leading-relaxed tracking-normal text-popover-foreground shadow-[var(--shadow-pop)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        {text}
        <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-border bg-popover" />
      </span>
    </span>
  );
}

function Kpi({
  icon: Icon, label, value, hint, series, delta, tone, invert, unit, info,
}: {
  icon: any;
  label: string;
  value: number;
  hint?: string;
  series?: number[];
  delta?: number | null;
  tone?: "primary" | "destructive" | "success";
  invert?: boolean;
  unit?: string;
  info?: string;
}) {
  const accent =
    tone === "destructive"
      ? "text-destructive"
      : tone === "success"
        ? "text-[oklch(0.58_0.15_162)]"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground/70";
  const accentBg =
    tone === "destructive"
      ? "bg-destructive/10"
      : tone === "success"
        ? "bg-[oklch(0.58_0.15_162/0.12)]"
        : tone === "primary"
          ? "bg-primary/10"
          : "bg-secondary";
  const good = delta == null ? true : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] hover:border-primary/25 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <span className="truncate">{label}</span>
            {info && <InfoTip text={info} />}
          </div>
          <div className="mt-1.5 text-3xl font-bold tracking-tight tabular-nums">
            {value}
            {unit && <span className="text-lg text-muted-foreground font-semibold">{unit}</span>}
          </div>
        </div>
        <span className={`grid place-items-center h-10 w-10 shrink-0 rounded-xl ${accentBg} ${accent}`}>
          <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} />
        </span>
      </div>
      {(delta !== undefined || hint) && (
        <div className="mt-2 flex items-center gap-2">
          {delta !== undefined && (
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                delta == null
                  ? "bg-secondary text-muted-foreground"
                  : good
                    ? "bg-[oklch(0.62_0.15_162/0.14)] text-[oklch(0.4_0.13_162)]"
                    : "bg-destructive/12 text-destructive"
              }`}
            >
              {delta == null ? "Sem histórico" : `${delta > 0 ? "+" : ""}${delta}%`}
            </span>
          )}
          {hint && <span className="text-[11px] text-muted-foreground truncate">{hint}</span>}
        </div>
      )}
      {series && series.length > 0 && (
        <div className={`mt-3 -mb-1 ${accent}`}>
          <Sparkline values={series.length ? series : [0, 0]} className={accent} />
        </div>
      )}
    </div>
  );
}
