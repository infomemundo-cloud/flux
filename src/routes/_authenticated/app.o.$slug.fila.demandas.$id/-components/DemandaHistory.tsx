import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronUp,
  Flag,
  GitBranch,
  Inbox,
  Loader2,
  MessageCircle,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatRelative, STATE_LABEL } from "@/components/demandas-ui";
import { MessageBubble, type BubbleMedia, type QuotedRef } from "./MessageBubble";
import { SystemLine } from "./SystemLine";
import { TeamAvatar } from "./TeamAvatar";
import { ContactAvatar } from "@/components/contact-avatar";

/**
 * Alvo de reply (citação) calculado pelo DemandaHistory a partir do evento.
 * O snapshot completo (author/content/kind) é passado pro composer, que grava
 * no metadata do comentário ou envia como quoted na mensagem do WhatsApp.
 */
export type ReplyTarget = {
  event_id: string;
  author: string;
  content: string;
  kind: string;
  message_id?: string | null;
  from_me?: boolean;
  participant?: string | null;
};

type DemandaHistoryProps = {
  demandaId: string;
  events: any[];
  description: string | null;
  contactName: string;
  contactAvatarUrl: string | null;
  isGroupChat: boolean;
  nameOf: (uid?: string | null, fallback?: string) => string;
  roleOf: (uid?: string | null) => string | null;
  isAIOf: (uid?: string | null) => boolean;
  onReply: (target: ReplyTarget) => void;
  onRetryMedia: () => void;
  /** Cursor do evento mais antigo já carregado (null = fim do histórico). */
  olderCursor: string | null;
  /** Disparado pelo sentinel quando o usuário rola até o topo. */
  onLoadMore: () => void;
  /** True enquanto o lote anterior está sendo buscado. */
  loadingMore: boolean;
};

/**
 * Ícone + texto de cada evento de sistema. O SystemLine é apresentacional
 * (recebe icon/children/when prontos), então a composição de linguagem
 * ("Fulano mudou o estado de X para Y") vive aqui, junto dos dados.
 */
function systemLineFor(
  e: any,
  nameOf: (uid?: string | null, fallback?: string) => string,
): { icon: LucideIcon; text: string } | null {
  const actor = nameOf(e.actor_id, "Sistema");
  const stateLabel = (v: any) => (v ? ((STATE_LABEL as Record<string, string>)[v] ?? v) : "—");
  switch (e.kind) {
    case "created":
      return { icon: Inbox, text: `Demanda criada por ${actor}` };
    case "state_changed":
      return {
        icon: GitBranch,
        text: `${actor} mudou o estado de ${stateLabel(e.from_value)} para ${stateLabel(e.to_value)}`,
      };
    case "assigned": {
      const from = e.from_value ? nameOf(e.from_value) : null;
      const to = e.to_value ? nameOf(e.to_value) : null;
      if (to && from) return { icon: UserCog, text: `Responsável alterado de ${from} para ${to}` };
      if (to) return { icon: UserCog, text: `Atribuída a ${to}` };
      return { icon: UserCog, text: `Responsável removido${from ? ` (${from})` : ""}` };
    }
    case "priority_changed":
      return {
        icon: Flag,
        text: `${actor} mudou a prioridade de ${e.from_value ?? "—"} para ${e.to_value ?? "—"}`,
      };
    case "due_updated":
      return { icon: CalendarClock, text: `${actor} atualizou o prazo` };
    case "closed":
      return { icon: CheckCircle2, text: `Demanda concluída${e.actor_id ? ` por ${actor}` : ""}` };
    default:
      return null;
  }
}

