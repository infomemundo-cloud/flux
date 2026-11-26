import { useState } from "react";
import { Check, Copy, MessageSquareHeart, Star } from "lucide-react";
import { RowMenu } from "@/components/row-menu";
import { toast } from "sonner";

export type FeedbackRow = {
  id: string;
  rating: number;
  tags: string[] | null;
  comment: string | null;
  pmf_score: string | null;
  allow_followup: boolean;
  surface: string;
  current_route: string | null;
  tier_code: string | null;
  followed_up_at: string | null;
  created_at: string;
  org_name: string;
  user_email: string | null;
  user_name: string | null;
};

const PMF_SHORT: Record<string, string> = {
  very_disappointed: "Muito decep.",
  somewhat_disappointed: "Um pouco decep.",
  not_disappointed: "Não decep.",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Tabela densa de feedbacks (9.4): linha clicável expande comentário + tags +
 * metadados; RowMenu portalizado (não clipa no overflow da tabela) com a
 * fricção no onClick (marcar follow-up é ação auditada, não destrutiva).
 */
export function FeedbacksTable({
  rows,
  isLoading,
  canFollowup,
  markingId,
  onMark,
}: {
  rows: FeedbackRow[];
  isLoading: boolean;
  canFollowup: boolean;
  markingId: string | null;
  onMark: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Data</th>
              <th className="px-3 py-2 font-semibold">Org</th>
              <th className="px-3 py-2 font-semibold">Usuário</th>
              <th className="px-3 py-2 font-semibold">Nota</th>
              <th className="px-3 py-2 font-semibold">PMF</th>
              <th className="px-3 py-2 font-semibold">Follow-up</th>
              <th className="px-3 py-2 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <>
                <tr
                  key={r.id}
                  onClick={() => setExpanded((e) => (e === r.id ? null : r.id))}
                  className="cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-800/30"
                >
                  <td className="px-3 py-2 text-[11px] tabular-nums text-slate-400">
                    {shortDate(r.created_at)}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-[11px] text-slate-300">
                    {r.org_name}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-[11px] text-slate-400">
                    {r.user_name ?? r.user_email ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums text-slate-100">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {r.rating}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[10px] text-slate-400">
                    {r.pmf_score ? (PMF_SHORT[r.pmf_score] ?? r.pmf_score) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {!r.allow_followup ? (
                      <span className="text-[10px] text-slate-600">—</span>
                    ) : r.followed_up_at ? (
                      <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        feito
                      </span>
                    ) : (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      items={[
                        {
                          label: "Marcar follow-up feito",
                          icon: <Check className="h-3.5 w-3.5" />,
                          disabled:
                            !canFollowup ||
                            !r.allow_followup ||
                            !!r.followed_up_at ||
                            markingId === r.id,
                          onClick: () => onMark(r.id),
                        },
                        {
                          label: "Copiar comentário",
                          icon: <Copy className="h-3.5 w-3.5" />,
                          disabled: !r.comment,
                          onClick: () => {
                            navigator.clipboard.writeText(r.comment ?? "");
                            toast.success("Comentário copiado");
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr key={`${r.id}-x`} className="border-b border-slate-800/60 bg-slate-950/60">
                    <td colSpan={7} className="px-4 py-3">
                      <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                        {r.comment || "Sem comentário livre."}
                      </p>
                      {(r.tags ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(r.tags ?? []).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 font-mono text-[10px] text-slate-500">
                        surface={r.surface} · tier={r.tier_code ?? "—"} · route={r.current_route ?? "—"} ·{" "}
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-14 text-center">
                  <MessageSquareHeart className="mx-auto h-4 w-4 text-slate-500" />
                  <div className="mt-2 text-xs font-semibold text-slate-300">
                    Nenhum feedback neste recorte
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Ajuste os filtros ou aguarde os testers enviarem pelo menu / nudge.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
