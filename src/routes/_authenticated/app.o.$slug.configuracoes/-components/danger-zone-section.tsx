import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOrganization } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/info-tip";

/**
 * Zona de Perigo [owner] enxuta: uma linha (título + (i) + botão), com as
 * consequências explicadas no tooltip em vez de parágrafo longo. A
 * confirmação por digitação (nome OU slug exatos) segue no modal, mesmo
 * padrão da exclusão de demanda. Sucesso → toast + limpeza de cache + /app.
 */
export function DangerZoneSection({
  orgId,
  orgName,
  orgSlug,
}: {
  orgId: string;
  orgName: string;
  orgSlug: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const deleteFn = useServerFn(deleteOrganization);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Comparação case-sensitive sobre o texto trimado (nome OU slug).
  const typed = confirmText.trim();
  const matches = typed === orgName || typed === orgSlug;

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { orgId, confirm: typed } }),
    onSuccess: () => {
      toast.success("Organização excluída com sucesso.");
      qc.removeQueries({ queryKey: ["org", orgSlug] });
      qc.removeQueries({ queryKey: ["members", orgId] });
      qc.removeQueries({ queryKey: ["tokens", orgId] });
      qc.removeQueries({ queryKey: ["whatsapp-connection", orgId] });
      qc.removeQueries({ queryKey: ["quick-replies", orgId] });
      navigate({ to: "/app" });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <div className="text-sm font-semibold text-destructive">Zona de Perigo</div>
        </div>
        <div className="flex items-center gap-2">
          <InfoTip text="A exclusão de uma organização é permanente e irreversível. Todos os contatos, demandas, mensagens e configurações associadas serão apagados para sempre." />
          <button
            type="button"
            onClick={() => {
              setConfirmText("");
              setOpen(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition hover:brightness-110"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir Organização
          </button>
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão da organização"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-pop)] ring-1 ring-border/50">
            <div className="text-sm font-bold text-foreground">Excluir organização</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Esta ação não pode ser desfeita. Para confirmar a exclusão
              permanente, digite o nome ou o slug da organização:{" "}
              <code className="font-mono font-bold text-foreground">{orgName}</code> ou{" "}
              <code className="font-mono font-bold text-foreground">{orgSlug}</code>
            </p>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgSlug}
              className="mt-3"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 flex-1 rounded-xl bg-secondary text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!matches || remove.isPending}
                onClick={() => remove.mutate()}
                className="h-9 flex-1 rounded-xl bg-destructive text-xs font-semibold text-destructive-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                {remove.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Confirmar Exclusão"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}