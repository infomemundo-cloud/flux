import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"; // 👈 Adicionado useQuery
import { useServerFn } from "@tanstack/react-start";
import { Timer, Lock } from "lucide-react"; // 👈 Adicionado Lock
import { toast } from "sonner";
import { updateSlaSettings } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { SLA_HOUR_OPTIONS } from "@/lib/demandas/sla-options";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge"; // 👈 Adicionado Badge
import { getAccountAccess } from "@/lib/billing/account-access"; // 👈 Import Account Access
import { hasFeature } from "@/lib/billing/tier-contracts"; // 👈 Import Helper de Features

/**
 * Card 3 (coluna direita): Prazos de SLA & monitoramento — AUTOSAVE.
 * 
 * FASE 4.7 ITEM 3 (Gate de Features):
 * • Plano 'operacao': customSlaRules = false → Pode ligar/desligar SLA, 
 *   mas NÃO pode alterar as horas (travado no padrão). Select desabilitado.
 * • Planos 'crescimento'/'escala': customSlaRules = true → Controle total.
 * 
 * Toggle e select salvam na hora (padrão de mercado); erro reverte o
 * valor local e avisa com toast. A regra mora no banco
 * (organizations.sla_enabled / sla_max_inactivity_hours) e é a fonte
 * única consumida pelo badge da sidebar e pela página de Alertas.
 */
export function SlaRulesCard({
  orgId,
  orgSlug,
  enabled,
  maxHours,
}: {
  orgId: string;
  orgSlug: string;
  enabled: boolean;
  maxHours: number;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateSlaSettings);
  const accessFn = useServerFn(getAccountAccess); // 👈 Server Fn de Acesso
  
  const [on, setOn] = useState(enabled);
  const [hours, setHours] = useState(maxHours);

  // 👇 NOVA QUERY: Buscar acesso/features do tier atual
  const { data: access } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // 5 min cache
    retry: 0,
  });

  const patch = useMutation({
    mutationFn: (p: { enabled?: boolean; maxInactivityHours?: number }) =>
      updateFn({ data: { orgId, ...p } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org", orgSlug] });
      // Badge da sidebar/nav e página de Alertas refletem a regra na hora.
      qc.invalidateQueries({ queryKey: ["sla-alerts"] });
      toast.success("Configurações de atendimento atualizadas");
    },
    onError: (e) => {
      // Reverte pro valor vigente no servidor (props = fonte da verdade).
      setOn(enabled);
      setHours(maxHours);
      toast.error(friendlyError(e));
    },
  });

  const busy = patch.isPending;

  // 👇 LÓGICA DE GATE: Verifica se o tier atual permite customizar SLA
  const tierCode = access?.tierCode ?? "operacao";
  const canCustomizeSla = hasFeature(tierCode, "customSlaRules");
  const isHoursLocked = !canCustomizeSla;

  return (
    <div className="card-elevated space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Timer className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold">Prazos de Inatividade (SLA)</h3>
              <InfoTip text="O SLA mede o tempo máximo que uma demanda pode ficar sem nenhuma atualização (mensagem ou ação da equipe). Ao ultrapassar o limite, ela é tratada como atrasada em todo o painel." />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Defina o tempo limite para uma demanda ser considerada estourada no painel e nos alertas da equipe.
            </p>
          </div>
        </div>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={(v) => {
            setOn(v);
            patch.mutate({ enabled: v });
          }}
          aria-label="Monitoramento de SLA"
        />
      </div>

      <div className={`space-y-2 transition-opacity ${on ? "" : "pointer-events-none opacity-50"}`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Tempo limite sem atualização
          </label>
          
          {/* 👇 Badge de Bloqueio se tier não suportar customização */}
          {isHoursLocked && (
            <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider border-amber-500/30 text-amber-500 bg-amber-500/10 gap-1">
              <Lock className="h-2.5 w-2.5" />
              Pro
            </Badge>
          )}
        </div>

        <Select
          value={String(hours)}
          disabled={busy || isHoursLocked} // 👈 Desabilita se locked
          onValueChange={(v) => {
            if (isHoursLocked) {
              toast.info("Faça upgrade de plano para personalizar o tempo do SLA.", {
                description: "Vá em Configurações > Financeiro para ver os planos disponíveis.",
              });
              return;
            }
            const h = Number(v);
            setHours(h);
            patch.mutate({ maxInactivityHours: h });
          }}
        >
          <SelectTrigger className={`h-9 w-full max-w-[220px] text-sm ${isHoursLocked ? "opacity-60 bg-muted/20" : ""}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SLA_HOUR_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <p className="text-[11px] text-muted-foreground">
          {isHoursLocked
            ? "Personalização de tempo disponível nos planos Crescimento e Escala. Atualmente usando o padrão de 24h."
            : "Ao ultrapassar este limite, a demanda atualiza o contador de alertas da equipe e entra na página de Alertas de SLA."
          }
        </p>
      </div>
    </div>
  );
}
