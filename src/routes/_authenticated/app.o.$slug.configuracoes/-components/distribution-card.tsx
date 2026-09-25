import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { updateAutoAssignSettings } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { ASSIGNMENT_MODES, type AssignmentMode } from "@/lib/demandas/assignment-options";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/info-tip";

/**
 * Card de Distribuição Automática (coluna esquerda da aba Atendimento).
 * REAL: switch + modo salvam na hora via updateAutoAssignSettings
 * (autosave com revert em erro, mesmo padrão do SlaRulesCard).
 * Linguagem de gestor; os modos vêm da fonte única assignment-options.ts.
 * Com o toggle desligado, os cartões de modo ficam ghosted (visíveis,
 * inativos) — o gestor vê o que existe sem promessa falsa.
 */
export function DistributionCard({
  orgId,
  orgSlug,
  enabled,
  mode,
}: {
  orgId: string;
  orgSlug: string;
  enabled: boolean;
  mode: AssignmentMode;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateAutoAssignSettings);
  const [on, setOn] = useState(enabled);
  const [currentMode, setCurrentMode] = useState<AssignmentMode>(mode);

  const patch = useMutation({
    mutationFn: (p: { enabled?: boolean; mode?: AssignmentMode }) =>
      updateFn({ data: { orgId, ...p } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org", orgSlug] });
      toast.success("Distribuição automática atualizada");
    },
    onError: (e) => {
      // Reverte pro valor vigente no servidor (props = fonte da verdade).
      setOn(enabled);
      setCurrentMode(mode);
      toast.error(friendlyError(e));
    },
  });

  const busy = patch.isPending;

  return (
    <div className="card-elevated space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Shuffle className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold">Distribuição Automática de Demandas</h3>
              <InfoTip text="Quando ativado, cada novo chamado recebido é atribuído automaticamente a um operador da equipe, sem necessidade de distribuição manual." />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Atribua novos chamados do WhatsApp automaticamente entre os operadores.
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
          aria-label="Distribuição automática"
        />
      </div>

      {/* Cartões-rádio de modo — ghosted com o toggle desligado */}
      <div
        className={`grid gap-2 sm:grid-cols-2 transition-opacity ${
          on ? "" : "pointer-events-none opacity-50"
        }`}
        role="radiogroup"
        aria-label="Modo de distribuição"
      >
        {ASSIGNMENT_MODES.map((m) => {
          const selected = currentMode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy || !on}
              onClick={() => {
                setCurrentMode(m.value);
                patch.mutate({ mode: m.value });
              }}
              className={`rounded-lg border p-3 text-left transition ${
                selected
                  ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:border-primary/40 hover:bg-secondary/40"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{m.label}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.description}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Aplica-se aos operadores ativos da equipe; gestores não entram no sorteio.
        Demandas já atribuídas manualmente nunca são sobrescritas.
      </p>
    </div>
  );
}