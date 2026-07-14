import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { orgDashboard, listDemandas } from "@/lib/demandas.functions";
import { STATE_LABEL, PriorityBadge, formatRelative } from "@/components/demandas-ui";
import { AlertTriangle, Inbox, TrendingUp, Bot } from "lucide-react";

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
    enabled: !!org?.id && isManager,
    queryFn: () => opsFn({ data: { orgId: org!.id } }),
  });

  if (!org || !dash) return <div className="p-4 sm:p-6 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Painel</h1>
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

      {isManager && <CommandPanel dash={dash} />}

      <TaskColumns orgId={org.id} slug={slug} scope={effectiveScope} currentUserId={org.userId} />

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
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-xs text-muted-foreground">Visualizando</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Scope)}
        className="h-9 px-2 rounded-md border border-input bg-background text-sm max-w-[220px]"
      >
        <option value="me">Minhas demandas</option>
        <option value="triage">Triagem (não atribuídas)</option>
        {isManager && <option value="all">Todo o time</option>}
        {isManager && operators.filter((o) => o.user_id !== currentUserId).map((o) => (
          <option key={o.user_id} value={o.user_id}>
            {o.email ?? o.user_id.slice(0, 8)} · {o.role}
          </option>
        ))}
      </select>
    </div>
  );
}

function CommandPanel({ dash }: { dash: any }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Painel de Comando</h2>
      <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
        <Kpi icon={Inbox} label="Abertas" value={dash.openTotal} tone="primary" />
        <Kpi icon={AlertTriangle} label="Vencidas" value={dash.overdue} tone="destructive" />
        <Kpi icon={TrendingUp} label="Total no escopo" value={dash.total} />
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        {Object.entries(dash.counts).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">{STATE_LABEL[k]}</div>
            <div className="text-xl font-bold mt-0.5">{v as number}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TaskColumns({
  orgId, slug, scope, currentUserId,
}: { orgId: string; slug: string; scope: Scope; currentUserId: string }) {
  const listFn = useServerFn(listDemandas);
  const scopeArg = useMemo(() => {
    if (scope === "me") return { assigneeId: currentUserId };
    if (scope === "triage") return { assigneeId: null as any };
    if (scope === "all") return {};
    return { assigneeId: scope };
  }, [scope, currentUserId]);

  const { data: rows } = useQuery({
    queryKey: ["tasks", orgId, scope],
    queryFn: () => listFn({ data: { orgId, ...scopeArg } as any }),
  });

  const byState = useMemo(() => {
    const m: Record<string, any[]> = { novo: [], em_analise: [], aguardando_cliente: [], aguardando_revisao_humana: [] };
    for (const r of (rows ?? []) as any[]) if (m[r.state]) m[r.state].push(r);
    return m;
  }, [rows]);

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        {scope === "me" ? "Minhas tarefas" : scope === "triage" ? "Fila de triagem" : scope === "all" ? "Fila do time" : "Tarefas do operador"}
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMN_STATES.map((s) => (
          <div key={s} className="rounded-lg border border-border bg-card flex flex-col min-h-[120px]">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="text-xs font-semibold">{STATE_LABEL[s]}</div>
              <div className="text-[11px] text-muted-foreground">{byState[s]?.length ?? 0}</div>
            </div>
            <div className="p-2 space-y-2">
              {(byState[s] ?? []).slice(0, 8).map((d: any) => (
                <Link
                  key={d.id}
                  to="/app/o/$slug/demandas/$id"
                  params={{ slug, id: d.id }}
                  className="block rounded-md border border-border bg-background hover:bg-secondary/50 p-2"
                >
                  <div className="text-sm font-medium truncate">{d.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <PriorityBadge priority={d.priority} />
                    <span className="text-[11px] text-muted-foreground truncate">
                      {d.assignee_id ? (d.assignee_id === currentUserId ? "você" : "atribuída") : "sem responsável"}
                    </span>
                  </div>
                  {d.due_at && (
                    <div className={`mt-1 text-[11px] ${new Date(d.due_at) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
                      venc. {new Date(d.due_at).toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </Link>
              ))}
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
  const max = Math.max(1, ...dash.timeline.map((t: any) => Math.max(t.novas, t.resolvidas)));
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-semibold">Últimos 14 dias</div>
      <div className="mt-4 flex items-end gap-2 h-40">
        {dash.timeline.map((t: any) => (
          <div key={t.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col gap-0.5 justify-end h-full">
              <div title={`Novas: ${t.novas}`} className="bg-primary/70 rounded-t" style={{ height: `${(t.novas / max) * 100}%` }} />
              <div title={`Resolvidas: ${t.resolvidas}`} className="bg-[oklch(0.6_0.17_160)] rounded-b" style={{ height: `${(t.resolvidas / max) * 100}%` }} />
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

// silence unused imports warnings for optional icons
void Bot; void formatRelative;

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: "primary" | "destructive" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}