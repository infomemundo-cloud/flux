import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  Link2,
  Trash2,
  Copy,
  X,
  RefreshCw,
  ScrollText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPlatformUserDetail,
  getPlatformUserAudit,
  setUserBanned,
  removeUserFromOrg,
  generateRecoveryLink,
  getPlatformAdminSession,
} from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/platform_admin/_protected/users/$userId")({
  component: PlatformAdminUserDetail,
});

/** Página de audit logs por requisição (on-demand, nunca no mount da aba). */
const AUDIT_PAGE = 20;

/** Shape de página da listagem (pra updates locais tipados no cache). */
type UsersPage = { rows: any[]; total: number };

/**
 * Detalhe de usuário cross-tenant (Fase 1.8, redesign denso + updates locais):
 * - Overview: KV grid 3 colunas + ações inline no header (sem w-full).
 * - Orgs: tabela compacta com remoção discreta no hover.
 * - Audit: SOMENTE sob demanda ("Carregar Audit Logs") + paginação de 20
 *   ("Carregar mais 20...") — zero query de log até o admin pedir.
 * - Mutations com update local no cache (setQueriesData): zero refetch de
 *   rede após suspender/reativar/remover (detalhe + lista invalidados em memória).
 * - Erros de query renderizam card explícito (nunca spinner infinito).
 */
