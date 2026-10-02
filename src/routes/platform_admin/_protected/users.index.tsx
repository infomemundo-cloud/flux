import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  Search,
  UserPlus,
  X,
  Copy,
  Check,
  MailX,
  Loader2,
  MoreHorizontal,
  Eye,
  Ban,
  CheckCircle,
  Link2,
  ArrowUpCircle,
  Inbox,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  listPlatformUsers,
  invitePlatformAdmin,
  listPendingInvites,
  revokeInvite,
  setUserBanned,
  generateRecoveryLink,
  getPlatformAdminSession,
} from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/platform_admin/_protected/users/")({
  component: PlatformAdminUsers,
});

const PAGE_SIZE = 20;

/** Shape de página da listagem (pra updates locais tipados no cache). */
type UsersPage = { rows: any[]; total: number };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} de ${MESES[d.getMonth()]}, ${d.getFullYear()}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

const AVATAR_BG = [
  "bg-violet-500/15 text-violet-300",
  "bg-sky-500/15 text-sky-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
];
function avatarBg(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  return AVATAR_BG[h % AVATAR_BG.length];
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  support: "Support",
  billing: "Billing",
  viewer: "Viewer",
};

/**
 * Gestão cross-tenant de usuários (Fase 1.8, redesign denso v2).
 * - Sem botão de convite no topo: a ação mora na aba Convites (e no
 *   empty state), mantendo 1 única entrada por contexto.
 * - Link de recuperação: modal com link visível + copiar (padrão de
 *   mercado sem infra de email = exibir o magic link, como o dashboard
 *   da Supabase faz).
 * - Gating por papel via sessão cacheada (zero request extra).
 * - Performance: debounce 400ms, paginação infinita, staleTime 5min.
 */
