import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDemanda, updateDemanda, addComment, deleteDemanda } from "@/lib/demandas.functions";
import { sendWhatsAppMessage } from "@/lib/whatsapp.functions";

import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { StateBadge, STATE_LABEL, PriorityBadge, formatRelative } from "@/components/demandas-ui";
import { toast } from "sonner";
import { DetailSkeleton } from "@/components/skeletons";
import { friendlyError } from "@/lib/friendly-error";
import {
  ArrowLeft, MessageCircle, GitBranch, User, AlertCircle, Send, Trash2, UserCheck,
  Flag, CalendarClock, UserCog, Contact as ContactIcon, Activity, ShieldAlert, Circle,
} from "lucide-react";

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

const SELECT_CLS =
  "w-full h-9 px-2.5 rounded-lg border border-border bg-background text-sm text-foreground transition-colors hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const GHOST_BTN =
  "w-full h-9 rounded-lg border border-border bg-transparent text-sm font-semibold text-foreground inline-flex items-center justify-center gap-2 transition-colors hover:border-primary/50 hover:bg-primary/[0.06] hover:text-primary";

function initials(name: string) {
  return name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function Avatar({ name, isAI, tone }: { name: string; isAI?: boolean; tone?: "client" | "team" }) {
  return (
    <div
      className={`h-8 w-8 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${
        isAI ? "pill-violet" : tone === "client" ? "pill-green" : "pill-brand"
      }`}
      aria-hidden
    >
      {isAI ? "IA" : initials(name) || "?"}
    </div>
  );
}

/** Cartão de campo do painel lateral. */
function Field({ icon: Icon, label, children }: { icon: typeof Flag; label: string; children: React.ReactNode }) {
  return (
    <div className="card-elevated p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} /> {label}
      </div>
      {children}
    </div>
  );
}

/** Linha fina de timeline para eventos de sistema. */
function SystemLine({ icon: Icon, children, when }: { icon: typeof GitBranch; children: React.ReactNode; when: string }) {
  return (
    <li className="relative pl-9">
      <span className="absolute left-[11px] top-0 h-full w-px bg-border" aria-hidden />
      <span className="absolute left-0 top-1 grid h-[22px] w-[22px] place-items-center rounded-full border border-border bg-background text-muted-foreground">
        <Icon className="h-3 w-3" strokeWidth={2.3} />
      </span>
      <div className="py-1.5 text-xs leading-relaxed text-muted-foreground">
        {children} <span className="opacity-70">· {when}</span>
      </div>
    </li>
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
  const waFn = useServerFn(sendWhatsAppMessage);
  const [comment, setComment] = useState("");
  const [viaWhatsapp, setViaWhatsapp] = useState(false);
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
    refetchInterval: 8000,
  });

  // O canal em tempo real da organização (layout) já invalida ["demanda", id];
  // o refetchInterval acima é a rede de segurança caso o websocket caia.

  const update = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id, ...patch } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["demanda", id] }); qc.invalidateQueries({ queryKey: ["demandas"] }); toast.success("Atualizado"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const send = useMutation({
    mutationFn: () =>
      viaWhatsapp
        ? waFn({ data: { demandId: id, messageText: comment, role: "agent" as const } })
        : commentFn({ data: { demandaId: id, orgId: data!.demanda.org_id, content: comment } }),
    onSuccess: (res: any) => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["demanda", id] });
      if (viaWhatsapp) toast.success(res?.message ?? "Mensagem enviada");
    },
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

  if (isLoading || !data) return <DetailSkeleton />;
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

      <div className="mt-4 grid md:grid-cols-[minmax(0,1fr)_296px] gap-4 md:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap"><StateBadge state={d.state} /><PriorityBadge priority={d.priority} /></div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">{d.title}</h1>
          {d.description && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{d.description}</p>}

          <h2 className="mt-6 sm:mt-8 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <Activity className="h-3.5 w-3.5" strokeWidth={2.3} /> Histórico
          </h2>

          <ul className="mt-3 space-y-1">
            {data.events.map((e: any) => {
              const isClient = e.kind === "message_in";
              const isComment = e.kind === "commented";
              const when = formatRelative(e.created_at);

              // Eventos de sistema: linha do tempo fina, sem cartão.
              if (!isClient && !isComment) {
                const who = <span className="font-semibold text-foreground/80">{nameOf(e.actor_id, e.kind === "created" ? "Entrada externa" : "Sistema")}</span>;
                if (e.kind === "state_changed")
                  return (
                    <SystemLine key={e.id} icon={GitBranch} when={when}>
                      {who} mudou o estado de <b className="text-foreground/80">{STATE_LABEL[e.from_value] ?? e.from_value}</b> para{" "}
                      <b className="text-foreground/80">{STATE_LABEL[e.to_value] ?? e.to_value}</b>
                    </SystemLine>
                  );
                if (e.kind === "priority_changed")
                  return (
                    <SystemLine key={e.id} icon={Flag} when={when}>
                      {who} mudou a prioridade de <b className="text-foreground/80">{e.from_value}</b> para <b className="text-foreground/80">{e.to_value}</b>
                    </SystemLine>
                  );
                if (e.kind === "created")
                  return (
                    <SystemLine key={e.id} icon={AlertCircle} when={when}>
                      {who} abriu a demanda
                    </SystemLine>
                  );
                if (e.kind === "assigned")
                  return (
                    <SystemLine key={e.id} icon={User} when={when}>
                      {who} definiu o responsável: <b className="text-foreground/80">{e.to_value ? nameOf(e.to_value) : "sem responsável"}</b>
                    </SystemLine>
                  );
                return (
                  <SystemLine key={e.id} icon={Circle} when={when}>
                    {who} · {e.kind}
                  </SystemLine>
                );
              }

              // Mensagens: cartões estilo chat com contraste por autor.
              const author = isClient ? (d.contacts?.name ?? "Cliente") : nameOf(e.actor_id);
              const authorRole = isClient ? "Cliente" : roleOf(e.actor_id);
              const isAI = actorOf(e.actor_id)?.role === "agente_ia";

              return (
                <li key={e.id} className={`flex gap-3 pt-2 ${isClient ? "" : "sm:pl-8"}`}>
                  <Avatar name={author} isAI={isAI} tone={isClient ? "client" : "team"} />
                  <div
                    className={`min-w-0 flex-1 rounded-xl px-3.5 py-2.5 ${
                      isClient
                        ? "border border-border border-l-[3px] border-l-[var(--pill-green-fg)] bg-card shadow-[var(--shadow-card)]"
                        : "border border-primary/15 bg-primary/[0.05]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
                      <span className="font-semibold text-foreground">{author}</span>
                      {authorRole && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isClient ? "pill-green" : isAI ? "pill-violet" : "pill-brand"}`}>
                          {authorRole}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        · <MessageCircle className="inline h-3 w-3 -mt-0.5" /> {isClient ? "mensagem recebida" : "comentário"} · {when}
                      </span>
                    </div>
                    {e.content && (
                      <div className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{e.content}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {d.whatsapp_jid && (
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              <button type="button" onClick={() => setViaWhatsapp(false)}
                className={`rounded-full border px-3 py-1 font-semibold transition ${!viaWhatsapp ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                Comentário interno
              </button>
              <button type="button" onClick={() => setViaWhatsapp(true)}
                className={`rounded-full border px-3 py-1 font-semibold transition ${viaWhatsapp ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                Responder no WhatsApp
              </button>
              <span className="text-muted-foreground">{d.whatsapp_jid.replace(/@.*$/, "")}</span>
            </div>
          )}

          <form className="mt-3 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (comment.trim()) send.mutate(); }}>
            <input value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={viaWhatsapp ? "Escreva a resposta que será enviada ao cliente..." : "Adicionar comentário..."}
              className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />

            <button disabled={send.isPending} className="shrink-0 h-10 px-3.5 sm:px-4 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition">
              <Send className="h-4 w-4" /> <span className="hidden sm:inline">Enviar</span>
            </button>
          </form>
        </div>

        <aside className="space-y-3 min-w-0">
          <Field icon={Activity} label="Estado">
            <select value={d.state} onChange={(e) => update.mutate({ state: e.target.value })} className={SELECT_CLS}>
              {NEXT_STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
            </select>
          </Field>

          <Field icon={Flag} label="Prioridade">
            <select value={d.priority} onChange={(e) => update.mutate({ priority: e.target.value })} className={SELECT_CLS}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          <Field icon={CalendarClock} label="Prazo">
            <input type="datetime-local"
              defaultValue={d.due_at ? new Date(d.due_at).toISOString().slice(0, 16) : ""}
              onBlur={(e) => update.mutate({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className={SELECT_CLS} />
          </Field>

          {org && (
            <Field icon={UserCog} label="Responsável">
              <div className="mb-2 truncate text-sm">
                {d.assignee_id
                  ? <>
                      <span className="font-medium">{nameOf(d.assignee_id)}</span>
                      {roleOf(d.assignee_id) && <span className="text-muted-foreground"> · {roleOf(d.assignee_id)}</span>}
                    </>
                  : <span className="text-muted-foreground">Sem responsável</span>}
              </div>
              {d.assignee_id !== org.userId && (
                <button onClick={() => update.mutate({ assignee_id: org.userId })} className={GHOST_BTN}>
                  <UserCheck className="h-4 w-4" /> Atribuir para mim
                </button>
              )}
              {isManager && (
                <div className="mt-2 space-y-2">
                  <select
                    value={d.assignee_id ?? ""}
                    onChange={(e) => update.mutate({ assignee_id: e.target.value || null })}
                    className={SELECT_CLS}
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
            </Field>
          )}

          {d.contacts && (
            <Field icon={ContactIcon} label="Contato">
              <div className="text-sm font-medium">{d.contacts.name ?? "(sem nome)"}</div>
              {d.contacts.phone && <div className="text-xs text-muted-foreground">{d.contacts.phone}</div>}
              {d.contacts.email && <div className="text-xs text-muted-foreground">{d.contacts.email}</div>}
            </Field>
          )}

          <div className="card-elevated p-3.5 text-xs text-muted-foreground">
            Criada por <span className="font-medium text-foreground">{nameOf(d.created_by, "entrada externa")}</span> {formatRelative(d.created_at)}<br />
            Atualizada {formatRelative(d.updated_at)}
          </div>

          {canDelete && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-destructive">
                <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.2} /> Zona de perigo
              </div>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Excluir demanda
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita. Todo o histórico será removido.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} disabled={remove.isPending}
                      className="h-9 flex-1 rounded-lg border border-border bg-transparent text-sm font-medium hover:bg-secondary">
                      Cancelar
                    </button>
                    <button onClick={() => remove.mutate()} disabled={remove.isPending}
                      className="h-9 flex-1 rounded-lg bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-60">
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
