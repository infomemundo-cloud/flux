import { CalendarPlus, CalendarClock, RotateCcw, Shield, Ban, CircleSlash, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { RowMenu } from "@/components/row-menu";
import type { TenantRow, TenantAction } from "@/lib/platform-admin/tenants.functions";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Menu de ações por linha. Cada ação pré-calcula o novo trial_ends_at
 * e o estado efetivo esperado, e passa pro callback — a mutation do
 * pai cuida do setQueryData com esses valores.
 */
export function TenantActionsMenu({
  tenant,
  disabled,
  onAction,
  onForceCancel,
  onOverrideTier,
}: {
  tenant: TenantRow;
  disabled: boolean;
  onAction: (action: TenantAction, new_trial: string | null, new_state: TenantRow["effective_state"]) => void;
  onForceCancel: (reason: string) => void;
  onOverrideTier: (toTierCode: string, reason: string) => void;
}) {
  const now = Date.now();
  const base = Math.max(now, tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : now);

  const plan = (action: TenantAction): { new_trial: string | null; new_state: TenantRow["effective_state"] } => {
    switch (action) {
      case "grandfather":
        return { new_trial: null, new_state: "active" };
      case "suspend":
        return { new_trial: new Date(now - 15 * DAY).toISOString(), new_state: "suspended" };
      case "reactivate":
        return { new_trial: new Date(now + 7 * DAY).toISOString(), new_state: "trial" };
      case "extend_7d":
        return { new_trial: new Date(base + 7 * DAY).toISOString(), new_state: "trial" };
      case "extend_30d":
        return { new_trial: new Date(base + 30 * DAY).toISOString(), new_state: "trial" };
    }
  };

  const items = [
    {
      label: "Estender trial +7d",
      icon: <CalendarPlus className="h-3.5 w-3.5" />,
      disabled,
      onClick: () => {
        const p = plan("extend_7d");
        onAction("extend_7d", p.new_trial, p.new_state);
      },
    },
    {
      label: "Estender trial +30d",
      icon: <CalendarClock className="h-3.5 w-3.5" />,
      disabled,
      onClick: () => {
        const p = plan("extend_30d");
        onAction("extend_30d", p.new_trial, p.new_state);
      },
    },
    {
      label: "Reativar (trial +7d)",
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      disabled: disabled || tenant.effective_state === "active" || tenant.effective_state === "trial",
      onClick: () => {
        const p = plan("reactivate");
        onAction("reactivate", p.new_trial, p.new_state);
      },
    },
    {
      label: "Grandfather (NULL)",
      icon: <Shield className="h-3.5 w-3.5" />,
      disabled: disabled || tenant.trial_ends_at === null,
      onClick: () => {
        const p = plan("grandfather");
        onAction("grandfather", p.new_trial, p.new_state);
      },
    },
    {
      label: "Suspender agora",
      icon: <Ban className="h-3.5 w-3.5" />,
      danger: true,
      disabled: disabled || tenant.effective_state === "suspended",
      onClick: () => {
        const p = plan("suspend");
        onAction("suspend", p.new_trial, p.new_state);
      },
    },
    // ── DT-09 Parte 3 — ações de billing (superadmin) ──────────────────
    // Só fazem sentido com assinatura viva (effective_state === "active").
    // confirm/prompt inline: o RowMenu não embute confirmação (itens de
    // trial disparam direto), então a fricção de ações destrutivas mora aqui.
    {
      label: "Forçar cancelamento (MP)",
      icon: <CircleSlash className="h-3.5 w-3.5" />,
      danger: true,
      disabled: disabled || tenant.effective_state !== "active",
      onClick: () => {
        if (
          !confirm(
            `Cancelar a assinatura da org "${tenant.name}" NO MERCADO PAGO AGORA?

` +
            `O preapproval será cancelado no MP e o acesso cai para bloqueado imediatamente. ` +
            `Ação auditada e IRREVERSÍVEL pela UI (reativação só via checkout do tenant).`,
          )
        )
          return;
        const reason = window.prompt("Motivo do cancelamento forçado (mín. 3 caracteres):")?.trim();
        if (!reason || reason.length < 3) {
          toast.error("Motivo obrigatório (mín. 3 caracteres).");
          return;
        }
        onForceCancel(reason);
      },
    },
    {
      label: "Ajustar tier (override local)",
      icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
      disabled: disabled || tenant.effective_state !== "active",
      onClick: () => {
        const toTierCode = window.prompt(
          `Novo tier (código exato):
operacao | crescimento | escala | free`,
        )?.trim();
        if (!toTierCode) return;
        const reason = window.prompt("Motivo do override (mín. 3 caracteres):")?.trim();
        if (!reason || reason.length < 3) {
          toast.error("Motivo obrigatório (mín. 3 caracteres).");
          return;
        }
        if (
          !confirm(
            `Override LOCAL de tier para "${toTierCode}".

` +
            `⚠️ A cobrança no MP PERMANECE no tier antigo até a próxima reconciliação/checkout. ` +
            `Use para corrigir estado travado, NÃO para troca comercial.`,
          )
        )
          return;
        onOverrideTier(toTierCode, reason);
      },
    },
  ];

  return <RowMenu items={items} />;
}
