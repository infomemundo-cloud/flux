import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { slaAlerts } from "@/lib/demandas.functions";
import { StateBadge, PriorityBadge, formatRelative, ProtocolChip, ContactLine, DueChip, UrgentTag } from "@/components/demandas-ui";
import { AlertTriangle, Clock, ChevronRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug/alertas")({
  head: () => ({ meta: [{ title: "Alertas de SLA — Fluxo" }] }),
  component: AlertasPage,
});

function severity(iso: string) {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (days >= 5)
    return {
      label: "Crítico", cls: "text-destructive", bar: "bg-destructive", blink: true,
      ring: "border-destructive/40 bg-destructive/[0.04] hover:border-destructive/70",
      pill: "bg-destructive/10 text-destructive",
    };
  if (days >= 3)
    return {
      label: "Alto", cls: "text-[oklch(0.52_0.17_42)]", bar: "bg-[oklch(0.66_0.17_42)]", blink: false,
      ring: "border-[oklch(0.66_0.17_42/0.35)] bg-[oklch(0.66_0.17_42/0.04)] hover:border-[oklch(0.66_0.17_42/0.6)]",
      pill: "bg-[oklch(0.66_0.17_42/0.12)] text-[oklch(0.5_0.17_40)]",
    };
  return {
    label: "Atenção", cls: "text-[oklch(0.5_0.14_78)]", bar: "bg-[oklch(0.7_0.15_78)]", blink: false,
    ring: "border-[oklch(0.7_0.15_78/0.35)] bg-[oklch(0.7_0.15_78/0.04)] hover:border-[oklch(0.7_0.15_78/0.6)]",
    pill: "bg-[oklch(0.7_0.15_78/0.14)] text-[oklch(0.47_0.13_75)]",
  };
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

  const PAGE_SIZE = 20;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const total = data?.length ?? 0;
  const items = useMemo(() => (data ?? []).slice(0, visible), [data, visible]);
  const hasMore = visible < total;

  // Reset when dataset changes size (refetch, filter changes)
  useEffect(() => { setVisible(PAGE_SIZE); }, [total]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible((v) => Math.min(v + PAGE_SIZE, total));
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, total]);

  return (
    <div className="p-4 sm:p-8 pb-24 sm:pb-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="grid place-items-center h-9 w-9 rounded-xl bg-destructive/10 text-destructive shrink-0">
          <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <h1 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight truncate">Alertas de SLA</h1>
      </div>
      <p className="text-[13px] text-muted-foreground mb-5 sm:mb-6">
        Demandas pendentes sem qualquer atualização no histórico nos últimos 2 dias.
        {total > 0 && (
          <span className="ml-1">Mostrando <b>{items.length}</b> de <b>{total}</b>.</span>
        )}
      </p>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-[92px] rounded-xl bg-card border border-border animate-pulse" />)}
        </div>
      )}
      {!isLoading && data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
          <span className="mx-auto grid place-items-center h-11 w-11 rounded-xl bg-[oklch(0.62_0.15_162/0.12)] text-[oklch(0.48_0.14_162)]">
            <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="mt-3 text-sm font-semibold">Nenhuma demanda parada</div>
          <p className="mt-1 text-[13px] text-muted-foreground">Todo o time está dentro do SLA. Tudo em dia!</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((d: any) => {
          const sev = severity(d.last_activity_at);
          const urgent = d.priority === "urgente";
          const overdue = d.due_at && new Date(d.due_at) < new Date();
          return (
            <Link
              key={d.id}
              to="/app/o/$slug/demandas/$id"
              params={{ slug, id: d.id }}
              className={`group relative block overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)] pl-4 pr-3 py-3.5 transition-all hover:shadow-[var(--shadow-pop)] ${sev.ring}`}
            >
              <span className={`absolute left-0 top-0 h-full w-[3px] ${sev.bar}`} />
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`h-[18px] w-[18px] mt-0.5 shrink-0 ${sev.cls} ${sev.blink ? "animate-alert-blink" : ""}`}
                  strokeWidth={2.3}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sev.pill}`}>
                      {sev.label}
                    </span>
                    <ProtocolChip protocol={d.protocol} id={d.id} />
                    <StateBadge state={d.state} />
                    {urgent ? <UrgentTag /> : <PriorityBadge priority={d.priority} />}
                  </div>
                  <div className="mt-2 font-semibold text-[15px] leading-snug truncate group-hover:text-primary transition-colors">{d.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ContactLine contact={d.contacts} channel={d.channels} />
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${sev.cls}`}>
                      <Clock className="h-3.5 w-3.5" strokeWidth={2.2} /> sem atualização {formatRelative(d.last_activity_at)}
                    </span>
                    {d.due_at && <DueChip dueAt={d.due_at} overdue={!!overdue} />}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          );
        })}
      </div>

      {hasMore && (
        <>
          <div ref={sentinelRef} aria-hidden className="h-8" />
          <div className="mt-2 flex justify-center">
            <button
              onClick={() => setVisible((v) => Math.min(v + PAGE_SIZE, total))}
              className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-semibold shadow-[var(--shadow-card)] hover:border-primary/40 hover:text-primary transition"
            >
              Carregar mais ({total - items.length} restantes)
            </button>
          </div>
        </>
      )}
      {!hasMore && total > PAGE_SIZE && (
        <p className="mt-4 text-center text-xs text-muted-foreground">Fim da lista</p>
      )}
    </div>
  );
}