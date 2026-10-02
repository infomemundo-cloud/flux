import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ScrollText, ShieldCheck, Building2 } from "lucide-react";
import { countAdminAudit, getPlatformAdminSession } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/platform_admin/_protected/")({
  component: PlatformAdminDashboard,
});

/**
 * Dashboard placeholder da Fase 1.7: prova que sessão + gate + audit estão
 * vivos (card de contagem do audit log). As áreas reais chegam nas fases
 * seguintes (D4).
 *
 * CACHE (alinhado): staleTime 5min + sem refetch em foco/reconexão nas duas
 * queries — dashboard não gera request em navegação de volta dentro da janela.
 */
function PlatformAdminDashboard() {
  const sessionFn = useServerFn(getPlatformAdminSession);
  const countFn = useServerFn(countAdminAudit);

  const { data: session } = useQuery({
    queryKey: ["platform-admin-session"],
    queryFn: () => sessionFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: audit } = useQuery({
    queryKey: ["admin-audit-count"],
    queryFn: () => countFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Visão agregada da plataforma — métricas reais chegam na Fase 2+.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800 p-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Sessão atual
          </div>
          <div className="mt-2 text-sm font-bold capitalize">{session?.role ?? "—"}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">papel ativo no portal</div>
        </div>
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800 p-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ScrollText className="h-3.5 w-3.5" /> Eventos de audit
          </div>
          <div className="mt-2 text-sm font-bold tabular-nums">{audit?.count ?? 0}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">admin_audit_log (imutável)</div>
        </div>
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800 p-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Building2 className="h-3.5 w-3.5" /> Tenants
          </div>
          <div className="mt-2 text-sm font-bold text-slate-500">em breve</div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            gestão de tenants numa fase futura
          </div>
        </div>
      </div>
    </div>
  );
}
