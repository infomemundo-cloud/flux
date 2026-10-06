import { Building2 } from "lucide-react";
import type { TenantRow, TenantAction } from "@/lib/platform-admin/tenants.functions";
import { TenantActionsMenu } from "./tenant-actions-menu";

const STATE_STYLES: Record<TenantRow["effective_state"], string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  trial: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  grace: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  suspended: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const STATE_LABEL: Record<TenantRow["effective_state"], string> = {
  active: "Ativa",
  trial: "Trial",
  grace: "Carência",
  suspended: "Suspensa",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });

const formatTrial = (iso: string | null, state: TenantRow["effective_state"]) => {
  if (iso === null) return <span className="text-muted-foreground">—</span>;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (state === "suspended") return <span className="text-rose-600 dark:text-rose-300">encerrado</span>;
  if (days < 0) return <span className="text-amber-600 dark:text-amber-300">expirado</span>;
  return `${days}d`;
};

export function TenantsTable({
  tenants,
  onAction,
  busyOrgId,
}: {
  tenants: TenantRow[];
  onAction: (orgId: string, action: TenantAction, new_trial: string | null, new_state: TenantRow["effective_state"]) => void;
  busyOrgId: string | null;
}) {
  return (
    <div className="max-w-6xl overflow-hidden rounded-md border border-border/50">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Organização</th>
            <th className="px-3 py-2 font-medium">Criada</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Trial</th>
            <th className="px-3 py-2 font-medium">Membros</th>
            <th className="px-3 py-2 font-medium">Abertas</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => {
            const isBusy = busyOrgId === t.id;
            return (
              <tr
                key={t.id}
                className={`border-b border-border/50 last:border-0 hover:bg-muted/30 ${
                  isBusy ? "opacity-60" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">/{t.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(t.created_at)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      STATE_STYLES[t.effective_state]
                    }`}
                  >
                    {STATE_LABEL[t.effective_state]}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatTrial(t.trial_ends_at, t.effective_state)}
                </td>
                <td className="px-3 py-2 tabular-nums">{t.member_count}</td>
                <td className="px-3 py-2 tabular-nums">{t.open_demands}</td>
                <td className="px-3 py-2 text-right">
                  <TenantActionsMenu
                    tenant={t}
                    disabled={isBusy}
                    onAction={(action, new_trial, new_state) => onAction(t.id, action, new_trial, new_state)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
