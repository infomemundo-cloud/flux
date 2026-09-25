import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setAllowGroupIngest } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/info-tip";

/**
 * Card de regras de atendimento em grupos (linguagem de gestor):
 * - Toggle "Atendimento em Grupos do WhatsApp"
 * - Descrição humanizada sem termos técnicos (@g.us, ingest, payloads)
 * - Persiste em organizations.allow_group_ingest (owner/admin no servidor)
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
          onCheckedChange={(v) => toggle.mutate(v)}
          aria-label="Atendimento em Grupos"
        />
      </div>
    </div>
  );
}