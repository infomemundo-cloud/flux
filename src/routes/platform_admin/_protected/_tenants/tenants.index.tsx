import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";
import {
  listTenants,
  setTenantTrial,
  type TenantRow,
  type TenantAction,
} from "@/lib/platform-admin/tenants.functions";
import { TenantsTable } from "./-components/tenants-table";

export const Route = createFileRoute("/platform_admin/_protected/_tenants/tenants/")({
  component: TenantsPage,
});

function TenantsPage() {
  const listFn = useServerFn(listTenants);
  const actionFn = useServerFn(setTenantTrial);
  const qc = useQueryClient();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => listFn({ data: {} }),
  });

  const mutation = useMutation({
    mutationFn: (args: { orgId: string; action: TenantAction; new_trial: string | null; new_state: TenantRow["effective_state"] }) =>
      actionFn({ data: { orgId: args.orgId, action: args.action } }),
    onSuccess: (_res, args) => {
      // Mutações aceleradas (§2.2): update local cirúrgico — zero refetch.
      qc.setQueryData(["tenants"], (old: TenantRow[] | undefined) =>
        (old ?? []).map((t) =>
          t.id === args.orgId
            ? {
                ...t,
                trial_ends_at: args.new_trial,
                effective_state: args.new_state,
              }
            : t,
        ),
      );
      toast.success(`Ação aplicada.`);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-sm font-semibold">Tenants</h1>
        <p className="text-xs text-muted-foreground">
          Gestão de organizações — ciclo de vida (trial/grace/suspended/grandfather). Ações auditadas
          em <code className="text-[10px]">admin_audit_log</code>. Estado efetivo é derivado pelo
          mesmo helper do banner de acesso.
        </p>
      </header>

      {isPending ? (
        <div className="max-w-6xl space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        <div className="max-w-6xl rounded-md border border-border/50 bg-card p-4 text-xs">
          <p className="font-medium text-destructive">Falha ao carregar os tenants.</p>
          <p className="mt-1 text-muted-foreground">{friendlyError(error)}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <TenantsTable
          tenants={data ?? []}
          onAction={(orgId, action, new_trial, new_state) =>
            mutation.mutate({ orgId, action, new_trial, new_state })
          }
          busyOrgId={mutation.isPending ? mutation.variables?.orgId : null}
        />
      )}
    </div>
  );
}
