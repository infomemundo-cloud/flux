import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Search, Building2, Clock, UserPlus, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { listPlatformUsers, invitePlatformAdmin } from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/platform_admin/_protected/users")({
  component: PlatformAdminUsers,
});

function PlatformAdminUsers() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listPlatformUsers);
  const inviteFn = useServerFn(invitePlatformAdmin);
  
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Estado do Modal de Convite
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResult, setInviteResult] = useState<
    { type: "invited"; token: string } | { type: "promoted"; userId: string } | null
  >(null);

  // 1. DEBOUNCE na busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-users", debouncedSearch],
    queryFn: () => listFn({ data: { search: debouncedSearch || undefined, limit: 20 } }),
    // 2. BLINDAGEM DE CACHE
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteFn({ data: { email, role: "superadmin" } }),
    onSuccess: (res: any) => {
      // Cast para contornar inferência genérica de 'type: string' do TanStack Start
      const typedRes = res as { type: "invited"; token: string } | { type: "promoted"; userId: string };
      setInviteResult(typedRes);
      qc.invalidateQueries({ queryKey: ["platform-users"] });
      if (typedRes.type === "promoted") {
        toast.success("Usuário promovido a admin com sucesso!");
      } else {
        toast.success("Convite criado com sucesso!");
      }
    },
    onError: (e) => {
      toast.error(friendlyError(e));
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    inviteMutation.mutate(inviteEmail);
  };

  const copyInviteLink = () => {
    if (inviteResult?.type === "invited") {
      const link = `${window.location.origin}/platform_admin/convite/${inviteResult.token}`;
      navigator.clipboard.writeText(link);
      toast.success("Link copiado para a área de transferência!");
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setInviteEmail("");
    setInviteResult(null);
    inviteMutation.reset();
  };

  return (
    <div className="p-6 space-y-5 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Usuários</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestão cross-tenant de usuários (Fase 1.8)
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-950 transition hover:bg-white"
        >
          <UserPlus className="h-3.5 w-3.5" /> Convidar Admin
        </button>
      </div>

      {/* Busca com Debounce */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-700 bg-slate-900 text-xs text-slate-100 outline-none transition focus:border-slate-500"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-xs text-slate-500">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {data?.rows.map((user: any) => (
            <div
              key={user.id}
              onClick={() => navigate({ to: `/platform_admin/users/${user.id}` })}
              className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800 p-4 cursor-pointer transition hover:bg-slate-800/70"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {user.name}
                  </div>
                  <div className="text-xs text-slate-400 truncate">{user.email}</div>
                </div>
                {user.banned && (
                  <span className="ml-2 rounded bg-red-900/40 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                    Suspenso
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {user.memberships.length} orgs
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(user.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {user.memberships.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {user.memberships.slice(0, 3).map((m: any, i: number) => (
                    <span
                      key={i}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400"
                    >
                      {m.org_name} ({m.role})
                    </span>
                  ))}
                  {user.memberships.length > 3 && (
                    <span className="text-[9px] text-slate-500">
                      +{user.memberships.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {data?.rows.length === 0 && (
            <div className="text-center text-xs text-slate-500 py-8">
              Nenhum usuário encontrado.
            </div>
          )}
        </div>
      )}

      {/* Modal de Convidar Admin */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 ring-1 ring-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-100">Convidar Administrador</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {inviteResult ? (
              <div className="space-y-4">
                {inviteResult.type === "promoted" ? (
                  <div className="rounded-lg bg-emerald-900/30 border border-emerald-800/50 p-3 text-xs text-emerald-200">
                    <div className="font-semibold flex items-center gap-2 mb-1">
                      <Check className="h-3.5 w-3.5" /> Usuário promovido!
                    </div>
                    Este usuário já existia na base e foi elevado a administrador da plataforma com sucesso.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300">
                      <div className="font-semibold text-slate-100 mb-1">Link de convite gerado:</div>
                      <div className="font-mono text-[10px] break-all bg-slate-950 p-2 rounded border border-slate-700">
                        {window.location.origin}/platform_admin/convite/{inviteResult.token}
                      </div>
                    </div>
                    <button
                      onClick={copyInviteLink}
                      className="w-full h-9 rounded-lg bg-slate-100 text-xs font-bold text-slate-950 transition hover:bg-white flex items-center justify-center gap-2"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar Link
                    </button>
                    <p className="text-[10px] text-slate-500 text-center">
                      Este link expira em 7 dias e é de uso único.
                    </p>
                  </div>
                )}
                <button
                  onClick={closeModal}
                  className="w-full h-9 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                    E-mail do novo administrador
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="admin@empresa.com"
                    className="w-full h-10 px-3 rounded-xl border border-slate-700 bg-slate-950 text-xs text-slate-100 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-700/40"
                  />
                </div>
                <div className="rounded-lg bg-slate-800/50 p-3 text-[11px] text-slate-400">
                  <p>• Se o e-mail já existir, o usuário será promovido imediatamente.</p>
                  <p>• Se for novo, um link de convite de 7 dias será gerado.</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 h-9 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending || !inviteEmail}
                    className="flex-1 h-9 rounded-lg bg-slate-100 text-xs font-bold text-slate-950 transition hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2"
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
