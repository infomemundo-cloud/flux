import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setAllowGroupIngest } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { getAccountAccess } from "@/lib/billing/account-access";
import { hasFeature } from "@/lib/billing/tier-contracts";

/**
 * Card de regras de atendimento em grupos (linguagem de gestor):
 * - Toggle "Atendimento em Grupos do WhatsApp" (default de produto: OFF);
 * - ATIVAR exige confirmação em modal com aviso de sobrecarga;
 * - DESATIVAR é imediato;
 * - Persiste em organizations.allow_group_ingest.
 *
 * FASE 4.7 ITEM 3 (Gate de Features):
 * • Recurso EXCLUSIVO para plano 'escala'.
 * • Planos 'operacao' e 'crescimento': Switch desabilitado + Badge ESCALA.
 *
 * FASE 4.9 (decisão de fase, 2026-10-28): grupos OFF para TODOS os tiers.
 * A Evolution está travada em WEBHOOK_IGNORE_GROUPS (infra estrutural: vale
 * pra toda instância nova/atual, não é toggle reversível por acidente). O
 * machinery de grupo no ingest fica DORMENTE DE PROPÓSITO — preservado pra
 * quando mudarmos de ideia (ele já respeita tok.allowGroup e, sem tráfego,
 * nunca dispara; não tocamos no ingest). O contrato TS mantém
 * groupIngestEnabled como promessa de futuro (escala=true), mas a GUI trava
 * AQUI via GROUPS_GLOBALLY_DISABLED. Enquanto a flag for true, o badge é
 * "Em breve" (não "Escala") e o parágrafo não promete upgrade. Reativação =
 * false aqui + destravar Evolution; o gate por tier volta a mandar sozinho.
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
  const accessFn = useServerFn(getAccountAccess);

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Query de Acesso (compartilha cache com outros cards da página)
  const { data: access } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });

  const toggle = useMutation({
    mutationFn: (value: boolean) =>
      setFn({
        data: {
          orgId,
          enabled: value,
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

  // 👇 LÓGICA DE GATE: contrato por tier + kill-switch da fase.
  const tierCode = access?.tierCode ?? "operacao";
  const canUseGroups = hasFeature(tierCode, "groupIngestEnabled");
  // Grupos OFF para TODOS os tiers nesta fase (ver doc-comment). A flag
  // subordinada ao contrato: quando virar false, o gate por tier (escala)
  // volta a valer sem retrabalho — o machinery fica preservado.
  const GROUPS_GLOBALLY_DISABLED = true;
  const isLocked = GROUPS_GLOBALLY_DISABLED || !canUseGroups;

  function handleChange(v: boolean) {
    if (v && isLocked) {
      if (GROUPS_GLOBALLY_DISABLED) {
        toast.info("Atendimento em grupos chega em breve.", {
          description:
            "Estamos preparando o suporte a grupos com controle de carga de mídia.",
        });
      } else {
        toast.info("Faça upgrade para o plano Escala para habilitar atendimento em grupos.", {
          description: "Vá em Configurações > Financeiro para ver os planos disponíveis.",
        });
      }
      return;
    }

    if (v) {
      setConfirmOpen(true);
      return;
    }
    toggle.mutate(false);
  }

  return (
    <div className="card-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Atendimento em Grupos do WhatsApp</h3>
            <InfoTip text="Quando ativado, conversas de grupos criam chamados com o nome do grupo e identificam o cliente que enviou a mensagem." />

            {/* Pill "Em breve" (neutro, idioma do UpcomingChannels) enquanto a
                fase trava todos os tiers. O Badge violeta + Lock só volta se a
                flag global virar false e o gate por tier assumir — aí o cadeado
                faz sentido de novo ("bloqueado por plano", não "em breve"). */}
            {isLocked &&
              (GROUPS_GLOBALLY_DISABLED ? (
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Em breve
                </span>
              ) : (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider border-violet-500/30 text-violet-500 bg-violet-500/10 gap-1 ml-1"
                >
                  <Lock className="h-2.5 w-2.5" />
                  Escala
                </Badge>
              ))}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isLocked
              ? GROUPS_GLOBALLY_DISABLED
                ? "Em breve: triagem de mensagens de grupos direto na sua fila."
                : "Recurso exclusivo do plano Escala. Automatize triagem de mensagens de grupos diretamente na sua fila."
              : "Permitir que mensagens enviadas em grupos gerem chamados automaticamente na fila da equipe."
            }
          </p>
        </div>

        <Switch
          checked={isLocked ? false : enabled}
          disabled={toggle.isPending || isLocked}
          onCheckedChange={handleChange}
          aria-label="Atendimento em Grupos"
          className={isLocked ? "opacity-50 cursor-not-allowed" : ""}
        />
      </div>

      {/* Modal de confirmação (só abre se não estiver locked) */}
      {confirmOpen && !isLocked && (
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
