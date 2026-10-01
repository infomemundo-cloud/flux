import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDemanda,
  listOlderEvents,
  updateDemanda,
  addComment,
  deleteDemanda,
  resolveEventActor,
  signEventMedia,
} from "@/lib/demandas/demandas.functions";
import { updateContact, type ContactTag } from "@/lib/contacts.functions";
import { sendWhatsAppMessage, sendMediaMessage } from "@/lib/whatsapp.functions";
import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { toast } from "sonner";
import { DetailSkeleton } from "@/components/skeletons";
import { friendlyError } from "@/lib/friendly-error";
import { useFilaSidebar } from "@/lib/demandas/fila-sidebar-context";
import { resolveContactName } from "@/lib/demandas/resolve-contact-name";
import { DemandaHeader } from "./-components/DemandaHeader";
import { DemandaHistory, type ReplyTarget } from "./-components/DemandaHistory";
import { DemandaComposer, type PendingAttachment } from "./-components/DemandaComposer";
import { PropertiesRail } from "./-components/PropertiesRail";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/o/$slug/fila/demandas/$id")({
  head: () => ({ meta: [{ title: "Demanda — Fluxo" }] }),
  component: DemandaDetail,
});

const MANAGER_ROLES = new Set(["owner", "admin", "gerente"]);
const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Admin",
  gerente: "Gerente",
  operador: "Operador",
  agente_ia: "Agente de IA",
};

/** File → base64 puro (sem data URI) no navegador, em chunks seguros. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/**
 * Route orquestradora: busca de dados, mutations e composição das quatro
 * áreas visuais (Header / History / Composer / Rail), que moram em
 * -components/. Nenhum JSX de detalhe visual vive aqui.
 *
 * PAGINAÇÃO DO HISTÓRICO (padrão WhatsApp Web):
 * - Estado local `events` inicializado pelo getDemanda (últimas 50 msgs);
 * - `olderCursor` controla se tem mais antigos pra carregar;
 * - Realtime APPEND-only: nova mensagem vai pro fim de `events` sem
 *   invalidar a query (evita re-assinar 50 mídias a cada mensagem nova);
 * - loadMore() busca lote anterior via listOlderEvents e PREPEND em `events`
 *   + merge de atores; DemandaHistory ajusta scrollTop via âncora.
 */
