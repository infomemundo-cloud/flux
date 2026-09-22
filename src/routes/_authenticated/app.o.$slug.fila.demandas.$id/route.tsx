import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { getDemanda, updateDemanda, addComment, deleteDemanda } from "@/lib/demandas/demandas.functions";
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
 */
function DemandaDetail() {
  const { slug, id } = useParams({ from: "/_authenticated/app/o/$slug/fila/demandas/$id" });
  const navigate = useNavigate();
  const filaSidebar = useFilaSidebar();
  const getFn = useServerFn(getDemanda);
  const updateFn = useServerFn(updateDemanda);
  const commentFn = useServerFn(addComment);
  const deleteFn = useServerFn(deleteDemanda);
  const updateContactFn = useServerFn(updateContact);
  const orgFn = useServerFn(getOrgBySlug);
  const qc = useQueryClient();
  const waFn = useServerFn(sendWhatsAppMessage);
  const mediaFn = useServerFn(sendMediaMessage);
  const [comment, setComment] = useState("");
  const [viaWhatsapp, setViaWhatsapp] = useState(true);
  const [railCollapsed, setRailCollapsed] = useState(false);
  // Reply com citação (estilo WhatsApp): mensagem sendo respondida enquanto o
  // composer está aberto. null = resposta normal. O snapshot completo é
  // calculado pelo DemandaHistory (que tem author/content/metadata em mãos).
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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

  // CRM leve do contato (Fase 2): notas permanentes + etiquetas + empresa.
  // O contactId vem da demanda carregada; sem contato, a mutation erroa com
  // mensagem clara (o trilho já esconde os controles nesse caso).
  const saveContact = useMutation({
    mutationFn: (patch: { notes?: string | null; tags?: ContactTag[]; company?: string | null }) => {
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
              ? { event_id: replyTo.event_id, author: replyTo.author, content: replyTo.content, kind: replyTo.kind }
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
      qc.invalidateQueries({ queryKey: ["demanda", id] });
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
          events={data.events}
          description={d.description}
          contactName={contactName}
          contactAvatarUrl={d.contacts?.avatar_url ?? null}
          isGroupChat={isGroupChat}
          nameOf={nameOf}
          roleOf={roleOf}
          isAIOf={(uid) => actorOf(uid)?.role === "agente_ia"}
          onReply={handleReply}
          onRetryMedia={() => qc.invalidateQueries({ queryKey: ["demanda", id] })}
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