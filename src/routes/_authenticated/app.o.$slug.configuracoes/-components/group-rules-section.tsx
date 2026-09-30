import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setAllowGroupIngest } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/info-tip";

/**
 * Card de regras de atendimento em grupos (linguagem de gestor):
 * - Toggle "Atendimento em Grupos do WhatsApp" (default de produto: OFF);
 * - ATIVAR exige confirmação em modal com aviso de sobrecarga (grupos
 *   enviam mídias com frequência) e envia `acknowledged: true` — o
 *   servidor recusa ativar sem o ack (defesa em profundidade);
 * - DESATIVAR é imediato (ação segura, sem cerimônia);
 * - Persiste em organizations.allow_group_ingest (owner/admin no servidor).
 */
export function GroupRulesSection({
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: (value: boolean) =>
      setFn({
        data: {
          orgId,
          enabled: value,
          // Ack só faz sentido ao ATIVAR (o servidor exige); ao desativar
          // vai undefined e o refine passa direto.
          acknowledged: value ? true : undefined,
        },
      }),
    onSuccess: (_r, value) => {
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["org", orgSlug] });
      toast.success(
        value
          ? "Atendimento em grupos ativado."
          : "Atendimento em grupos desativado.",
      );
    },
    onError: (e) => {
      setConfirmOpen(false);
      toast.error(friendlyError(e));
    },
  });

  function handleChange(v: boolean) {
    if (v) {
      // Ativar = ação de alto impacto: confirmação com aviso de sobrecarga.
      setConfirmOpen(true);
      return;
    }
    // Desativar = seguro: imediato.
    toggle.mutate(false);
  }

  return (
    <div className="card-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Atendimento em Grupos do WhatsApp</h3>
            <InfoTip text="Quando ativado, conversas de grupos criam chamados com o nome do grupo e identificam o cliente que enviou a mensagem." />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Permitir que mensagens enviadas em grupos gerem chamados automaticamente na fila da equipe.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={toggle.isPending}
          onCheckedChange={handleChange}
          aria-label="Atendimento em Grupos"
        />
      </div>

      {/* Modal de confirmação de ativação (aviso de sobrecarga) */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar ativação de grupos"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-pop)] ring-1 ring-border/50">
            <div className="text-sm font-bold text-foreground">Ativar atendimento em grupos?</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Grupos enviam muitas mensagens e mídias (fotos, áudios, vídeos) com
              frequência. Isso pode aumentar o consumo de armazenamento e deixar a
              fila bem mais movimentada. Você pode desativar a qualquer momento.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-9 flex-1 rounded-xl bg-secondary text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(true)}
                className="h-9 flex-1 rounded-xl bg-primary text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                Ativar, estou ciente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}