import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { getDemanda, updateDemanda, addComment, deleteDemanda } from "@/lib/demandas/demandas.functions";
import { sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { STATE_LABEL } from "@/components/demandas-ui";
import { toast } from "sonner";
import { DetailSkeleton } from "@/components/skeletons";
import { friendlyError } from "@/lib/friendly-error";
import { useFilaSidebar } from "@/lib/demandas/fila-sidebar-context";
import { STATE_COLOR } from "@/lib/demandas/state-colors";
import { resolveContactName } from "@/lib/demandas/resolve-contact-name";
import { ContactAvatar } from "@/components/contact-avatar";
import { DemandaHistory, type ReplyTarget } from "./-components/DemandaHistory";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  X,
  Lock,
  MessageCircle,
  Send,
  Trash2,
  UserCheck,
  Flag,
  CalendarClock,
  UserCog,
  Activity,
  Paperclip,
  Smile,
  Sticker,
  ChevronLeft,
  ChevronRight,
  Clock,
  Reply,
} from "lucide-react";

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

const RAIL_TRIGGER_CLS =
  "w-full h-8 px-2 rounded-md border border-border/60 bg-card text-xs font-medium text-left hover:bg-accent/50 focus:ring-1 focus:ring-ring transition-colors";

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDueLabel(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function DueDatePicker({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfDay(value ? new Date(value) : new Date()));
  const [selected, setSelected] = useState<Date | null>(value ? new Date(value) : null);
  const [hour, setHour] = useState(value ? new Date(value).getHours() : new Date().getHours());
  const [minute, setMinute] = useState(value ? new Date(value).getMinutes() : 0);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const base = value ? new Date(value) : new Date();
      setView(startOfDay(base));
      setSelected(value ? new Date(value) : null);
      setHour(value ? new Date(value).getHours() : new Date().getHours());
      setMinute(value ? new Date(value).getMinutes() : 0);
    }
    setOpen(next);
  };

  const commit = (day: Date, h: number, m: number) => {
    const dt = new Date(day);
    dt.setHours(h, m, 0, 0);
    onChange(dt.toISOString());
  };

  const pickDay = (day: Date) => {
    setSelected(day);
    commit(day, hour, minute);
  };

  const changeHour = (h: number) => {
    setHour(h);
    if (selected) commit(selected, h, minute);
  };

  const changeMinute = (m: number) => {
    setMinute(m);
    if (selected) commit(selected, hour, m);
  };

  const pickToday = () => {
    const now = new Date();
    const day = startOfDay(now);
    setSelected(day);
    setView(day);
    setHour(now.getHours());
    setMinute(now.getMinutes());
    commit(day, now.getHours(), now.getMinutes());
  };

  const cells: { date: Date; inMonth: boolean }[] = [];
  const firstWeekday = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const daysInPrev = new Date(view.getFullYear(), view.getMonth(), 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(view.getFullYear(), view.getMonth() - 1, daysInPrev - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(view.getFullYear(), view.getMonth(), d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }

  const todayMs = startOfDay(new Date()).getTime();
  const selectedMs = selected ? startOfDay(selected).getTime() : null;

  const navBtn =
    "grid place-items-center h-7 w-7 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-90 transition-all duration-150";
  const timeSelect =
    "h-8 flex-1 rounded-md border border-border/60 bg-card px-1.5 text-xs font-medium tabular-nums text-foreground outline-none transition-colors hover:bg-accent/50 focus:ring-1 focus:ring-ring cursor-pointer";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className={`${RAIL_TRIGGER_CLS} group flex items-center justify-between gap-1.5`}>
          {value ? (
            <span className="truncate tabular-nums">{formatDueLabel(value)}</span>
          ) : (
            <span className="text-muted-foreground font-normal">Sem prazo</span>
          )}
          <CalendarClock className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="center"
        sideOffset={10}
        collisionPadding={12}
        className="w-[252px] rounded-xl border-border/60 p-3 shadow-lg max-h-[calc(100vh-24px)] overflow-y-auto scrollbar-thin"
      >
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            className={navBtn}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="text-xs font-semibold capitalize text-foreground">
            {MONTHS_PT[view.getMonth()]} {view.getFullYear()}
          </div>
          <button
            type="button"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            className={navBtn}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {WEEKDAYS_PT.map((w, i) => (
            <div key={i} className="grid h-6 place-items-center text-[10px] font-semibold text-muted-foreground/60">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((c, i) => {
            const ms = startOfDay(c.date).getTime();
            const isSel = ms === selectedMs;
            const isToday = ms === todayMs;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pickDay(c.date)}
                className={`grid h-7 w-7 place-items-center rounded-lg text-[11px] tabular-nums transition-all duration-150 active:scale-90 ${
                  isSel
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm scale-105"
                    : isToday
                    ? "text-primary font-semibold ring-1 ring-primary/40 hover:bg-primary/10"
                    : c.inMonth
                    ? "text-foreground hover:bg-secondary"
                    : "text-muted-foreground/40 hover:bg-secondary/60"
                }`}
              >
                {c.date.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-2.5">
          <Clock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <select aria-label="Hora" value={hour} onChange={(e) => changeHour(Number(e.target.value))} className={timeSelect}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {pad2(h)}
              </option>
            ))}
          </select>
          <span className="text-xs font-semibold text-muted-foreground">:</span>
          <select aria-label="Minuto" value={minute} onChange={(e) => changeMinute(Number(e.target.value))} className={timeSelect}>
            {Array.from({ length: 60 }, (_, m) => (
              <option key={m} value={m}>
                {pad2(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:text-destructive hover:bg-destructive/10 active:scale-95"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={pickToday}
            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-all duration-150 hover:bg-primary/10 active:scale-95"
          >
            Hoje
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
  // Reply com citação (estilo WhatsApp): mensagem sendo respondida enquanto o
  // composer está aberto. null = resposta normal. O snapshot completo é
  // calculado pelo DemandaHistory (que tem author/content/metadata em mãos).
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demanda", id] });
      qc.invalidateQueries({ queryKey: ["demandas"] });
      toast.success("Atualizado");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const send = useMutation({
    mutationFn: () => {
      const goViaWhatsapp = viaWhatsapp && !!data?.demanda?.whatsapp_jid;
      if (goViaWhatsapp) {
        return waFn({
          data: {
            demandId: id,
            messageText: comment,
            role: "agent" as const,
            quoted: replyTo
              ? {
                  event_id: replyTo.event_id,
                  author: replyTo.author,
                  content: replyTo.content,
                  kind: replyTo.kind,
                  message_id: replyTo.message_id,
                  from_me: replyTo.from_me,
                  participant: replyTo.participant,
                }
              : undefined,
          },
        });
      }
      return commentFn({
        data: {
          demandaId: id,
          orgId: data!.demanda.org_id,
          content: comment,
          quoted: replyTo
            ? {
                event_id: replyTo.event_id,
                author: replyTo.author,
                content: replyTo.content,
                kind: replyTo.kind,
              }
            : undefined,
        },
      });
    },
    onSuccess: (res: any) => {
      setComment("");
      setReplyTo(null);
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

  if (isLoading || !data) return <DetailSkeleton />;

  const d: any = data.demanda;
  const actors: Record<string, { id: string; name: string; email: string | null; role: string | null }> =
    (data as any).actors ?? {};
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

  const contactName = resolveContactName(d);
  const isGroupChat = !!d.whatsapp_jid?.endsWith("@g.us");
  const effectiveViaWhatsapp = viaWhatsapp && !!d.whatsapp_jid;

  const handleReply = (target: ReplyTarget) => {
    setReplyTo(target);
    composerRef.current?.focus();
  };

  return (
    <div className="relative flex h-full">
      <div className="flex flex-col min-w-0 flex-1">
        <div className="shrink-0 border-b border-border bg-card p-3 flex items-center gap-2.5">
          <button
            onClick={() => filaSidebar?.setCollapsed(true)}
            title="Recolher fila"
            aria-label="Recolher fila"
            className="hidden sm:grid shrink-0 place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <ContactAvatar url={d.contacts?.avatar_url ?? null} name={contactName} tone="client" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="truncate text-sm font-semibold text-foreground">{contactName}</span>
              {isGroupChat && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide pill-brand">
                  Grupo
                </span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">· {d.protocol}</span>
            </div>
            {d.contacts?.phone && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageCircle className="h-3 w-3" strokeWidth={2.2} /> {d.contacts.phone}
              </div>
            )}
          </div>
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

        <DemandaHistory
          demandaId={id}
          events={data.events}
          description={d.description}
          contactName={contactName}
          contactAvatarUrl={d.contacts?.avatar_url ?? null}
          isGroupChat={isGroupChat}
          nameOf={nameOf}
          roleOf={roleOf}
          isAIOf={(uid) => actorOf(uid)?.role === "agente_ia"}
          onReply={handleReply}
        />

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
                  !effectiveViaWhatsapp ? "bg-secondary text-foreground ring-1 ring-border" : "text-muted-foreground hover:bg-secondary"
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
            {replyTo && (
              <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-md border-l-2 border-l-[var(--pill-amber-fg)] bg-secondary/70 px-2.5 py-1.5">
                <Reply className="mt-0.5 h-3 w-3 shrink-0 text-[var(--pill-amber-fg)]" strokeWidth={2.2} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-[var(--pill-amber-fg)]">{replyTo.author}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{replyTo.content || "(sem texto)"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  title="Cancelar resposta"
                  aria-label="Cancelar resposta"
                  className="shrink-0 text-muted-foreground transition hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
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
                if (e.key === "Escape" && replyTo) {
                  e.preventDefault();
                  setReplyTo(null);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (comment.trim() && !send.isPending) send.mutate();
                }
              }}
              placeholder={
                effectiveViaWhatsapp
                  ? "Escreva a resposta que será enviada ao cliente..."
                  : "Comentário interno (não vai pro cliente)..."
              }
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
                onClick={() => {
                  if (comment.trim() && !send.isPending) send.mutate();
                }}
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

      {!railCollapsed && (
        <aside className="hidden md:flex md:flex-col w-[195px] shrink-0 border-l border-border/80 bg-muted/15 select-none overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-card/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Propriedades</span>
            <button
              onClick={() => setRailCollapsed(true)}
              title="Recolher painel"
              aria-label="Recolher painel"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border/50 text-xs">
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
                    <SelectItem key={p} value={p} className="text-xs capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-2.5 space-y-1">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="h-3 w-3 text-primary/70" strokeWidth={2.2} /> Prazo
              </label>
              <DueDatePicker value={d.due_at ?? null} onChange={(iso) => update.mutate({ due_at: iso })} />
            </div>
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
                      <SelectItem value="none" className="text-xs">
                        — Sem responsável —
                      </SelectItem>
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
