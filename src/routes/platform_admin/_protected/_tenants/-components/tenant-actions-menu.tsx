import { CalendarPlus, CalendarClock, RotateCcw, Shield, Ban } from "lucide-react";
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
}: {
  tenant: TenantRow;
  disabled: boolean;
  onAction: (action: TenantAction, new_trial: string | null, new_state: TenantRow["effective_state"]) => void;
}) {
  const now = Date.now();
  const base = tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : now;

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
  ];

  return <RowMenu items={items} />;
}