function PlatformAdminUserDetail() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detailFn = useServerFn(getPlatformUserDetail);
  const auditFn = useServerFn(getPlatformUserAudit);
  const banFn = useServerFn(setUserBanned);
  const removeFn = useServerFn(removeUserFromOrg);
  const recoveryFn = useServerFn(generateRecoveryLink);
  const sessionFn = useServerFn(getPlatformAdminSession);

  const [tab, setTab] = useState<"overview" | "orgs" | "audit">("overview");
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [auditRequested, setAuditRequested] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["platform-admin-session"],
    queryFn: () => sessionFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const role = session?.role ?? null;
  const canManageUsers = role === "superadmin" || role === "support";

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["platform-user-detail", userId],
    queryFn: () => detailFn({ data: { userId } }),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Audit: só dispara com aba ativa E clique explícito do admin.
  const {
    data: auditData,
    isLoading: isAuditLoading,
    isError: isAuditError,
    error: auditError,
    refetch: refetchAudit,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["platform-user-audit", userId],
    queryFn: ({ pageParam }) =>
      auditFn({ data: { userId, offset: pageParam, limit: AUDIT_PAGE } }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((acc, p) => acc + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: tab === "audit" && auditRequested,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const auditRows = auditData?.pages.flatMap((p) => p.rows) ?? [];
  const auditTotal = auditData?.pages[0]?.total ?? 0;

  // Ban com update local: detalhe + lista (zero refetch de rede)
  const banMutation = useMutation({
    mutationFn: (banned: boolean) =>
      banFn({ data: { userId, banned, duration: "permanent" } }),
    onSuccess: (_res, banned) => {
      // Local: detalhe + todas as páginas da lista — zero refetch:
      qc.setQueryData<any>(["platform-user-detail", userId], (old: any) =>
        old ? { ...old, user: { ...old.user, banned } } : old,
      );
      qc.setQueriesData<InfiniteData<UsersPage>>({ queryKey: ["platform-users"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            rows: page.rows.map((r) => (r.id === userId ? { ...r, banned } : r)),
          })),
        };
      });
      toast.success("Status atualizado.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  // Remove com update local: detalhe + lista (zero refetch de rede)
  const removeMutation = useMutation({
    mutationFn: (orgId: string) => removeFn({ data: { userId, orgId } }),
    onSuccess: (_res, orgId) => {
      // Local: remove a membership do detalhe e das rows da lista:
      qc.setQueryData<any>(["platform-user-detail", userId], (old: any) =>
        old
          ? { ...old, memberships: old.memberships.filter((m: any) => m.org_id !== orgId) }
          : old,
      );
      qc.setQueriesData<InfiniteData<UsersPage>>({ queryKey: ["platform-users"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            rows: page.rows.map((r) =>
              r.id === userId
                ? { ...r, memberships: r.memberships.filter((m: any) => m.org_id !== orgId) }
                : r,
            ),
          })),
        };
      });
      toast.success("Removido da org.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const recoveryMutation = useMutation({
    mutationFn: () => recoveryFn({ data: { userId } }),
    onSuccess: (res) => {
      setRecoveryLink(res.recoveryLink);
      if (res.recoveryLink) navigator.clipboard.writeText(res.recoveryLink);
      toast.success("Link gerado e copiado.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-xs text-slate-500">Carregando...</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-slate-900/70 p-4 ring-1 ring-red-900/60">
          <div className="text-sm font-bold text-red-300">Falha ao carregar o detalhe</div>
          <p className="mt-1 break-all text-[11px] text-slate-400">
            {(error as Error)?.message ?? "Usuário não encontrado ou sem dados."}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            <RefreshCw className="h-3 w-3" /> Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Header: identidade + ações inline (sem botões w-full) */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate({ to: "/platform_admin/users" })}
          className="text-slate-400 transition hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight">{data.user.name}</h1>
          <p className="text-xs text-slate-400">{data.user.email}</p>
        </div>
        {data.user.banned && (
          <span className="rounded bg-red-900/40 px-2 py-0.5 text-[10px] font-semibold text-red-300">
            Suspenso
          </span>
        )}
        {canManageUsers && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => banMutation.mutate(!data.user.banned)}
              disabled={banMutation.isPending}
              className={
                data.user.banned
                  ? "inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-950/40 px-3 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-900/50 transition hover:bg-emerald-900/40 disabled:opacity-50"
                  : "inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-950/40 px-3 text-[11px] font-semibold text-red-300 ring-1 ring-red-900/50 transition hover:bg-red-900/40 disabled:opacity-50"
              }
            >
              {data.user.banned ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5" /> Reativar login
                </>
              ) : (
                <>
                  <Ban className="h-3.5 w-3.5" /> Suspender login
                </>
              )}
            </button>
            <button
              onClick={() => recoveryMutation.mutate()}
              disabled={recoveryMutation.isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" /> Link de recuperação
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {(["overview", "orgs", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 h-9 text-xs font-semibold border-b-2 -mb-px transition ${
              tab === t
                ? "border-slate-100 text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "overview" ? "Overview" : t === "orgs" ? "Orgs" : "Audit"}
          </button>
        ))}
      </div>

      {/* OVERVIEW: KV grid compacto */}
      {tab === "overview" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">ID</div>
              <div className="mt-1 truncate font-mono text-[11px] text-slate-200" title={data.user.id}>
                {data.user.id}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Criado em</div>
              <div className="mt-1 text-[11px] text-slate-200">
                {new Date(data.user.created_at).toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Último login</div>
              <div className="mt-1 text-[11px] text-slate-200">
                {data.user.last_sign_in_at
                  ? new Date(data.user.last_sign_in_at).toLocaleString("pt-BR")
                  : "Nunca"}
              </div>
            </div>
          </div>

          {recoveryLink && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-200">
                  Link de recuperação gerado
                </div>
                <button
                  onClick={() => setRecoveryLink(null)}
                  className="text-slate-500 transition hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="break-all rounded border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] text-slate-300">
                {recoveryLink}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(recoveryLink);
                  toast.success("Link copiado!");
                }}
                className="mt-2 inline-flex h-7 items-center gap-1 rounded-md bg-slate-800 px-2 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ORGS: tabela compacta, remoção discreta no hover */}
      {tab === "orgs" && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Organização</th>
                <th className="px-3 py-2 font-semibold">Papel</th>
                <th className="px-3 py-2 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.memberships.map((m: any, i: number) => (
                <tr
                  key={i}
                  className="group border-b border-slate-800/60 last:border-0 transition hover:bg-slate-800/30"
                >
                  <td className="px-3 py-2 text-xs font-semibold text-slate-100">{m.org_name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] capitalize text-slate-400 ring-1 ring-slate-700/50">
                      {m.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManageUsers && (
                      <button
                        onClick={() => removeMutation.mutate(m.org_id)}
                        disabled={removeMutation.isPending}
                        title="Remover da org"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 opacity-0 transition hover:bg-red-950/40 hover:text-red-300 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data.memberships.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-10 text-center text-xs text-slate-500">
                    Usuário não pertence a nenhuma org.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* AUDIT: sob demanda + paginação de 20 */}
      {tab === "audit" && (
        <div className="space-y-3">
          {!auditRequested ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center">
              <ScrollText className="mx-auto h-4 w-4 text-slate-500" />
              <div className="mt-2 text-xs font-semibold text-slate-300">
                Auditoria sob demanda
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Carrega até {AUDIT_PAGE} registros por requisição, somente quando você pedir.
              </p>
              <button
                onClick={() => setAuditRequested(true)}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Carregar Audit Logs
              </button>
            </div>
          ) : isAuditLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando auditoria...
            </div>
          ) : isAuditError ? (
            <div className="rounded-xl bg-slate-900/70 p-4 ring-1 ring-red-900/60">
              <div className="text-sm font-bold text-red-300">Falha ao carregar auditoria</div>
              <p className="mt-1 break-all text-[11px] text-slate-400">
                {(auditError as Error)?.message ?? "Erro desconhecido"}
              </p>
              <button
                onClick={() => refetchAudit()}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                <RefreshCw className="h-3 w-3" /> Tentar de novo
              </button>
            </div>
          ) : auditRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-500">
              Nenhuma ação registrada para este usuário.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
              <ul className="divide-y divide-slate-800/60">
                {auditRows.map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-200">
                          {a.action}
                        </span>
                        <span
                          className={
                            a.actor_id === userId
                              ? "rounded bg-sky-500/15 px-1.5 py-px text-[9px] font-semibold text-sky-300"
                              : "rounded bg-slate-800 px-1.5 py-px text-[9px] font-semibold text-slate-400"
                          }
                        >
                          {a.actor_id === userId ? "por este usuário" : "sobre este usuário"}
                        </span>
                      </div>
                      {a.target_type && (
                        <div className="mt-0.5 truncate text-[10px] text-slate-500">
                          {a.target_type}
                          {a.target_id ? ` · ${a.target_id}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-[10px] text-slate-500">
                      {new Date(a.created_at).toLocaleString("pt-BR")}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2">
                <div className="text-[10px] text-slate-500 tabular-nums">
                  {auditRows.length} de {auditTotal} registros
                </div>
                {hasNextPage && (
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-slate-800 px-2.5 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
                    Carregar mais {AUDIT_PAGE}...
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}