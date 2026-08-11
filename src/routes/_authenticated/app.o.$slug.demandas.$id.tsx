import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getDemanda, updateDemanda, addComment, deleteDemanda } from "@/lib/demandas.functions";
import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { StateBadge, STATE_LABEL, PriorityBadge, formatRelative } from "@/components/demandas-ui";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { ArrowLeft, MessageCircle, GitBranch, User, AlertCircle, Send, Trash2, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug/demandas/$id")({
  head: () => ({ meta: [{ title: "Demanda — Fluxo" }] }),
  component: DemandaDetail,
});

const NEXT_STATES = ["novo", "em_analise", "aguardando_cliente", "aguardando_revisao_humana", "concluido"] as const;
const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
const MANAGER_ROLES = new Set(["owner", "admin", "gerente"]);

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Admin",
  gerente: "Gerente",
  operador: "Operador",
  agente_ia: "Agente de IA",
};

function initials(name: string) {
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function Avatar({ name, isAI }: { name: string; isAI?: boolean }) {
  return (
    <div
      className={`h-8 w-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold ${
        isAI ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
      }`}
      aria-hidden
    >
      {isAI ? "IA" : initials(name)}
    </div>
  );
}

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
  const isManager = !!org && MANAGER_ROLES.has(org.role);

  const opsFn = useServerFn(listOperators);
  const { data: operators } = useQuery({
    queryKey: ["operators", org?.id],
    enabled: !!org?.id && isManager,
    queryFn: () => opsFn({ data: { orgId: org!.id } }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["demanda", id],
    queryFn: () => getFn({ data: { id } }),
  });

  // Atualização em tempo real do histórico e da própria demanda.
  useEffect(() => {
    const channel = supabase
      .channel(`demanda-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demanda_events", filter: `demanda_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["demanda", id] }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "demandas", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["demanda", id] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc]);

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
  const actors: Record<string, { id: string; name: string; email: string | null; role: string | null }> = (data as any).actors ?? {};
  const viewerId: string | undefined = (data as any).viewerId;
  const actorOf = (uid?: string | null) => (uid ? actors[uid] : undefined);
  const nameOf = (uid?: string | null, fallback = "Sistema") => {
    if (!uid) return fallback;
    const a = actorOf(uid);
    if (!a) return "Usuário removido";
    return uid === viewerId ? `${a.name} (você)` : a.name;
  };
  const roleOf = (uid?: string | null) => {
    const r = actorOf(uid)?.role;
    return r ? (ROLE_LABEL[r] ?? r) : null;
  };

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
            {data.events.map((e: any) => {
              const isExternal = e.kind === "message_in";
              const author = isExternal
                ? (d.contacts?.name ?? "Cliente")
                : nameOf(e.actor_id, e.kind === "created" ? "Entrada externa" : "Sistema");
              const authorRole = isExternal ? "Cliente" : roleOf(e.actor_id);
              const isAI = actorOf(e.actor_id)?.role === "agente_ia";
              return (
                <div key={e.id} className="flex gap-3 p-3 rounded-md border border-border bg-card">
                  <Avatar name={author} isAI={isAI} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
                      <span className="font-semibold text-foreground">{author}</span>
                      {authorRole && (
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase tracking-wide">
                          {authorRole}
                        </span>
                      )}
                      <span className="text-muted-foreground">· {formatRelative(e.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-1">
                      {e.kind === "commented" && <><MessageCircle className="h-3.5 w-3.5" /> comentou</>}
                      {e.kind === "state_changed" && <><GitBranch className="h-3.5 w-3.5" /> mudou o estado de <b>{STATE_LABEL[e.from_value] ?? e.from_value}</b> para <b>{STATE_LABEL[e.to_value] ?? e.to_value}</b></>}
                      {e.kind === "priority_changed" && <><GitBranch className="h-3.5 w-3.5" /> mudou a prioridade de <b>{e.from_value}</b> para <b>{e.to_value}</b></>}
                      {e.kind === "created" && <><AlertCircle className="h-3.5 w-3.5" /> abriu a demanda</>}
                      {e.kind === "assigned" && <><User className="h-3.5 w-3.5" /> definiu o responsável: <b>{e.to_value ? nameOf(e.to_value) : "sem responsável"}</b></>}
                      {e.kind === "message_in" && <><MessageCircle className="h-3.5 w-3.5 text-primary" /> enviou uma mensagem</>}
                      {!["commented","state_changed","assigned","created","message_in","priority_changed"].includes(e.kind) && <><GitBranch className="h-3.5 w-3.5" /> {e.kind}</>}
                    </div>
                    {e.content && (
                      <div className={`mt-2 text-sm whitespace-pre-wrap break-words ${e.kind === "commented" || isExternal ? "rounded-md bg-muted/60 px-3 py-2" : ""}`}>
                        {e.content}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
          {org && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Responsável</div>
              <div className="text-sm mb-2 truncate">
                {d.assignee_id
                  ? <>
                      <span className="font-medium">{nameOf(d.assignee_id)}</span>
                      {roleOf(d.assignee_id) && <span className="text-muted-foreground"> · {roleOf(d.assignee_id)}</span>}
                    </>
                  : <span className="text-muted-foreground">Sem responsável</span>}
              </div>
              {d.assignee_id !== org.userId && (
                <button
                  onClick={() => update.mutate({ assignee_id: org.userId })}
                  className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center justify-center gap-2"
                >
                  <UserCheck className="h-4 w-4" /> Atribuir para mim
                </button>
              )}
              {isManager && (
                <div className="mt-2 space-y-2">
                  <select
                    value={d.assignee_id ?? ""}
                    onChange={(e) => update.mutate({ assignee_id: e.target.value || null })}
                    className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">— Sem responsável —</option>
                    {(operators ?? []).map((o) => (
                      <option key={o.user_id} value={o.user_id}>
                        {o.email ?? o.user_id.slice(0, 8)} · {o.role}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">Gerentes/Admins podem mover a demanda entre operadores.</p>
                </div>
              )}
            </div>
          )}
          {d.contacts && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Contato</div>
              <div className="text-sm font-medium">{d.contacts.name ?? "(sem nome)"}</div>
              {d.contacts.phone && <div className="text-xs text-muted-foreground">{d.contacts.phone}</div>}
              {d.contacts.email && <div className="text-xs text-muted-foreground">{d.contacts.email}</div>}
            </div>
          )}
          <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
            Criada por <span className="text-foreground font-medium">{nameOf(d.created_by, "entrada externa")}</span> {formatRelative(d.created_at)}<br />
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