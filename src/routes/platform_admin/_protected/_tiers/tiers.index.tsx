import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";
import { listTiers, updateTier, type TierRow } from "@/lib/platform-admin/tiers.functions";
import { TiersTable } from "./-components/tiers-table";
import { TierEditModal } from "./-components/tier-edit-modal";

export const Route = createFileRoute("/platform_admin/_protected/_tiers/tiers/")({
  component: TiersPage,
});

function TiersPage() {
  const listFn = useServerFn(listTiers);
  const updateFn = useServerFn(updateTier);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<TierRow | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["tiers"],
    queryFn: () => listFn({ data: {} }),
  });

  const mutation = useMutation({
    mutationFn: (draft: TierRow) => updateFn({ data: draft }),
    onSuccess: (_res, draft) => {
      // Mutações aceleradas (§2.2): update local cirúrgico — zero refetch.
      qc.setQueryData(["tiers"], (old: TierRow[] | undefined) =>
        (old ?? []).map((t) => (t.code === draft.code ? draft : t)),
      );
      toast.success("Tier atualizado.");
      setEditing(null);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-sm font-semibold">Tiers</h1>
        <p className="text-xs text-muted-foreground">
          Catálogo de planos (D1) — edição auditada, superadmin only (D8). Cotas exibidas não
          são aplicadas ainda (DT-09).
        </p>
      </header>

      {isPending ? (
        <div className="max-w-5xl space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        <div className="max-w-5xl rounded-md border border-border/50 bg-card p-4 text-xs">
          <p className="font-medium text-destructive">Falha ao carregar os tiers.</p>
          <p className="mt-1 text-muted-foreground">{friendlyError(error)}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <TiersTable tiers={data ?? []} onEdit={setEditing} />
      )}

      {editing && (
        <TierEditModal
          tier={editing}
          saving={mutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(draft) => mutation.mutate(draft)}
        />
      )}
    </div>
  );
}
