import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { slaAlerts } from "@/lib/demandas.functions";
import { StateBadge, PriorityBadge, formatRelative } from "@/components/demandas-ui";
import { AlertTriangle, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug/alertas")({
  head: () => ({ meta: [{ title: "Alertas de SLA — Fluxo" }] }),
  component: AlertasPage,
});

function severity(iso: string) {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (days >= 5) return { label: "Crítico", cls: "text-destructive", ring: "border-destructive/50 bg-destructive/5" };
  if (days >= 3) return { label: "Alto", cls: "text-[oklch(0.55_0.18_40)]", ring: "border-[oklch(0.65_0.18_40/0.4)] bg-[oklch(0.65_0.18_40/0.06)]" };
  return { label: "Atenção", cls: "text-[oklch(0.5_0.15_80)]", ring: "border-[oklch(0.65_0.18_80/0.35)] bg-[oklch(0.65_0.18_80/0.05)]" };
}

function AlertasPage() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/alertas" });
  const fn = useServerFn(slaAlerts);
  // Need orgId — fetch via first alert or use org lookup; reuse org query
  const orgQ = useQuery<{ id: string }>({
    queryKey: ["org-id", slug],
    queryFn: async () => {
      const { getOrgBySlug } = await import("@/lib/orgs.functions");
      return (await getOrgBySlug({ data: { slug } })) as any;
    },
  });
  const orgId = orgQ.data?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["sla-alerts", orgId],
    enabled: !!orgId,
    queryFn: () => fn({ data: { orgId: orgId!, staleDays: 2 } }),
    refetchInterval: 60000,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <h1 className="text-2xl font-bold tracking-tight">Alertas de SLA</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Demandas pendentes sem qualquer atualização no histórico nos últimos 2 dias.
      </p>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
      {!isLoading && data && data.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-sm text-muted-foreground">Nenhuma demanda parada. Tudo em dia!</p>
        </div>
      )}

      <div className="space-y-2">
        {data?.map((d: any) => {
          const sev = severity(d.last_activity_at);
          return (
            <Link
              key={d.id}
              to="/app/o/$slug/demandas/$id"
              params={{ slug, id: d.id }}
              className={`block rounded-lg border p-4 hover:shadow-sm transition-shadow ${sev.ring}`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${sev.cls}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${sev.cls}`}>{sev.label}</span>
                    <StateBadge state={d.state} />
                    <PriorityBadge priority={d.priority} />
                  </div>
                  <div className="mt-1 font-medium truncate">{d.title}</div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Sem atualização {formatRelative(d.last_activity_at)}
                    </span>
                    {d.contacts?.name && <span>Contato: {d.contacts.name}</span>}
                    {d.due_at && <span>Prazo: {new Date(d.due_at).toLocaleDateString("pt-BR")}</span>}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}