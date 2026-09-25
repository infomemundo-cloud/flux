import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getWhatsappConnection, setWhatsappAutoReply } from "@/lib/whatsapp.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/info-tip";

/**
 * Card 2 (coluna esquerda): Agente de IA & Resposta Automática.
 * O toggle de resposta automática é REAL (já existia — sem regressão);
 * a parte futura (prompt personalizado + qualificação de contatos)
 * aparece como linha slim com badge "Em breve · Plano Pro".
 */
export function AiAgentCard({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getWhatsappConnection);
  const autoFn = useServerFn(setWhatsappAutoReply);
  const qc = useQueryClient();
  const { data: conn } = useQuery({
    queryKey: ["whatsapp-connection", orgId],
    queryFn: () => getFn({ data: { orgId } }),
    retry: false,
  });
  const auto = useMutation({
    mutationFn: (enabled: boolean) => autoFn({ data: { orgId, enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] });
      toast.success("Resposta automática atualizada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="card-elevated space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Agente de IA & Resposta Automática</h3>
            <InfoTip text="A IA utilizará o contexto da organização para aprender de forma passiva, sem necessidade de treinamentos complexos." />
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            O agente inteligente responderá dúvidas frequentes e qualificará contatos automaticamente com base nos dados do seu negócio.
          </p>
        </div>
      </div>

      {/* Toggle REAL de resposta automática (compartilha o cache da conexão) */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <span className="block text-xs font-semibold">Resposta automática no WhatsApp</span>
          <span className="block text-[11px] text-muted-foreground">
            Quando ligado, o agente responde dúvidas simples enquanto a equipe não assume a conversa.
          </span>
        </div>
        <Switch
          checked={!!conn?.auto_reply_enabled}
          disabled={auto.isPending}
          onCheckedChange={(v) => auto.mutate(v)}
          aria-label="Resposta automática por IA"
        />
      </div>

      {/* Parte futura (estrutura-lembrança) */}
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-3 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          Prompt personalizado e qualificação automática de contatos
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Em breve · Plano Pro
        </span>
      </div>
    </div>
  );
}