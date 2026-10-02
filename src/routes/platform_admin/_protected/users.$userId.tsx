import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Building2, Ban, CheckCircle, Link, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getPlatformUserDetail,
  getPlatformUserAudit,
  setUserBanned,
  removeUserFromOrg,
  generateRecoveryLink,
} from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/platform_admin/_protected/users/$userId")({
  component: PlatformAdminUserDetail,
});

function PlatformAdminUserDetail() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  
  const detailFn = useServerFn(getPlatformUserDetail);
  const auditFn = useServerFn(getPlatformUserAudit);
  const banFn = useServerFn(setUserBanned);
  const removeFn = useServerFn(removeUserFromOrg);
  const recoveryFn = useServerFn(generateRecoveryLink);
  
  const [tab, setTab] = useState<"overview" | "orgs" | "audit">("overview");

  // 1. Query de detalhes básicos (sempre carregada, mas com cache de 5min)
  const { data, isLoading } = useQuery({
    queryKey: ["platform-user-detail", userId],
    queryFn: () => detailFn({ data: { userId } }),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // 2. LAZY QUERYING: Audit só é buscado QUANDO a aba "audit" está ativa
  const { data: auditData, isLoading: isAuditLoading } = useQuery({
    queryKey: ["platform-user-audit", userId],
    queryFn: () => auditFn({ data: { userId } }),
    enabled: !!userId && tab === "audit", // <-- O SEGREDO: não dispara se tab !== 'audit'
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // ... (mutations de ban, remove, recovery permanecem iguais) ...
  const banMutation = useMutation({
    mutationFn: (banned: boolean) => banFn({ data: { userId, banned, duration: "permanent" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-user-detail", userId] });
      toast.success("Status atualizado");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (orgId: string) => removeFn({ data: { userId, orgId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-user-detail", userId] });
      toast.success("Removido da org");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const recoveryMutation = useMutation({
    mutationFn: () => recoveryFn({ data: { userId } }),
    onSuccess: (res) => {
      if (res.recoveryLink) {
        navigator.clipboard.writeText(res.recoveryLink);
        toast.success(`Link copiado para ${res.email}`);
      }
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (isLoading || !data) {
    return <div className="p-6"><div className="text-xs text-slate-500">Carregando...</div></div>;
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header (igual ao anterior) */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/platform_admin/users" })} className="text-slate-400 hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold tracking-tight">{data.user.name}</h1>
          <p className="text-xs text-slate-400">{data.user.email}</p>
        </div>
        {data.user.banned && (
          <span className="ml-auto rounded bg-red-900/40 px-2 py-0.5 text-[10px] font-semibold text-red-300">Suspenso</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {(["overview", "orgs", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-semibold transition ${
              tab === t ? "text-slate-100 border-b-2 border-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "overview" ? "Overview" : t === "orgs" ? "Orgs" : "Audit"}
          </button>
        ))}
      </div>

      {/* Content: Overview e Orgs (iguais ao anterior, resumidos aqui para brevidade) */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800 p-4">
            <div className="text-[11px] text-slate-400 mb-2">Informações</div>
            <div className="space-y-2 text-xs">
              <div><span className="text-slate-500">ID:</span> <span className="text-slate-100 font-mono text-[10px]">{data.user.id}</span></div>
              <div><span className="text-slate-500">Criado em:</span> <span className="text-slate-100">{new Date(data.user.created_at).toLocaleString("pt-BR")}</span></div>
              <div><span className="text-slate-500">Último login:</span> <span className="text-slate-100">{data.user.last_sign_in_at ? new Date(data.user.last_sign_in_at).toLocaleString("pt-BR") : "Nunca"}</span></div>
            </div>
          </div>
          <div className="space-y-2">
            <button onClick={() => banMutation.mutate(!data.user.banned)} disabled={banMutation.isPending} className="w-full h-9 rounded-lg bg-slate-800 text-xs font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {data.user.banned ? <><CheckCircle className="h-3.5 w-3.5" /> Reativar</> : <><Ban className="h-3.5 w-3.5" /> Suspender login</>}
            </button>
            <button onClick={() => recoveryMutation.mutate()} disabled={recoveryMutation.isPending} className="w-full h-9 rounded-lg bg-slate-800 text-xs font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2">
              <Link className="h-3.5 w-3.5" /> Gerar link de recuperação
            </button>
          </div>
        </div>
      )}

      {tab === "orgs" && (
        <div className="space-y-2">
          {data.memberships.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-8">Usuário não pertence a nenhuma org.</div>
          ) : (
            data.memberships.map((m: any, i: number) => (
              <div key={i} className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800 p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-100">{m.org_name}</div>
                  <div className="text-[10px] text-slate-500 capitalize">{m.role}</div>
                </div>
                <button onClick={() => removeMutation.mutate(m.org_id)} disabled={removeMutation.isPending} className="text-red-400 hover:text-red-300 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. LAZY CONTENT: Só renderiza e busca dados quando tab === 'audit' */}
      {tab === "audit" && (
        <div className="space-y-4">
          {isAuditLoading ? (
            <div className="text-xs text-slate-500">Carregando auditoria...</div>
          ) : (
            <>
              <div>
                <div className="text-[11px] text-slate-400 mb-2">Ações sobre este usuário</div>
                {auditData?.asTarget.length === 0 ? (
                  <div className="text-xs text-slate-500">Nenhuma ação registrada.</div>
                ) : (
                  <div className="space-y-1">
                    {auditData?.asTarget.map((a: any) => (
                      <div key={a.id} className="rounded-lg bg-slate-900/50 p-2 text-[11px] text-slate-300">
                        <div className="font-semibold">{a.action}</div>
                        <div className="text-slate-500">{new Date(a.created_at).toLocaleString("pt-BR")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] text-slate-400 mb-2">Ações deste usuário (como admin)</div>
                {auditData?.asActor.length === 0 ? (
                  <div className="text-xs text-slate-500">Nenhuma ação registrada.</div>
                ) : (
                  <div className="space-y-1">
                    {auditData?.asActor.map((a: any) => (
                      <div key={a.id} className="rounded-lg bg-slate-900/50 p-2 text-[11px] text-slate-300">
                        <div className="font-semibold">{a.action}</div>
                        <div className="text-slate-500">{new Date(a.created_at).toLocaleString("pt-BR")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
