import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Sparkles, Lock } from "lucide-react"; // 👈 Adicionado Lock
import { toast } from "sonner";
import { getWhatsappConnection, setWhatsappAutoReply } from "@/lib/whatsapp.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge"; // 👈 Adicionado Badge
import { getAccountAccess } from "@/lib/billing/account-access"; // 👈 Import Account Access
import { hasFeature } from "@/lib/billing/tier-contracts"; // 👈 Import Helper de Features

/**
 * Card 2 (coluna esquerda): Agente de IA & Resposta Automática.
 * 
 * FASE 4.7 ITEM 3 (Gate de Features):
 * • O toggle de resposta automática agora respeita o tier-contracts.ts.
 * • Plano 'operacao': aiAgentEnabled = false → Switch desabilitado + Badge Upgrade.
 * • Planos 'crescimento'/'escala': aiAgentEnabled = true → Funcionamento normal.
 * 
 * O toggle de resposta automática é REAL (já existia — sem regressão);
 * a parte futura (prompt personalizado + qualificação de contatos)
 * aparece como linha slim com badge "Em breve · Plano Pro".
 */
export function AiAgentCard({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getWhatsappConnection);
  const autoFn = useServerFn(setWhatsappAutoReply);
  const accessFn = useServerFn(getAccountAccess); // 👈 Server Fn de Acesso
  const qc = useQueryClient();

  // Query de Conexão WhatsApp (existente)
  const { data: conn } = useQuery({
    queryKey: ["whatsapp-connection", orgId],
    queryFn: () => getFn({ data: { orgId } }),
    retry: false,
  });

  // 👇 NOVA QUERY: Buscar acesso/features do tier atual
  const { data: access } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // 5 min cache
    retry: 0,
  });

  const auto = useMutation({
    mutationFn: (enabled: boolean) => autoFn({ data: { orgId, enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] });
      toast.success("Resposta automática atualizada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  // 👇 LÓGICA DE GATE: Verifica se o tier atual permite IA
  // Se access ainda não carregou, assumimos false (segurança) ou true (otimismo)?
  // Melhor assumir false até carregar para evitar flash de conteúdo liberado indevidamente.
  const tierCode = access?.tierCode ?? "operacao";
  const isAiEnabled = hasFeature(tierCode, "aiAgentEnabled");
  const isLocked = !isAiEnabled;

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
            {/* 👇 Badge de Bloqueio se tier não suportar */}
            {isLocked && (
              <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider border-amber-500/30 text-amber-500 bg-amber-500/10 gap-1">
                <Lock className="h-2.5 w-2.5" />
                Pro
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isLocked 
              ? "Recurso disponível nos planos Crescimento e Escala. Faça upgrade para ativar respostas automáticas inteligentes."
              : "O agente inteligente responderá dúvidas frequentes e qualificará contatos automaticamente com base nos dados do seu negócio."
            }
          </p>
        </div>
      </div>

      {/* Toggle REAL de resposta automática (compartilha o cache da conexão) */}
      <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
        isLocked 
          ? "border-border/50 bg-muted/20 opacity-60" 
          : "border-border bg-card"
      }`}>
        <div className="min-w-0">
          <span className="block text-xs font-semibold">Resposta automática no WhatsApp</span>
          <span className="block text-[11px] text-muted-foreground">
            {isLocked
              ? "Desbloqueie fazendo upgrade para o plano Crescimento."
              : "Quando ligado, o agente responde dúvidas simples enquanto a equipe não assume a conversa."
            }
          </span>
        </div>
        <Switch
          checked={isLocked ? false : !!conn?.auto_reply_enabled} // 👈 Força unchecked se locked
          disabled={auto.isPending || isLocked} // 👈 Desabilita se locked
          onCheckedChange={(v) => {
            if (isLocked) {
              toast.info("Faça upgrade de plano para usar esta funcionalidade.", {
                description: "Vá em Configurações > Financeiro para ver os planos disponíveis.",
              });
              return;
            }
            auto.mutate(v);
          }}
          aria-label="Resposta automática por IA"
        />
      </div>

      {/* Parte futura (estrutura-lembrança) - Mantida igual */}
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
