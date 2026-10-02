import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Search, Building2, Clock } from "lucide-react";
import { listPlatformUsers } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/platform_admin/_protected/users")({
  component: PlatformAdminUsers,
});

function PlatformAdminUsers() {
  const navigate = useNavigate();
  const listFn = useServerFn(listPlatformUsers);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // 1. DEBOUNCE: Só atualiza a query 400ms após o usuário parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-users", debouncedSearch],
    queryFn: () => listFn({ data: { search: debouncedSearch || undefined, limit: 20 } }),
    // 2. CACHE RIGOROSO: Evita refetch em foco de janela, reconexão ou navegação de volta
    staleTime: 5 * 60 * 1000, // 5 minutos
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev, // Evita flash de "Carregando" durante refetch em background
  });

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Usuários</h1>
        <p className="text-xs text-slate-400 mt-0.5">Gestão cross-tenant de usuários (Fase 1.8)</p>
      </div>

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
                  <div className="text-sm font-semibold text-slate-100 truncate">{user.name}</div>
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
                  <Building2 className="h-3 w-3" /> {user.memberships.length} orgs
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {new Date(user.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {user.memberships.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {user.memberships.slice(0, 3).map((m: any, i: number) => (
                    <span key={i} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                      {m.org_name} ({m.role})
                    </span>
                  ))}
                  {user.memberships.length > 3 && (
                    <span className="text-[9px] text-slate-500">+{user.memberships.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          ))}
          {data?.rows.length === 0 && (
            <div className="text-center text-xs text-slate-500 py-8">Nenhum usuário encontrado.</div>
          )}
        </div>
      )}
    </div>
  );
}
