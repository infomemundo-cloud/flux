import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDemanda, updateDemanda, addComment, deleteDemanda } from "@/lib/demandas.functions";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { StateBadge, STATE_LABEL, PriorityBadge, formatRelative } from "@/components/demandas-ui";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { ArrowLeft, MessageCircle, GitBranch, User, AlertCircle, Send, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug/demandas/$id")({
  head: () => ({ meta: [{ title: "Demanda — Fluxo" }] }),
  component: DemandaDetail,
});

const NEXT_STATES = ["novo", "em_analise", "aguardando_cliente", "aguardando_revisao_humana", "concluido"] as const;
const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;

function DemandaDetail() {
  const { slug, id } = useParams({ from: "/_authenticated/app/o/$slug/demandas/$id" });
  const navigate = useNavigate();
  const getFn = useServerFn(getDemanda);
  const updateFn = useServerFn(updateDemanda);
  const commentFn = useServerFn(addComment);
  const deleteFn = useServerFn(deleteDemanda);
  const orgFn = useServerFn(getOrgBySlug);
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });
  const canDelete = org?.role === "owner" || org?.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["demanda", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const update = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id, ...patch } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["demanda", id] }); qc.invalidateQueries({ queryKey: ["demandas"] }); toast.success("Atualizado"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const send = useMutation({
    mutationFn: () => commentFn({ data: { demandaId: id, orgId: data!.demanda.org_id, content: comment } }),
    onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: ["demanda", id] }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Demanda excluída");
      qc.invalidateQueries({ queryKey: ["demandas"] });
      navigate({ to: "/app/o/$slug/fila", params: { slug } });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  const d: any = data.demanda;

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-5xl mx-auto">
      <Link to="/app/o/$slug/fila" params={{ slug }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para fila
      </Link>

      <div className="mt-4 grid md:grid-cols-[minmax(0,1fr)_280px] gap-4 md:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap"><StateBadge state={d.state} /><PriorityBadge priority={d.priority} /></div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">{d.title}</h1>
          {d.description && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{d.description}</p>}

          <h2 className="mt-6 sm:mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Histórico</h2>
          <div className="mt-3 space-y-3">
            {data.events.map((e: any) => (
              <div key={e.id} className="flex gap-3 p-3 rounded-md border border-border bg-card">
                <div className="mt-0.5 text-muted-foreground shrink-0">
                  {e.kind === "commented" && <MessageCircle className="h-4 w-4" />}
                  {e.kind === "state_changed" && <GitBranch className="h-4 w-4" />}
                  {e.kind === "assigned" && <User className="h-4 w-4" />}
                  {e.kind === "created" && <AlertCircle className="h-4 w-4" />}
                  {e.kind === "message_in" && <MessageCircle className="h-4 w-4 text-primary" />}
                  {!["commented","state_changed","assigned","created","message_in"].includes(e.kind) && <GitBranch className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1">
                    {e.kind === "state_changed" && <>Estado: <b>{STATE_LABEL[e.from_value] ?? e.from_value}</b> → <b>{STATE_LABEL[e.to_value] ?? e.to_value}</b></>}
                    {e.kind === "priority_changed" && <>Prioridade: {e.from_value} → {e.to_value}</>}
                    {e.kind === "created" && <>Demanda criada</>}
                    {e.kind === "assigned" && <>Responsável alterado</>}
                    {e.kind === "commented" && <>Comentário</>}
                    {e.kind === "message_in" && <>Mensagem recebida</>}
                    <span>· {formatRelative(e.created_at)}</span>
                  </div>
                  {e.content && <div className="mt-1 text-sm whitespace-pre-wrap break-words">{e.content}</div>}
                </div>
              </div>
            ))}
          </div>

          <form className="mt-4 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (comment.trim()) send.mutate(); }}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Adicionar comentário..."
              className="flex-1 min-w-0 h-10 px-3 rounded-md border border-input bg-background text-sm" />
            <button disabled={send.isPending} className="shrink-0 h-10 px-3 sm:px-4 rounded-md bg-primary text-primary-foreground inline-flex items-center gap-2 disabled:opacity-60 text-sm">
              <Send className="h-4 w-4" /> <span className="hidden sm:inline">Enviar</span>
            </button>
          </form>
        </div>

        <aside className="space-y-3 sm:space-y-4 min-w-0">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Estado</div>
            <select value={d.state} onChange={(e) => update.mutate({ state: e.target.value })}
              className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm">
              {NEXT_STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Prioridade</div>
            <select value={d.priority} onChange={(e) => update.mutate({ priority: e.target.value })}
              className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Prazo</div>
            <input type="datetime-local"
              defaultValue={d.due_at ? new Date(d.due_at).toISOString().slice(0, 16) : ""}
              onBlur={(e) => update.mutate({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm" />
          </div>
          {d.contacts && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Contato</div>
              <div className="text-sm font-medium">{d.contacts.name ?? "(sem nome)"}</div>
              {d.contacts.phone && <div className="text-xs text-muted-foreground">{d.contacts.phone}</div>}
              {d.contacts.email && <div className="text-xs text-muted-foreground">{d.contacts.email}</div>}
            </div>
          )}
          <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
            Criada {formatRelative(d.created_at)}<br />
            Atualizada {formatRelative(d.updated_at)}
          </div>
          {canDelete && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="text-xs uppercase tracking-wide text-destructive mb-2">Zona de perigo</div>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full h-9 rounded-md border border-destructive/40 text-destructive text-sm inline-flex items-center justify-center gap-2 hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Excluir demanda
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita. Todo o histórico será removido.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={remove.isPending}
                      className="flex-1 h-9 rounded-md border border-input bg-background text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => remove.mutate()}
                      disabled={remove.isPending}
                      className="flex-1 h-9 rounded-md bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-60"
                    >
                      {remove.isPending ? "Excluindo..." : "Confirmar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}