import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { orgDashboard } from "@/lib/demandas.functions";
import { STATE_LABEL } from "@/components/demandas-ui";
import { AlertTriangle, Inbox, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Fluxo" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/dashboard" });
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });
  const dashFn = useServerFn(orgDashboard);
  const { data } = useQuery({
    queryKey: ["dashboard", org?.id], enabled: !!org?.id,
    queryFn: () => dashFn({ data: { orgId: org!.id } }),
  });
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  const max = Math.max(1, ...data.timeline.map((t) => Math.max(t.novas, t.resolvidas)));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-sm text-muted-foreground">Visão geral operacional.</p>

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <Kpi icon={Inbox} label="Abertas" value={data.openTotal} tone="primary" />
        <Kpi icon={AlertTriangle} label="Vencidas" value={data.overdue} tone="destructive" />
        <Kpi icon={TrendingUp} label="Total no período" value={data.total} />
      </div>

      <div className="mt-6 grid md:grid-cols-5 gap-3">
        {Object.entries(data.counts).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{STATE_LABEL[k]}</div>
            <div className="text-2xl font-bold mt-1">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-semibold">Últimos 14 dias</div>
        <div className="mt-4 flex items-end gap-2 h-40">
          {data.timeline.map((t) => (
            <div key={t.date} className="flex-1 flex flex-col items-center gap-1 group">
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
    </div>
  );
}

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