function DemandaDetail() {
  const { slug, id } = useParams({ from: "/_authenticated/app/o/$slug/fila/demandas/$id" });
  const navigate = useNavigate();
  const filaSidebar = useFilaSidebar();
  const qc = useQueryClient();

  // Server functions (todas juntas no topo, agrupadas por domínio)
  const getFn = useServerFn(getDemanda);
  const olderFn = useServerFn(listOlderEvents);
  const updateFn = useServerFn(updateDemanda);
  const commentFn = useServerFn(addComment);
  const deleteFn = useServerFn(deleteDemanda);
  const updateContactFn = useServerFn(updateContact);
  const orgFn = useServerFn(getOrgBySlug);
  const opsFn = useServerFn(listOperators);
  const waFn = useServerFn(sendWhatsAppMessage);
  const mediaFn = useServerFn(sendMediaMessage);
  const actorFn = useServerFn(resolveEventActor);
  const signMediaFn = useServerFn(signEventMedia);

  // Estado de UI do composer + trilho
  const [comment, setComment] = useState("");
  const [viaWhatsapp, setViaWhatsapp] = useState(true);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Estado de paginação do histórico (sobrevive a Realtime appends).
  const [events, setEvents] = useState<any[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Atores acumulados: cada lote (initial + older) traz seus atores; merge
  // aqui pra nameOf/roleOf cobrirem tudo que já foi carregado.
  const [actors, setActors] = useState<
    Record<string, { id: string; name: string; email: string | null; role: string | null }>
  >({});
  // Sinaliza se os eventos foram inicializados (pra distinguir "query em
  // loading" de "query ok mas events vazio").
  const [eventsInitialized, setEventsInitialized] = useState(false);
  // Id da demanda atual — reset de estado quando muda (navegação entre demandas).
  const currentIdRef = useRef<string>(id);

  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });
  const canDelete = org?.role === "owner" || org?.role === "admin";
  const isManager = !!org && MANAGER_ROLES.has(org.role);
  const { data: operators } = useQuery({
    queryKey: ["operators", org?.id],
    enabled: !!org?.id && isManager,
    queryFn: () => opsFn({ data: { orgId: org!.id } }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["demanda", id],
    queryFn: () => getFn({ data: { id } }),
    // Poll de fallback: 30s só pra rede de segurança (frescor imediato vem
    // do Realtime + append manual abaixo). Sem isso, queda silenciosa do
    // canal faria o detalhe ficar desatualizado.
    refetchInterval: 30_000,
  });

  // Inicializa estado de paginação quando o getDemanda resolve (ou quando
  // o id muda — reset completo pra não misturar eventos de demandas distintas).
  useEffect(() => {
    if (!data) return;
    if (currentIdRef.current !== id) {
      currentIdRef.current = id;
      setEventsInitialized(false);
    }
    setEvents(data.events ?? []);
    setOlderCursor(data.olderCursor ?? null);
    setActors((data.actors ?? {}) as typeof actors);
    setEventsInitialized(true);
  }, [data, id]);

  // Realtime APPEND-only: nova mensagem/evento na demanda vai pro fim de
  // `events` sem invalidar a query (não re-assina 50 mídias, não re-resolve
  // atores, não reseta o scroll). Canal específico pra esta demanda
  // (diferente do org-wide, pra não conflitar com invalidações de lista).
  useEffect(() => {
    if (!data?.demanda?.org_id) return;
    const orgId = data.demanda.org_id;
    const channel = supabase
      .channel(`demanda-live-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "demanda_events",
          filter: `demanda_id=eq.${id}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow) return;
          // Dedup por id (Realtime pode entregar evento que já está no estado
          // inicial do getDemanda, em race condition de primeiro load).
          setEvents((prev) => {
            if (prev.some((e) => e.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
          // Merge do ator (se novo) via server function (evita import de
          // client.server em rota client).
          const uid = newRow.actor_id;
          if (uid) {
            setActors((prev) => {
              if (prev[uid]) return prev;
              // Resolve assíncrono via server function.
              actorFn({ data: { orgId, userId: uid } })
                .then((actor) => {
                  setActors((p) => ({ ...p, [uid]: actor }));
                })
                .catch((e) => {
                  console.error("[realtime] actor resolve failed", e);
                });
              return prev;
            });
          }
          // Assina mídia do evento novo via server function (evita import
          // de media-storage em rota client).
          if (newRow.media_url) {
            signMediaFn({
              data: {
                mediaUrl: newRow.media_url,
                thumbUrl: newRow.metadata?.media_thumb ?? null,
              },
            })
              .then(({ url, thumb }) => {
                setEvents((prev) =>
                  prev.map((e) =>
                    e.id === newRow.id
                      ? { ...e, media_url_signed: url, media_thumb_signed: thumb }
                      : e,
                  ),
                );
              })
              .catch((e) => {
                console.error("[realtime] sign media failed", e);
              });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data?.demanda?.org_id]);

  // Carrega lote anterior (scroll pra cima).
  const loadMore = useCallback(async () => {
    if (!olderCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await olderFn({
        data: { demandaId: id, before: olderCursor },
      });
      setEvents((prev) => [...(res.events ?? []), ...prev]);
      setOlderCursor(res.olderCursor ?? null);
      if (res.actors) {
        setActors((prev) => ({ ...prev, ...res.actors }));
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setLoadingMore(false);
    }
  }, [olderCursor, loadingMore, olderFn, id]);

  const update = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id, ...patch } }),
    onSuccess: () => {
      // Só invalida dados da demanda (estado/prioridade/etc), não o histórico
      // (que é mantido localmente via Realtime).
      qc.invalidateQueries({ queryKey: ["demanda", id] });
      qc.invalidateQueries({ queryKey: ["demandas"] });
      toast.success("Atualizado");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  // CRM leve do contato (Fase 2): notas permanentes + etiquetas + empresa.
  // O contactId vem da demanda carregada; sem contato, a mutation erroa com
  // mensagem clara (o trilho já esconde os controles nesse caso).
  const saveContact = useMutation({
    mutationFn: (patch: {
      notes?: string | null;
      tags?: ContactTag[];
      company?: string | null;
      email?: string | null;
    }) => {
      const cid = (data?.demanda as any)?.contact_id;
      if (!cid) throw new Error("Demanda sem contato vinculado.");
      return updateContactFn({ data: { contactId: cid, ...patch } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demanda", id] });
      toast.success("Contato atualizado");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const send = useMutation({
    mutationFn: async () => {
      const d = data?.demanda as any;
      const goViaWhatsapp = viaWhatsapp && !!d?.whatsapp_jid;
      // Caminho 1: comentário interno (sempre sem anexo — anexo só no WhatsApp).
      if (!goViaWhatsapp) {
        if (!comment.trim()) throw new Error("Escreva algo antes de enviar.");
        return commentFn({
          data: {
            demandaId: id,
            orgId: d.org_id,
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
      }
      // Caminho 2: texto puro no WhatsApp (sem anexo).
      if (!attachment) {
        if (!comment.trim()) throw new Error("Escreva algo antes de enviar.");
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
      // Caminho 3: WhatsApp COM anexo (inclui áudio gravado no composer).
      // Chamada DIRETA da server function via useServerFn (navegador → endpoint
      // serverFn com cookies): é o mesmo caminho de auth de todas as outras
      // mutations do projeto. O arquivo vai como base64 no input validado.
      setIsUploading(true);
      try {
        const fileBase64 = await toBase64(attachment.file);
        const res = await mediaFn({
          data: {
            demandId: id,
            orgId: d.org_id,
            caption: comment.trim(),
            role: "agent" as const,
            fileName: attachment.file.name,
            mimeType: attachment.file.type || "application/octet-stream",
            fileBase64,
          },
        });
        if (res?.mediaFailedReason) {
          toast.warning(
            `Mensagem enviada, mas o anexo não pôde ser armazenado (${res.mediaFailedReason})`,
          );
        }
        return res;
      } finally {
        setIsUploading(false);
      }
    },
    onSuccess: () => {
      setComment("");
      setReplyTo(null);
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      setAttachment(null);
      // Não invalida a query: o Realtime vai appendar a mensagem nova no
      // estado local. Invalidar resetaria o scroll e re-assinaria 50 mídias.
      qc.invalidateQueries({ queryKey: ["demandas"] });
    },
    onError: (e) => {
      toast.error(friendlyError(e));
      // Anexo é MANTIDO no composer em caso de erro — a pessoa não perde o que selecionou.
    },
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

  if (isLoading || !data || !eventsInitialized) return <DetailSkeleton />;
  const d: any = data.demanda;
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
  const handleReply = (target: ReplyTarget) => {
    setReplyTo(target);
    composerRef.current?.focus();
  };
  const handleAttach = (file: File) => {
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "document";
    // Áudio ganha object URL também: é o que permite o player de preview
    // no card de anexo do composer (revogado no remove e no success).
    const previewUrl = kind === "image" || kind === "audio" ? URL.createObjectURL(file) : null;
    setAttachment({ file, previewUrl, kind });
  };
  const handleRemoveAttachment = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };
  const filaCollapsed = filaSidebar?.collapsed ?? false;
  const handleToggleFila = () => filaSidebar?.setCollapsed(!filaCollapsed);

  return (
    <div className="relative flex h-full">
      <div className="flex flex-col min-w-0 flex-1">
        <DemandaHeader
          contactName={contactName}
          contactAvatarUrl={d.contacts?.avatar_url ?? null}
          phone={d.contacts?.phone ?? null}
          isGroupChat={isGroupChat}
          filaCollapsed={filaCollapsed}
          onToggleFila={handleToggleFila}
          railCollapsed={railCollapsed}
          onExpandRail={() => setRailCollapsed(false)}
          onClose={() => navigate({ to: "/app/o/$slug/fila", params: { slug } })}
        />
        <DemandaHistory
          demandaId={id}
          events={events}
          description={d.description}
          contactName={contactName}
          contactAvatarUrl={d.contacts?.avatar_url ?? null}
          isGroupChat={isGroupChat}
          nameOf={nameOf}
          roleOf={roleOf}
          isAIOf={(uid) => actorOf(uid)?.role === "agente_ia"}
          onReply={handleReply}
          onRetryMedia={() => qc.invalidateQueries({ queryKey: ["demanda", id] })}
          olderCursor={olderCursor}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
        />
        <DemandaComposer
          orgId={org?.id ?? null}
          hasWhatsapp={!!d.whatsapp_jid}
          viaWhatsapp={viaWhatsapp}
          onViaWhatsappChange={setViaWhatsapp}
          comment={comment}
          onCommentChange={setComment}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={() => send.mutate()}
          onAttach={handleAttach}
          attachment={attachment}
          onRemoveAttachment={handleRemoveAttachment}
          isPending={send.isPending}
          isUploading={isUploading}
          textareaRef={composerRef}
        />
      </div>
      {!railCollapsed && (
        <PropertiesRail
          demanda={d}
          onUpdate={(patch) => update.mutate(patch)}
          onCollapseRail={() => setRailCollapsed(true)}
          orgUserId={org?.userId}
          isManager={isManager}
          operators={operators ?? []}
          nameOf={nameOf}
          canDelete={canDelete}
          onDelete={() => remove.mutate()}
          deletePending={remove.isPending}
          onSaveContact={(patch) => saveContact.mutate(patch)}
          contactSaving={saveContact.isPending}
          onOpenDemanda={(did) =>
            navigate({ to: "/app/o/$slug/fila/demandas/$id", params: { slug, id: did } })
          }
        />
      )}
    </div>
  );
}
