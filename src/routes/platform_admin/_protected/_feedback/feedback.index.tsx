import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { HeartPulse, Inbox, Search, Star, X } from "lucide-react";
import { toast } from "sonner";
import {
  listProductFeedbacks,
  getFeedbackStats,
  markFeedbackFollowedUp,
} from "@/lib/platform-admin/feedback.functions";
import { searchOrganizations } from "@/lib/feature-flag.functions";
import { getPlatformAdminSession } from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";
import { FeedbacksTable, type FeedbackRow } from "./-components/feedbacks-table";

export const Route = createFileRoute("/platform_admin/_protected/_feedback/feedback/")({
  component: PlatformAdminFeedback,
});

const PAGE = 20;
const PMF_OPTIONS = [
  { v: "", label: "PMF: todos" },
  { v: "very_disappointed", label: "Muito decepcionado" },
  { v: "somewhat_disappointed", label: "Um pouco decepcionado" },
  { v: "not_disappointed", label: "Não decepcionado" },
];

function PlatformAdminFeedback() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductFeedbacks);
  const statsFn = useServerFn(getFeedbackStats);
  const markFn = useServerFn(markFeedbackFollowedUp);
  const sessionFn = useServerFn(getPlatformAdminSession);
  const orgSearchFn = useServerFn(searchOrganizations);

  const { data: session } = useQuery({
    queryKey: ["platform-admin-session"],
    queryFn: () => sessionFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const canFollowup = ["superadmin", "support"].includes(session?.role ?? "");

  const [rating, setRating] = useState<number | undefined>();
  const [pmf, setPmf] = useState("");
  const [followup, setFollowup] = useState<"all" | "pending" | "done">("all");
  const [orgId, setOrgId] = useState<string | undefined>();
  const [orgName, setOrgName] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [debouncedOrg, setDebouncedOrg] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedOrg(orgSearch), 400);
    return () => clearTimeout(t);
  }, [orgSearch]);
  useEffect(() => {
    setPage(0);
  }, [rating, pmf, followup, orgId]);

  const { data: orgMatches } = useQuery({
    queryKey: ["org-search", debouncedOrg],
    queryFn: () => orgSearchFn({ data: { search: debouncedOrg || undefined } }),
    enabled: !orgId && debouncedOrg.length > 0,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: stats } = useQuery({
    queryKey: ["feedback-stats"],
    queryFn: () => statsFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-feedbacks", rating ?? null, pmf, followup, orgId ?? null, page],
    queryFn: () =>
      listFn({
        data: {
          rating,
          pmf: (pmf || undefined) as any,
          followup,
          orgId,
          offset: page * PAGE,
          limit: PAGE,
        },
      }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: keepPreviousData,
  });

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: (_r, id) => {
      // Update local (§2.2): zero refetch de rede pós-escrita.
      qc.setQueriesData<{ rows: FeedbackRow[]; total: number }>(
        { queryKey: ["admin-feedbacks"] },
        (old) =>
          old
            ? {
                ...old,
                rows: old.rows.map((r) =>
                  r.id === id ? { ...r, followed_up_at: new Date().toISOString() } : r,
                ),
              }
            : old,
      );
      qc.invalidateQueries({ queryKey: ["feedback-stats"] });
      qc.invalidateQueries({ queryKey: ["feedback-followup-count"] });
      toast.success("Follow-up encerrado (auditado).");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const rows = (data?.rows ?? []) as FeedbackRow[];
  const total = data?.total ?? 0;
  const maxDist = Math.max(1, ...(stats?.distribution ?? [1]));

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Feedback de produto</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Voz dos testers e clientes: nota, PMF e fila de follow-ups com opt-in.
        </p>
      </div>

      {/* Cards (9.4) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <Star className="h-3 w-3" /> Média geral
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
            {stats?.average ?? "—"}
          </div>
          <div className="text-[10px] text-slate-500">{stats?.total ?? 0} feedbacks</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Distribuição</div>
          <div className="mt-2 space-y-1">
            {(stats?.distribution ?? [0, 0, 0, 0, 0]).map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-3 text-[10px] tabular-nums text-slate-500">{i + 1}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full bg-amber-400/70"
                    style={{ width: `${Math.round((n / maxDist) * 100)}%` }}
                  />
                </div>
                <span className="w-6 text-right text-[10px] tabular-nums text-slate-400">{n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <HeartPulse className="h-3 w-3" /> PMF (não decepcionado)
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
            {stats?.pmfPct != null ? `${stats.pmfPct}%` : "—"}
          </div>
          <div className="relative mt-2 h-1.5 overflow-hidden rounded bg-slate-800">
            <div
              className={`h-full ${(stats?.pmfPct ?? 0) >= (stats?.pmfTarget ?? 40) ? "bg-emerald-400/80" : "bg-amber-400/70"}`}
              style={{ width: `${Math.min(100, stats?.pmfPct ?? 0)}%` }}
            />
            <div
              className="absolute top-0 h-full w-px bg-slate-300/70"
              style={{ left: `${stats?.pmfTarget ?? 40}%` }}
              title="Meta 40%"
            />
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            meta {stats?.pmfTarget ?? 40}% · {stats?.pmfAnswered ?? 0} respostas
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <Inbox className="h-3 w-3" /> Follow-ups pendentes
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-300">
            {stats?.followupPending ?? 0}
          </div>
          <div className="text-[10px] text-slate-500">opt-in de contato aguardando retorno</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={rating ?? ""}
          onChange={(e) => setRating(e.target.value ? Number(e.target.value) : undefined)}
          className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-200 outline-none focus:border-slate-500"
        >
          <option value="">Nota: todas</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} estrela{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <select
          value={pmf}
          onChange={(e) => setPmf(e.target.value)}
          className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-200 outline-none focus:border-slate-500"
        >
          {PMF_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={followup}
          onChange={(e) => setFollowup(e.target.value as any)}
          className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-200 outline-none focus:border-slate-500"
        >
          <option value="all">Follow-up: todos</option>
          <option value="pending">Pendentes</option>
          <option value="done">Encerrados</option>
        </select>
        {orgId ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-500/15 px-2 text-[11px] font-semibold text-sky-300">
            {orgName}
            <button
              onClick={() => {
                setOrgId(undefined);
                setOrgName("");
                setOrgSearch("");
              }}
              className="text-sky-300/70 hover:text-sky-200"
              aria-label="Limpar filtro de org"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder="Filtrar por org..."
              className="h-8 w-44 rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-2 text-[11px] text-slate-200 outline-none focus:border-slate-500"
            />
            {debouncedOrg && (orgMatches ?? []).length > 0 && (
              <div className="absolute z-20 mt-1 max-h-40 w-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 shadow-xl">
                {(orgMatches ?? []).map((o: any) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setOrgId(o.id);
                      setOrgName(o.name);
                      setOrgSearch("");
                    }}
                    className="block w-full truncate px-2.5 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800"
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <FeedbacksTable
        rows={rows}
        isLoading={isLoading}
        canFollowup={canFollowup}
        markingId={mark.isPending ? (mark.variables as string) : null}
        onMark={(id) => mark.mutate(id)}
      />

      {/* Paginação .range() + count exact */}
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="tabular-nums">
          {total === 0 ? "0" : `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)}`} de {total}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="h-8 rounded-lg bg-slate-800 px-3 font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            disabled={(page + 1) * PAGE >= total}
            onClick={() => setPage((p) => p + 1)}
            className="h-8 rounded-lg bg-slate-800 px-3 font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