function PlatformAdminUsers() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listPlatformUsers);
  const inviteFn = useServerFn(invitePlatformAdmin);
  const invitesFn = useServerFn(listPendingInvites);
  const revokeFn = useServerFn(revokeInvite);
  const banFn = useServerFn(setUserBanned);
  const recoveryFn = useServerFn(generateRecoveryLink);
  const sessionFn = useServerFn(getPlatformAdminSession);

  const [tab, setTab] = useState<"users" | "invites">("users");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Modal de convite (com prefill pra "Promover a admin…" do dropdown)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("superadmin");
  const [inviteResult, setInviteResult] = useState<
    { type: "invited"; token: string } | { type: "promoted"; userId: string } | null
  >(null);

  // Modal do link de recuperação (visível + copiável, não só clipboard)
  const [recoveryResult, setRecoveryResult] = useState<{
    recoveryLink: string;
    email: string;
  } | null>(null);

  // Papel da sessão: mesma queryKey do shell → serve do cache, sem request extra
  const { data: session } = useQuery({
    queryKey: ["platform-admin-session"],
    queryFn: () => sessionFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const role = session?.role ?? null;
  const canManageAdmins = role === "superadmin";
  const canManageUsers = role === "superadmin" || role === "support";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["platform-users", debouncedSearch],
      queryFn: ({ pageParam }) =>
        listFn({
          data: { search: debouncedSearch || undefined, limit: PAGE_SIZE, offset: pageParam },
        }),
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        const loaded = allPages.reduce((acc, p) => acc + p.rows.length, 0);
        return loaded < lastPage.total ? loaded : undefined;
      },
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // Só busca convites com a aba ativa: zero calls na aba "Usuários Ativos".
  // Trade-off aceito: o badge de contagem aparece após a 1ª visita à aba
  // (daí em diante vive em cache 60s+ e atualiza via mutations locais).
  const { data: pendingInvites } = useQuery({
    queryKey: ["platform-admin-invites"],
    queryFn: () => invitesFn(),
    enabled: tab === "invites",
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const pendingCount = pendingInvites?.length ?? 0;

  const inviteMutation = useMutation({
    mutationFn: (v: { email: string; role: string }) =>
      inviteFn({ data: { email: v.email, role: v.role as any } }),
    onSuccess: (res: any, vars) => {
      const typedRes = res as
        | { type: "invited"; token: string }
        | { type: "promoted"; userId: string };
      setInviteResult(typedRes);
      if (typedRes.type === "promoted") {
        // Badge de papel atualizada localmente — sem refetch da tabela:
        qc.setQueriesData<InfiniteData<UsersPage>>({ queryKey: ["platform-users"] }, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              rows: page.rows.map((r) =>
                r.id === typedRes.userId ? { ...r, platform_role: vars.role } : r,
              ),
            })),
          };
        });
      } else {
        // Convite novo: pendentes só refetcha com a aba ativa (enabled):
        qc.invalidateQueries({ queryKey: ["platform-admin-invites"] });
      }
      toast.success(
        typedRes.type === "promoted" ? "Usuário promovido a admin!" : "Convite criado!",
      );
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revokeFn({ data: { inviteId } }),
    onSuccess: (_res, inviteId) => {
      // Some da lista de pendentes direto no cache — sem refetch:
      qc.setQueriesData<any[]>({ queryKey: ["platform-admin-invites"] }, (old) =>
        old ? old.filter((i) => i.id !== inviteId) : old,
      );
      toast.success("Convite revogado.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const banMutation = useMutation({
    mutationFn: (v: { userId: string; banned: boolean }) =>
      banFn({ data: { userId: v.userId, banned: v.banned, duration: "permanent" } }),
    onSuccess: (_res, vars) => {
      // Vira o `banned` em TODAS as páginas/buscas do cache — sem refetch:
      qc.setQueriesData<InfiniteData<UsersPage>>({ queryKey: ["platform-users"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            rows: page.rows.map((r) =>
              r.id === vars.userId ? { ...r, banned: vars.banned } : r,
            ),
          })),
        };
      });
      // Detalhe (se estiver em cache) fica consistente sem refetch:
      qc.setQueryData<any>(["platform-user-detail", vars.userId], (old: any) =>
        old ? { ...old, user: { ...old.user, banned: vars.banned } } : old,
      );
      toast.success("Status atualizado.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const recoveryMutation = useMutation({
    mutationFn: (userId: string) => recoveryFn({ data: { userId } }),
    onSuccess: (res) => {
      setRecoveryResult(res);
      if (res.recoveryLink) navigator.clipboard.writeText(res.recoveryLink);
      toast.success("Link gerado e copiado para a área de transferência.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const copyText = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  const openInviteModal = (prefill = "") => {
    setInviteEmail(prefill);
    setInviteRole("superadmin");
    setInviteResult(null);
    inviteMutation.reset();
    setIsModalOpen(true);
  };

  const closeMenu = () => setOpenMenu(null);

  return (
    <div className="p-5 space-y-4">
      {/* Header SEM botão de convite (a ação mora na aba Convites) */}
      <div>
        <h1 className="text-lg font-bold tracking-tight">Usuários</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Gestão cross-tenant de usuários e admins da plataforma
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800">
        <button
          onClick={() => setTab("users")}
          className={`inline-flex items-center gap-1.5 px-3 h-9 text-xs font-semibold border-b-2 -mb-px transition ${
            tab === "users"
              ? "border-slate-100 text-slate-100"
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          <UsersIcon className="h-3.5 w-3.5" /> Usuários Ativos
        </button>
        <button
          onClick={() => setTab("invites")}
          className={`inline-flex items-center gap-1.5 px-3 h-9 text-xs font-semibold border-b-2 -mb-px transition ${
            tab === "invites"
              ? "border-slate-100 text-slate-100"
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          <MailX className="h-3.5 w-3.5" /> Convites
          {pendingCount > 0 && (
            <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ABA: USUÁRIOS */}
      {tab === "users" && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-800 bg-slate-900/60 text-xs text-slate-100 outline-none transition focus:border-slate-600"
            />
          </div>

          <div className="rounded-xl ring-1 ring-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Usuário</th>
                    <th className="px-3 py-2 font-semibold">Papel</th>
                    <th className="px-3 py-2 font-semibold">Organizações</th>
                    <th className="px-3 py-2 font-semibold">Cadastro</th>
                    <th className="px-3 py-2 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((user: any) => (
                    <tr
                      key={user.id}
                      className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${avatarBg(user.name)}`}
                          >
                            {initials(user.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-100 truncate">
                                {user.name}
                              </span>
                              {user.banned && (
                                <span className="rounded bg-red-900/40 px-1 py-px text-[9px] font-semibold text-red-300">
                                  suspenso
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {user.platform_role ? (
                          <span className="inline-flex items-center rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 ring-1 ring-violet-500/30">
                            {ROLE_LABEL[user.platform_role] ?? user.platform_role}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-700/60">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {user.memberships.length === 0 && (
                            <span className="text-[11px] text-slate-600">—</span>
                          )}
                          {user.memberships.slice(0, 2).map((m: any, i: number) => (
                            <span
                              key={i}
                              className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-700/50"
                            >
                              {m.org_name} · {m.role}
                            </span>
                          ))}
                          {user.memberships.length > 2 && (
                            <span className="text-[10px] text-slate-500">
                              +{user.memberships.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">
                        {fmtDate(user.created_at)}
                      </td>
                      <td className="px-3 py-2 relative">
                        <div className="flex justify-end">
                          <button
                            onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)}
                            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                        {openMenu === user.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={closeMenu} />
                            <div className="absolute right-3 z-40 mt-1 w-52 rounded-lg bg-slate-900 py-1 shadow-xl ring-1 ring-slate-700">
                              <button
                                onClick={() => {
                                  closeMenu();
                                  navigate({ to: `/platform_admin/users/${user.id}` });
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-slate-800"
                              >
                                <Eye className="h-3.5 w-3.5" /> Ver detalhes
                              </button>
                              {canManageUsers && (
                                <button
                                  onClick={() => {
                                    closeMenu();
                                    banMutation.mutate({ userId: user.id, banned: !user.banned });
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-slate-800"
                                >
                                  {user.banned ? (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5" /> Reativar login
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="h-3.5 w-3.5" /> Suspender login
                                    </>
                                  )}
                                </button>
                              )}
                              {canManageUsers && (
                                <button
                                  onClick={() => {
                                    closeMenu();
                                    recoveryMutation.mutate(user.id);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-slate-800"
                                >
                                  <Link2 className="h-3.5 w-3.5" /> Link de recuperação
                                </button>
                              )}
                              {canManageAdmins && !user.platform_role && (
                                <button
                                  onClick={() => {
                                    closeMenu();
                                    openInviteModal(user.email);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-violet-300 transition hover:bg-slate-800"
                                >
                                  <ArrowUpCircle className="h-3.5 w-3.5" /> Promover a admin…
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-12 text-center">
                        <div className="text-xs text-slate-500">Nenhum usuário encontrado.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!isLoading && rows.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2">
                <div className="text-[10px] text-slate-500 tabular-nums">
                  {rows.length} de {total} usuários
                </div>
                {hasNextPage && (
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-slate-800 px-2.5 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
                    Carregar mais
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ABA: CONVITES (a ação de convidar mora aqui) */}
      {tab === "invites" && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              Convites aguardando aceite · expiram em 7 dias · uso único
            </div>
            {canManageAdmins && (
              <button
                onClick={() => openInviteModal()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-[11px] font-bold text-slate-950 transition hover:bg-white"
              >
                <UserPlus className="h-3.5 w-3.5" /> Convidar Novo Admin
              </button>
            )}
          </div>

          <div className="rounded-xl ring-1 ring-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Email convidado</th>
                    <th className="px-3 py-2 font-semibold">Papel proposto</th>
                    <th className="px-3 py-2 font-semibold">Convidado por</th>
                    <th className="px-3 py-2 font-semibold">Expira em</th>
                    <th className="px-3 py-2 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites?.map((inv: any) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition"
                    >
                      <td className="px-3 py-2 text-xs font-semibold text-slate-100">{inv.email}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 ring-1 ring-violet-500/30">
                          {ROLE_LABEL[inv.role] ?? inv.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-400">
                        {inv.invited_by_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                        <span className={inv.expired ? "text-red-400" : "text-slate-500"}>
                          {fmtDate(inv.expires_at)}
                          {inv.expired && " (expirado)"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {!inv.expired && (
                            <button
                              onClick={() =>
                                copyText(
                                  `${window.location.origin}/platform_admin/convite/${inv.token}`,
                                  "Link copiado!",
                                )
                              }
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-800 px-2 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-700"
                            >
                              <Copy className="h-3 w-3" /> Copiar link
                            </button>
                          )}
                          {canManageAdmins && (
                            <button
                              onClick={() => revokeMutation.mutate(inv.id)}
                              disabled={revokeMutation.isPending}
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-red-950/60 px-2 text-[10px] font-semibold text-red-300 transition hover:bg-red-900/60 disabled:opacity-50"
                            >
                              Revogar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendingCount === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-14 text-center">
                        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-800/80">
                          <Inbox className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-300">
                          Nenhum convite pendente
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Use o botão "Convidar Novo Admin" no topo desta aba
                          para gerar um link de acesso.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL: LINK DE RECUPERAÇÃO (visível + copiável) */}
      {recoveryResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-xl ring-1 ring-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">Link de recuperação</h2>
              <button
                onClick={() => setRecoveryResult(null)}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Gerado para <span className="font-semibold text-slate-200">{recoveryResult.email}</span>.
              Sem infra de email no MVP: repasse este link manualmente. Ele também já foi
              copiado para a área de transferência.
            </p>
            <div className="break-all rounded border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] text-slate-300">
              {recoveryResult.recoveryLink}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setRecoveryResult(null)}
                className="flex-1 h-9 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Fechar
              </button>
              <button
                onClick={() => copyText(recoveryResult.recoveryLink, "Link copiado!")}
                className="flex flex-1 h-9 items-center justify-center gap-2 rounded-lg bg-slate-100 text-xs font-bold text-slate-950 transition hover:bg-white"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONVITE (com seletor de papel) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-xl ring-1 ring-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">Convidar Administrador</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {inviteResult ? (
              <div className="space-y-4">
                {inviteResult.type === "promoted" ? (
                  <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/30 p-3 text-xs text-emerald-200">
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <Check className="h-3.5 w-3.5" /> Usuário promovido!
                    </div>
                    Este usuário já existia na base e foi elevado ao papel selecionado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300">
                      <div className="mb-1 font-semibold text-slate-100">Link de convite:</div>
                      <div className="break-all rounded border border-slate-700 bg-slate-950 p-2 font-mono text-[10px]">
                        {window.location.origin}/platform_admin/convite/{inviteResult.token}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        copyText(
                          `${window.location.origin}/platform_admin/convite/${inviteResult.token}`,
                          "Link copiado!",
                        )
                      }
                      className="flex w-full h-9 items-center justify-center gap-2 rounded-lg bg-slate-100 text-xs font-bold text-slate-950 transition hover:bg-white"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar Link
                    </button>
                    <p className="text-center text-[10px] text-slate-500">
                      Expira em 7 dias, uso único. O convidado define a senha ao abrir.
                      Também disponível na aba "Convites".
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-full h-9 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!inviteEmail) return;
                  inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">
                    E-mail do administrador
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="admin@empresa.com"
                    className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-700/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">
                    Papel na plataforma
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none transition focus:border-slate-500"
                  >
                    <option value="superadmin">Superadmin — acesso total + gestão de admins</option>
                    <option value="support">Support — operações de usuário</option>
                    <option value="billing">Billing — leituras (billing em fase futura)</option>
                    <option value="viewer">Viewer — somente leitura</option>
                  </select>
                </div>
                <div className="rounded-lg bg-slate-800/50 p-3 text-[11px] text-slate-400">
                  <p>• Se o e-mail já existir, o usuário é promovido imediatamente.</p>
                  <p>• Se for novo, um link de convite de 7 dias é gerado.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 h-9 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending || !inviteEmail}
                    className="flex flex-1 h-9 items-center justify-center gap-2 rounded-lg bg-slate-100 text-xs font-bold text-slate-950 transition hover:bg-white disabled:opacity-50"
                  >
                    {inviteMutation.isPending ? "Processando..." : "Convidar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
