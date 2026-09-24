import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOrganization } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Input } from "@/components/ui/input";

/**
 * Zona de Perigo [owner]: exclusão permanente da organização.
 * Renderizada SOMENTE quando role === 'owner' (gate no geral-tab) e com
 * guard de owner no servidor (defesa em profundidade). Confirmação por
 * digitação (nome OU slug exatos), mesmo padrão da exclusão de demanda.
 * Sucesso → toast + limpeza das queries da org + redirect pra /app.
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
      // Limpa o cache da org antes de sair (evita tela órfã no /app)
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
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-destructive">Zona de Perigo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A exclusão de uma organização é permanente e irreversível. Todos os
              contatos, demandas, mensagens e configurações associadas serão
              apagados para sempre.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setConfirmText("");
              setOpen(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition hover:brightness-110"
          >
            <Trash2 className="h-4 w-4" />
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