/**
 * Histórico da conversa com PAGINAÇÃO cursor-based (padrão WhatsApp Web):
 * - Renderiza a janela atual (últimas 20 mensagens + lotes anteriores
 *   carregados via onLoadMore);
 * - Pill clicável no topo "↓ Mensagens anteriores" quando hasMore (affordance
 *   de descoberta além do sentinel automático);
 * - Sentinel no topo (IntersectionObserver) dispara onLoadMore quando o
 *   usuário rola até lá;
 * - Âncora de scroll: ao prepend, ajusta scrollTop pelo delta de altura
 *   (histórico cresce pra cima sem pular a tela — o usuário continua
 *   vendo a mesma mensagem que estava olhando);
 * - Auto-scroll pro fim: só quando chega evento novo NO FINAL (append)
 *   e o usuário estava pinned (tolerância 64px). ResizeObserver re-pina
 *   quando mídia carrega (corrige bug de imagem fora da dobra).
 *
 * GRUPOS: cada bolha message_in mostra QUEM mandou (metadata.participant_name
 * gravado no ingest), com fallback pro nome do contato/grupo em eventos
 * antigos; 1:1 e demais kinds: regra anterior intacta.
 */
export function DemandaHistory({
  events,
  description,
  contactName,
  contactAvatarUrl,
  isGroupChat,
  nameOf,
  roleOf,
  isAIOf,
  onReply,
  onRetryMedia,
  olderCursor,
  onLoadMore,
  loadingMore,
}: DemandaHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  // "Pinned no fundo": usuário está no fim da conversa (tolerância 64px).
  const pinnedRef = useRef(true);
  // Guarda o scrollHeight ANTES do prepend pra ajustar scrollTop depois.
  const prevScrollHeightRef = useRef(0);
  // Flag: foi o primeiro load? (não queremos auto-scroll no primeiro load
  // se o usuário chegou via back navigation — o scrollRestoration do
  // Router cuida disso).
  const [mounted, setMounted] = useState(false);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  }

  // Auto-scroll quando chega evento novo NO FINAL (append por Realtime).
  // Detecta append: events.length cresceu E o último evento mudou de id.
  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      lastCountRef.current = events.length;
      // Primeiro load: scroll pro fim pra mostrar as últimas mensagens
      // (padrão WhatsApp Web — nunca abre no topo da conversa).
      scrollToBottom();
      return;
    }
    if (events.length > lastCountRef.current) {
      // Se pinned, rola pro fim (nova mensagem chegou e usuário estava
      // olhando o fim). Se não pinned (usuário lendo histórico), não
      // faz nada — a mensagem nova entra silenciosamente no fim.
      if (pinnedRef.current) scrollToBottom();
    }
    lastCountRef.current = events.length;
  }, [events, mounted]);

  // Mídia (e qualquer conteúdo assíncrono) muda a altura depois do load:
  // ResizeObserver no conteúdo re-pina ao fundo se estávamos lá.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // Âncora de scroll: após prepend (events.length menor que o esperado),
  // ajusta scrollTop pelo delta pra manter a posição visual do usuário.
  // Detecta prepend: events.length cresceu mas o último id é o mesmo
  // (novo evento entrou NO TOPO, não no fim).
  const prevLastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !mounted) {
      prevLastIdRef.current = events.length > 0 ? events[events.length - 1]?.id : null;
      prevScrollHeightRef.current = el?.scrollHeight ?? 0;
      return;
    }
    const lastId = events.length > 0 ? events[events.length - 1]?.id : null;
    const currentScrollHeight = el.scrollHeight;
    // Se o último id é o mesmo mas a altura cresceu, foi prepend no topo.
    if (lastId && lastId === prevLastIdRef.current && currentScrollHeight > prevScrollHeightRef.current) {
      const delta = currentScrollHeight - prevScrollHeightRef.current;
      el.scrollTop += delta;
    }
    prevLastIdRef.current = lastId;
    prevScrollHeightRef.current = currentScrollHeight;
  }, [events, mounted]);

  // Sentinel: quando entra na viewport, dispara onLoadMore (carregar mais antigos).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scroller = scrollRef.current;
    if (!sentinel || !scroller || !olderCursor || loadingMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLoadMore();
        }
      },
      { root: scroller, threshold: 0.1 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [olderCursor, loadingMore, onLoadMore]);

  const avatarFor = (uid?: string | null, isClient?: boolean): ReactNode => {
    if (isClient) return <ContactAvatar url={contactAvatarUrl} name={contactName} size="sm" tone="client" />;
    return <TeamAvatar name={nameOf(uid)} isAI={isAIOf(uid)} />;
  };

  // Autoria em grupos: bolha message_in usa o participant_name do metadata
  // (quem realmente falou); fallback pro nome do contato em eventos antigos
  // (sem participant_name). Fora de grupo, expressão IDÊNTICA à anterior.
  const authorFor = (e: any): string => {
    if (e.kind === "message_in" && isGroupChat) {
      return (e.metadata?.participant_name as string | null) ?? contactName;
    }
    const isClient = e.kind === "message_in";
    return nameOf(e.actor_id, isClient ? contactName : "Sistema");
  };

  const hasMore = olderCursor !== null;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3"
    >
      <div ref={contentRef} className="space-y-1">
        {/* Pill clicável + indicador de carregamento/fim do histórico */}
        <div ref={sentinelRef} className="flex items-center justify-center py-3 min-h-[40px]">
          {loadingMore && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando mensagens anteriores…
            </div>
          )}
          {!loadingMore && hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/50 px-3 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              <ChevronUp className="h-3 w-3" />
              Carregar mensagens anteriores
            </button>
          )}
          {!hasMore && events.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Início da conversa
            </div>
          )}
        </div>

        {description && (
          <div className="ml-10 rounded-lg border border-dashed border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            {description}
          </div>
        )}
        {events.map((e: any) => {
          if (e.kind === "message_in" || e.kind === "message_out" || e.kind === "commented") {
            const isClient = e.kind === "message_in";
            const isInternal = e.kind === "commented";
            const isOutgoing = e.kind === "message_out";
            const quoted = e.metadata?.quoted as QuotedRef | null;
            const media: BubbleMedia | null = e.media_url
              ? {
                  mediaKind: e.metadata?.media_kind ?? null,
                  mimeType: e.media_type ?? null,
                  url: e.media_url_signed ?? null,
                  fileName: e.file_name ?? null,
                  failedReason: e.metadata?.media_failed ?? null,
                  seconds: e.metadata?.media_seconds ?? null,
                  bytes: e.metadata?.media_bytes ?? null,
                  thumbUrl: e.media_thumb_signed ?? null,
                }
              : null;
            return (
              <MessageBubble
                key={e.id}
                avatar={avatarFor(e.actor_id, isClient)}
                author={authorFor(e)}
                authorRole={roleOf(e.actor_id)}
                rolePillClass={isAIOf(e.actor_id) ? "pill-violet" : isClient ? "pill-green" : "pill-brand"}
                isClient={isClient}
                isOutgoing={isOutgoing}
                isInternal={isInternal}
                when={formatRelative(e.created_at)}
                content={e.content}
                quoted={quoted}
                media={media}
                onReply={() =>
                  onReply({
                    event_id: e.id,
                    author: authorFor(e),
                    content: e.content ?? "[mídia]",
                    kind: e.kind,
                    message_id: e.metadata?.message_id,
                    from_me: isOutgoing,
                    participant: e.metadata?.participant_name ?? null,
                  })
                }
                onRetryMedia={onRetryMedia}
              />
            );
          }
          const line = systemLineFor(e, nameOf);
          if (!line) return null;
          const Icon = line.icon;
          // Recuo próprio (pl-6) pra linha de sistema não ficar colada na
          // borda da coluna: o ícone alinha sob o conteúdo dos balões.
          return (
            <div key={e.id} className="pl-6 pr-2 py-0.5">
              <SystemLine icon={Icon} when={formatRelative(e.created_at)}>
                {line.text}
              </SystemLine>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MessageCircle className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="text-sm font-semibold text-foreground">Nenhuma mensagem ainda</div>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Envie uma mensagem ou espere o cliente entrar em contato.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
