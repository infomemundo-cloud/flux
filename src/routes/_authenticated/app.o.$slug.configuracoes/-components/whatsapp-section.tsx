import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Power, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { disconnectWhatsapp, getWhatsappConnection } from "@/lib/whatsapp.functions";
import { friendlyError } from "@/lib/friendly-error";
import { InfoTip } from "@/components/info-tip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WhatsappConnectPanel } from "@/components/whatsapp-connect-panel";

const STATUS_META = {
  connected: { label: "Conectado", pill: "pill-green" },
  connecting: { label: "Conectando", pill: "pill-amber" },
  disconnected: { label: "Desconectado", pill: "pill-red" },
} as const;

/**
 * Card de conexão WhatsApp (linguagem de gestor):
 * - Header: badge de status + (i) humanizado + botão discreto "Desconectar Número"
 * - Corpo: número conectado OU painel compartilhado de QR (fonte única)
 * - Modal de confirmação obrigatório antes de desconectar
 * - Sem termos técnicos (Evolution, instância, webhook URL)
 *
 * O painel de QR é o MESMO componente do wizard de onboarding
 * (WhatsappConnectPanel) — zero duplicação de lógica de conexão.
 */
export function WhatsappSection({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getWhatsappConnection);
  const disconnectFn = useServerFn(disconnectWhatsapp);
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: conn, isLoading, error } = useQuery({
    queryKey: ["whatsapp-connection", orgId],
    queryFn: () => getFn({ data: { orgId } }),
    retry: false,
  });

  const status = (conn?.status ?? "disconnected") as keyof typeof STATUS_META;
  const meta = STATUS_META[status];

  const disconnect = useMutation({
    mutationFn: () => disconnectFn({ data: { orgId, deleteInstance: true } }),
    onSuccess: () => {
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] });
      toast.success("WhatsApp desconectado");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (error) return null;

  return (
    <div className="card-elevated space-y-3 p-4">
      {isLoading ? (
        <div className="h-20 animate-pulse rounded-lg bg-secondary/40" />
      ) : (
        <>
          {/* Header: status + (i) + ação de desconectar (só aparece conectado) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${meta.pill}`}>
                <Smartphone className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "connecting" ? "animate-pulse" : ""}`} />
                    {status === "connected" ? "WhatsApp Conectado" : meta.label}
                  </span>
                  <InfoTip text="O número de WhatsApp da sua empresa está ativo e pronto para receber chamados dos seus clientes." />
                </div>
                {status === "connected" && conn?.connected_number && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Número {conn.connected_number}
                  </div>
                )}
              </div>
            </div>
            {status === "connected" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Desconectar WhatsApp"
                      onClick={() => setConfirmOpen(true)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-destructive/40 text-destructive transition hover:bg-destructive/10"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Desconectar Número</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {status === "disconnected" && !conn?.service_ready && (
            <div className="text-[11px] text-muted-foreground">
              Serviço de WhatsApp indisponível no momento. Tente novamente em alguns minutos.
            </div>
          )}

          {/* Painel compartilhado de QR (fonte única): wizard e Configurações
              usam o MESMO componente — zero duplicação de lógica. */}
          {status !== "connected" && conn?.service_ready && (
            <div className="mt-2 rounded-xl border border-border bg-background p-3">
              <WhatsappConnectPanel
                orgId={orgId}
                onConnected={() => qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] })}
              />
            </div>
          )}
        </>
      )}

      {/* Modal de confirmação de desconexão */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar desconexão"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-pop)] ring-1 ring-border/50">
            <div className="text-sm font-bold text-foreground">Desconectar WhatsApp?</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Sua empresa parará de receber e enviar mensagens pelo WhatsApp até uma nova
              conexão. Os chamados existentes não serão afetados.
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
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
                className="h-9 flex-1 rounded-xl bg-destructive text-xs font-semibold text-destructive-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                {disconnect.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}