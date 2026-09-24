import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Info, MessageCircle, Smartphone, Users, Webhook } from "lucide-react";
import { toast } from "sonner";
import { setAllowGroupIngest } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/section-ui";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ComingSoon } from "./coming-soon";
import { WhatsappSection } from "./whatsapp-section";
import { WebhooksSection } from "./webhooks-section";

/**
 * Eventos que a plataforma emite pra esta org (definição global =
 * platform_admin — R3). O tenant apenas vê o status desta instância.
 */
const INSTANCE_EVENTS = [
  "MESSAGES_UPSERT",
  "CONNECTION_UPDATE",
  "CONTACTS_UPDATE",
  "GROUPS_UPSERT",
  "GROUP_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
] as const;

/** Ícone (i) com tooltip — enxuga info técnica sem perder o detalhe. */
function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Mais informações"
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Linha única de status técnico (substitui os 3 cards extensos). */
function IntegrationStatusRow() {
  return (
    <div className="card-elevated flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[10px] font-bold text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--pill-green-fg)]" />
        Eventos do webhook ({INSTANCE_EVENTS.length} ativos)
      </span>
      <InfoTip text="Mensagens, atualizações de conexão, contatos e alterações de grupos configurados automaticamente via platform_admin (MESSAGES_UPSERT, CONNECTION_UPDATE, CONTACTS_UPDATE, GROUPS_UPSERT, GROUP_UPDATE, GROUP_PARTICIPANTS_UPDATE)." />
      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[10px] font-bold text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--pill-green-fg)]" />
        Políticas de armazenamento de mídia
      </span>
      <InfoTip text="Bucket privado 'demanda-media' com URL efêmera assinada (1h). Disparo limitado a 3 MB por arquivo/mensagem conforme regras do ambiente." />
    </div>
  );
}

/**
 * Toggle real de ingestão de grupos: persiste em
 * organizations.allow_group_ingest (owner/admin no servidor) e o ingest
 * descarta payloads @g.us com 200 silencioso quando desligado.
 */
function GroupIngestSection({
  orgId,
  orgSlug,
  enabled,
}: {
  orgId: string;
  orgSlug: string;
  enabled: boolean;
}) {
  const qc = useQueryClient();
  const setFn = useServerFn(setAllowGroupIngest);
  const toggle = useMutation({
    mutationFn: (value: boolean) => setFn({ data: { orgId, enabled: value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org", orgSlug] });
      toast.success("Preferência de grupos atualizada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <div className="card-elevated p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Users className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-semibold">Atendimento em Grupos (WhatsApp)</h3>
            <InfoTip text="Quando ativado, mensagens de grupos de WhatsApp entram na fila preservando o nome do participante e associando o título do grupo à demanda. Quando desativado, o sistema ignora payloads de grupos e foca exclusivamente em conversas 1:1." />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Defina se as mensagens recebidas de grupos do WhatsApp (@g.us) devem
            criar e atualizar demandas na fila.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={toggle.isPending}
          onCheckedChange={(v) => toggle.mutate(v)}
          aria-label="Ingestão de mensagens de grupos"
        />
      </div>
    </div>
  );
}

/** Aba Canais & Integrações: conexão Evolution, status compacto, grupos, tokens. */
export function CanaisTab({
  orgId,
  orgSlug,
  origin,
  allowGroupIngest,
}: {
  orgId: string;
  orgSlug: string;
  origin: string;
  allowGroupIngest: boolean;
}) {
  return (
    <>
      <SectionTitle
        icon={Smartphone}
        title="Conexões de WhatsApp & Canais"
        hint="Conexão Evolution, regras de ingestão e tokens de entrada — regra de negócio da org."
      />
      <WhatsappSection orgId={orgId} />
      <IntegrationStatusRow />
      <GroupIngestSection orgId={orgId} orgSlug={orgSlug} enabled={allowGroupIngest} />
      <ComingSoon
        icon={MessageCircle}
        title="Canais adicionais"
        description="Instagram, Telegram, e-mail, portal, API e manual como canais de entrada por organização (enum channel_kind já existe no banco)."
      />
      <SectionTitle
        icon={Webhook}
        title="Webhooks & APIs"
        hint="Endpoint público de ingestão e tokens de entrada com CRUD protegido por assertOrgAdmin."
      />
      <WebhooksSection orgId={orgId} origin={origin} />
      <ComingSoon
        icon={Eye}
        title="Logs de webhooks por token"
        description="Visualização dos payloads recebidos por token pra depuração de integração da organização."
      />
    </>
  );
}