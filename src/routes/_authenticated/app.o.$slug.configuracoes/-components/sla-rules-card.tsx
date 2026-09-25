import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Timer } from "lucide-react";
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

/**
 * Card 3 (coluna direita): Prazos de SLA & monitoramento — AUTOSAVE.
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
  const [on, setOn] = useState(enabled);
  const [hours, setHours] = useState(maxHours);

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
        <label className="text-xs font-medium text-muted-foreground">
          Tempo limite sem atualização
        </label>
        <Select
          value={String(hours)}
          disabled={busy}
          onValueChange={(v) => {
            const h = Number(v);
            setHours(h);
            patch.mutate({ maxInactivityHours: h });
          }}
        >
          <SelectTrigger className="h-9 w-full max-w-[220px] text-sm">
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
          Ao ultrapassar este limite, a demanda atualiza o contador de alertas da equipe e entra na página de Alertas de SLA.
        </p>
      </div>
    </div>
  );
}