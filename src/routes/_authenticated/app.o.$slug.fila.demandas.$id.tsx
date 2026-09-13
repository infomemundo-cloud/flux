import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getDemanda, updateDemanda, addComment, deleteDemanda } from "@/lib/demandas.functions";
import { sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { STATE_LABEL, formatRelative } from "@/components/demandas-ui";
import { toast } from "sonner";
import { DetailSkeleton } from "@/components/skeletons";
import { friendlyError } from "@/lib/friendly-error";
import { useFilaSidebar } from "@/lib/fila-sidebar-context";
import { STATE_COLOR } from "@/lib/state-colors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PanelLeftClose, PanelRightClose, PanelRightOpen, X, Lock, MessageCircle, GitBranch, AlertCircle, Send, Trash2, UserCheck,
  Flag, CalendarClock, UserCog, Activity, Circle, CheckCircle2, Paperclip, Smile, Sticker,
} from "lucide-react";

// Rota aninhada dentro de /fila — renderiza no <Outlet/> de app.o.$slug.fila.tsx.
export const Route = createFileRoute("/_authenticated/app/o/$slug/fila/demandas/$id")({
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

// Estilo único dos controles do trilho — sua versão em caixa (borda + fundo
// card), consolidada aqui em vez de repetida 3 vezes, pra ficar fácil de
// ajustar num lugar só depois.
const RAIL_TRIGGER_CLS =
  "w-full h-8 px-2 rounded-md border border-border/60 bg-card text-xs font-medium text-left hover:bg-accent/50 focus:ring-1 focus:ring-ring transition-colors";

function initials(name: string) {
  return name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function Avatar({ name, isAI, tone, size = "md" }: { name: string; isAI?: boolean; tone?: "client" | "team"; size?: "sm" | "md" }) {
  return (
    <div
      className={`${size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]"} shrink-0 rounded-full grid place-items-center font-bold ${
        isAI ? "pill-violet" : tone === "client" ? "pill-green" : "pill-brand"
      }`}
      aria-hidden
    >
      {isAI ? "IA" : initials(name) || "?"}
    </div>
  );
}

/** Linha de propriedade do trilho: label pequeno + valor/controle compacto. */
function RailRow({ icon: Icon, label, children }: { icon: typeof Flag; label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" strokeWidth={2.2} /> {label}
        </span>
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
  const { slug, id } = useParams({ from: "/_authenticated/app/o/$slug/fila/demandas/$id" });
  const navigate = useNavigate();
  const filaSidebar = useFilaSidebar();
  const getFn = useServerFn(getDemanda);
  const updateFn = useServerFn(updateDemanda);
  const commentFn = useServerFn(addComment);
  const deleteFn = useServerFn(deleteDemanda);
  const orgFn = useServerFn(getOrgBySlug);
  const qc = useQueryClient();
  const waFn = useServerFn(sendWhatsAppMessage);
  const [comment, setComment] = useState("");
  const [viaWhatsapp, setViaWhatsapp] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

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

  const update = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id, ...patch } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["demanda", id] }); qc.invalidateQueries({ queryKey: ["demandas"] }); toast.success("Atualizado"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const send = useMutation({
    mutationFn: () => {
      const goViaWhatsapp = viaWhatsapp && !!data?.demanda?.whatsapp_jid;
      return goViaWhatsapp
        ? waFn({ data: { demandId: id, messageText: comment, role: "agent" as const } })
        : commentFn({ data: { demandaId: id, orgId: data!.demanda.org_id, content: comment } });
    },
    onSuccess: (res: any) => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["demanda", id] });
      if (viaWhatsapp && data?.demanda?.whatsapp_jid) toast.success(res?.message ?? "Mensagem enviada");
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

  // Pula direto pro final da conversa: ao trocar de demanda, ao carregar o
  // histórico, e a cada evento novo (mensagem enviada/recebida). É o mesmo
  // comportamento do WhatsApp Web — a rolagem manual só serve pra ver o
  // que já ficou pra trás, nunca pra achar a mensagem mais recente.
  const eventsLength = data?.events?.length ?? 0;
  const lastEventId = data?.events?.[eventsLength - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [id, lastEventId]);

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
  const contactName = d.contacts?.name || d.contacts?.phone || "Sem contato";
  const effectiveViaWhatsapp = viaWhatsapp && !!d.whatsapp_jid;

  return (
    <div className="relative flex h-full">
      {/* Coluna principal: Área 1 (cabeçalho) + Área 2 (conversa) + Área 3 (digitação) */}
      <div className="flex flex-col min-w-0 flex-1">
        {/* Área 1 — cabeçalho horizontal, fixo */}
        <div className="shrink-0 border-b border-border bg-card p-3 flex items-center gap-2.5">
          <button
            onClick={() => filaSidebar?.setCollapsed(true)}
            title="Recolher fila"
            aria-label="Recolher fila"
            className="hidden sm:grid shrink-0 place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>

          <Avatar name={contactName} tone="client" />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="truncate text-sm font-semibold text-foreground">{contactName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">· {d.protocol}</span>
            </div>
            {d.contacts?.phone && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageCircle className="h-3 w-3" strokeWidth={2.2} /> {d.contacts.phone}
              </div>
            )}
          </div>

          {/* Botão de abrir o painel lateral quando recolhido */}
          {railCollapsed && (
            <button
              onClick={() => setRailCollapsed(false)}
              title="Expandir painel lateral"
              aria-label="Expandir painel lateral"
              className="hidden md:grid shrink-0 place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          )}

          <Link
            to="/app/o/$slug/fila"
            params={{ slug }}
            title="Fechar"
            aria-label="Fechar painel"
            className="shrink-0 grid place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>

        {/* Área 2 — histórico da conversa */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4">
          {d.description && (
            <div className="mb-4 rounded-lg border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
              {d.description}
            </div>
          )}

          <ul className="space-y-1">
            {data.events.map((e: any) => {
              const isClient = e.kind === "message_in";
              const isOutgoing = e.kind === "message_out";
              const isComment = e.kind === "commented";
              const isChatMessage = isClient || isOutgoing || isComment;
              const when = formatRelative(e.created_at);

              if (!isChatMessage) {
                const fallbackByKind: Record<string, string> = {
                  created: "Entrada externa",
                  state_changed: "Automação",
                  priority_changed: "Automação",
                  assigned: "Atribuição automática",
                };
                const fallback = fallbackByKind[e.kind] ?? "Sistema";
                const who = <span className="font-semibold text-foreground/80">{nameOf(e.actor_id, fallback)}</span>;

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
                      {who} criou a demanda
                    </SystemLine>
                  );
                if (e.kind === "assigned")
                  return (
                    <SystemLine key={e.id} icon={UserCheck} when={when}>
                      {who} atribuiu para{" "}
                      <b className="text-foreground/80">{e.to_value ? nameOf(e.to_value, "usuário removido") : "sem responsável"}</b>
                    </SystemLine>
                  );
                return (
                  <SystemLine key={e.id} icon={Circle} when={when}>
                    {who} · {e.kind}
                  </SystemLine>
                );
              }

              const author = isClient ? contactName : nameOf(e.actor_id, "Atendente");
              const authorRole = isClient ? "Cliente" : roleOf(e.actor_id);
              const isAI = actorOf(e.actor_id)?.role === "agente_ia";
              const messageLabel = isClient ? "mensagem recebida" : isOutgoing ? "resposta enviada" : "comentário";

              return (
                <li key={e.id} className={`flex gap-2.5 pt-2 ${isClient ? "" : "sm:pl-8"}`}>
                  <Avatar name={author} isAI={isAI} tone={isClient ? "client" : "team"} size="sm" />
                  <div
                    className={`min-w-0 flex-1 rounded-xl px-3.5 py-2.5 ${
                      isClient
                        ? "border border-border border-l-[3px] border-l-[var(--pill-green-fg)] bg-card shadow-[var(--shadow-card)]"
                        : isOutgoing
                        ? "border border-primary/20 border-l-[3px] border-l-primary bg-primary/[0.04]"
                        : "border border-primary/15 bg-primary/[0.02]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
                      <span className="font-semibold text-foreground">{author}</span>
                      {authorRole && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isClient ? "pill-green" : isAI ? "pill-violet" : "pill-brand"}`}>
                          {authorRole}
                        </span>
                      )}
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        · {isOutgoing ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <MessageCircle className="h-3 w-3" />} {messageLabel} · {when}
                      </span>
                    </div>
                    {e.content && <div className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{e.content}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Área 3 — digitação. Anexo/emoji/figurinha aparecem como placeholders
            (avisam "em breve" ao clicar) pra já dar a sensação de área
            profissional completa, mesmo sem a função pronta ainda. */}
        <div className="shrink-0 border-t border-border bg-card p-3">
          {d.whatsapp_jid && (
            <div className="mb-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViaWhatsapp(true)}
                title="Responder no WhatsApp"
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  effectiveViaWhatsapp
                    ? "bg-[#25D366]/15 text-[#128C4A] ring-1 ring-[#25D366]/40"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.3} /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setViaWhatsapp(false)}
                title="Comentário interno — só sua equipe vê"
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  !effectiveViaWhatsapp
                    ? "bg-secondary text-foreground ring-1 ring-border"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Lock className="h-3.5 w-3.5" strokeWidth={2.3} /> Interno
              </button>
            </div>
          )}

          <div
            className={`rounded-xl border bg-background transition focus-within:ring-2 ${
              effectiveViaWhatsapp
                ? "border-[#25D366]/40 focus-within:border-[#25D366]/60 focus-within:ring-[#25D366]/15"
                : "border-border focus-within:border-primary/50 focus-within:ring-primary/10"
            }`}
          >
            <textarea
              ref={composerRef}
              rows={1}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 160) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (comment.trim() && !send.isPending) send.mutate();
                }
              }}
              placeholder={effectiveViaWhatsapp ? "Escreva a resposta que será enviada ao cliente..." : "Comentário interno (não vai pro cliente)..."}
              className="w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm placeholder:text-muted-foreground outline-none scrollbar-thin"
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toast("Anexar arquivo chega em breve")}
                  title="Anexar arquivo (em breve)"
                  className="grid place-items-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toast("Emojis chegam em breve")}
                  title="Emoji (em breve)"
                  className="grid place-items-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toast("Figurinhas chegam em breve")}
                  title="Figurinha (em breve)"
                  className="grid place-items-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition"
                >
                  <Sticker className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => { if (comment.trim() && !send.isPending) send.mutate(); }}
                disabled={send.isPending || !comment.trim()}
                title={effectiveViaWhatsapp ? "Enviar no WhatsApp" : "Salvar comentário interno"}
                className={`grid place-items-center h-8 w-8 rounded-lg text-white transition disabled:opacity-40 ${
                  effectiveViaWhatsapp ? "bg-[#25D366] hover:brightness-105" : "bg-primary hover:opacity-90"
                }`}
              >
                <Send className="h-4 w-4" strokeWidth={2.3} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Trilho vertical à direita */}
      {/* Trilho vertical ultra-compacto e refinado à direita */}
{!railCollapsed && (
  <aside className="hidden md:flex md:flex-col w-[195px] shrink-0 border-l border-border/80 bg-muted/15 select-none overflow-y-auto scrollbar-thin">
    {/* Cabeçalho da Sidebar */}
    <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-card/50">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        Propriedades
      </span>
      <button
        onClick={() => setRailCollapsed(true)}
        title="Recolher painel"
        aria-label="Recolher painel"
        className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <PanelRightClose className="h-3.5 w-3.5" />
      </button>
    </div>

    {/* Seções de Atributos */}
    <div className="divide-y divide-border/50 text-xs">
      {/* Estado */}
      <div className="p-2.5 space-y-1">
        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Estado
        </label>
        <Select value={d.state} onValueChange={(v) => update.mutate({ state: v })}>
          <SelectTrigger className={RAIL_TRIGGER_CLS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="text-xs">
            {NEXT_STATES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${STATE_COLOR[s] ?? "bg-muted-foreground/40"}`} />
                  {STATE_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Prioridade */}
      <div className="p-2.5 space-y-1">
        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Flag className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Prioridade
        </label>
        <Select value={d.priority} onValueChange={(v) => update.mutate({ priority: v })}>
          <SelectTrigger className={RAIL_TRIGGER_CLS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="text-xs">
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Prazo */}
      <div className="p-2.5 space-y-1">
        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Prazo
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <button className={`${RAIL_TRIGGER_CLS} truncate`}>
              {d.due_at ? (
                new Date(d.due_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
              ) : (
                <span className="text-muted-foreground font-normal">Sem prazo</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <input
              type="datetime-local"
              defaultValue={d.due_at ? new Date(d.due_at).toISOString().slice(0, 16) : ""}
              onChange={(e) => update.mutate({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className={SELECT_CLS}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Responsável */}
      {org && (
        <div className="p-2.5 space-y-1">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <UserCog className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Responsável
          </label>
          {isManager ? (
            <Select value={d.assignee_id ?? "none"} onValueChange={(v) => update.mutate({ assignee_id: v === "none" ? null : v })}>
              <SelectTrigger className={RAIL_TRIGGER_CLS}>
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent align="end" className="text-xs">
                <SelectItem value="none" className="text-xs">— Sem responsável —</SelectItem>
                {(operators ?? []).map((o) => (
                  <SelectItem key={o.user_id} value={o.user_id} className="text-xs">
                    {o.email ?? o.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className={`${RAIL_TRIGGER_CLS} flex items-center truncate`}>
              {d.assignee_id ? nameOf(d.assignee_id) : <span className="text-muted-foreground font-normal">Sem responsável</span>}
            </div>
          )}
          {d.assignee_id !== org.userId && (
            <button
              onClick={() => update.mutate({ assignee_id: org.userId })}
              className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <UserCheck className="h-3 w-3" /> Atribuir a mim
            </button>
          )}
        </div>
      )}
    </div>

    {/* Rodapé / Ação Perigosa */}
    {canDelete && (
      <div className="mt-auto border-t border-border/60 p-2.5 bg-card/40">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full h-7 flex items-center justify-center gap-1.5 rounded-md border border-destructive/20 text-destructive text-[11px] font-medium hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Excluir demanda
          </button>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground text-center">Excluir permanentemente?</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={remove.isPending}
                className="h-7 flex-1 rounded border border-border bg-card text-[11px] font-medium hover:bg-secondary"
              >
                Não
              </button>
              <button
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="h-7 flex-1 rounded bg-destructive text-destructive-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
              >
                {remove.isPending ? "..." : "Sim"}
              </button>
            </div>
          </div>
        )}
      </div>
    )}
  </aside>
)}
    </div>
  );
}
