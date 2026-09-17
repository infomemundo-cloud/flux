import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { getDemanda, updateDemanda, addComment, deleteDemanda } from "@/lib/demandas/demandas.functions";
import { sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import { getOrgBySlug, listOperators } from "@/lib/orgs.functions";
import { toast } from "sonner";
import { DetailSkeleton } from "@/components/skeletons";
import { friendlyError } from "@/lib/friendly-error";
import { useFilaSidebar } from "@/lib/demandas/fila-sidebar-context";
import { resolveContactName } from "@/lib/demandas/resolve-contact-name";
import { DemandaHeader } from "./-components/DemandaHeader";
import { DemandaHistory, type ReplyTarget } from "./-components/DemandaHistory";
import { DemandaComposer } from "./-components/DemandaComposer";
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
  const orgFn = useServerFn(getOrgBySlug);
  const qc = useQueryClient();
  const waFn = useServerFn(sendWhatsAppMessage);
  const [comment, setComment] = useState("");
  const [viaWhatsapp, setViaWhatsapp] = useState(true);
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

  const handleReply = (target: ReplyTarget) => {
    setReplyTo(target);
    composerRef.current?.focus();
  };

  return (
    <div className="relative flex h-full">
      <div className="flex flex-col min-w-0 flex-1">
        <DemandaHeader
          slug={slug}
          contactName={contactName}
          contactAvatarUrl={d.contacts?.avatar_url ?? null}
          phone={d.contacts?.phone ?? null}
          protocol={d.protocol}
          isGroupChat={isGroupChat}
          onCollapseFila={() => filaSidebar?.setCollapsed(true)}
          railCollapsed={railCollapsed}
          onExpandRail={() => setRailCollapsed(false)}
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
        />

        <DemandaComposer
          hasWhatsapp={!!d.whatsapp_jid}
          viaWhatsapp={viaWhatsapp}
          onViaWhatsappChange={setViaWhatsapp}
          comment={comment}
          onCommentChange={setComment}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={() => send.mutate()}
          isPending={send.isPending}
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
        />
      )}
    </div>
  );
}
