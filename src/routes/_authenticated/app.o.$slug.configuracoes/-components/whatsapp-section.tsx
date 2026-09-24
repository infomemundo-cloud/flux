import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PowerOff, QrCode, RefreshCw, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import {
  getWhatsappConnection,
  connectWhatsapp,
  disconnectWhatsapp,
} from "@/lib/whatsapp.functions";
import { friendlyError } from "@/lib/friendly-error";
import { FormSkeleton } from "@/components/skeletons";

const STATUS_META = {
  connected: { label: "Conectado", pill: "pill-green" },
  connecting: { label: "Conectando", pill: "pill-amber" },
  disconnected: { label: "Desconectado", pill: "pill-red" },
} as const;

/**
 * Ciclo de vida da conexão Evolution: QR, estado, reconexão, desconexão.
 * O toggle de IA NÃO vive aqui (regra de atendimento → ai-auto-reply-section).
 */
export function WhatsappSection({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getWhatsappConnection);
  const connectFn = useServerFn(connectWhatsapp);
  const disconnectFn = useServerFn(disconnectWhatsapp);
  const qc = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const { data: conn, isLoading, error } = useQuery({
    queryKey: ["whatsapp-connection", orgId],
    queryFn: () => getFn({ data: { orgId } }),
    retry: false,
    refetchInterval: qrOpen ? 5000 : false,
  });

  const status = (conn?.status ?? "disconnected") as keyof typeof STATUS_META;
  const meta = STATUS_META[status];

  // Fecha o QR assim que a conexão é confirmada.
  useEffect(() => {
    if (qrOpen && status === "connected") {
      setQrOpen(false);
      setQr(null);
      toast.success("WhatsApp conectado!");
    }
  }, [status, qrOpen]);

  const connect = useMutation({
    mutationFn: () => connectFn({ data: { orgId } }),
    onSuccess: (r: any) => {
      setQr(r?.qr ?? null);
      setPairCode(r?.code ?? null);
      if (r?.status === "connected") toast.success(r.message);
      else setQrOpen(true);
      qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn({ data: { orgId, deleteInstance: true } }),
    onSuccess: () => {
      setQrOpen(false);
      setQr(null);
      setPairCode(null);
      setConfirmDisconnect(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] });
      toast.success("WhatsApp desconectado");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (error) return null;

  return (
    <section>
      {isLoading ? (
        <FormSkeleton sections={1} />
      ) : (
        <div className="card-elevated space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.pill}`}>
                <Smartphone className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "connecting" ? "animate-pulse" : ""}`} />{" "}
                    {meta.label}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {status === "connected" && conn?.connected_number
                    ? `Número ${conn.connected_number}`
                    : conn?.service_ready
                      ? "Uma conexão exclusiva desta organização."
                      : "Serviço de WhatsApp indisponível no momento."}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {status !== "connected" && (
                <button
                  type="button"
                  disabled={connect.isPending || !conn?.service_ready}
                  onClick={() => connect.mutate()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                  Gerar QR Code / Conectar WhatsApp
                </button>
              )}
              {(status !== "disconnected" || conn?.instance_name) &&
                (confirmDisconnect ? (
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-xs text-muted-foreground">Desconectar?</span>
                    <button
                      type="button"
                      disabled={disconnect.isPending}
                      onClick={() => disconnect.mutate()}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition disabled:opacity-60"
                    >
                      {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(false)}
                      className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-secondary"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
                  >
                    <PowerOff className="h-4 w-4" />
                    Desconectar / Excluir instância
                  </button>
                ))}
            </div>
          </div>
          {conn?.webhook_url && (
            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Endereço de entrada configurado automaticamente
              </div>
              <code className="mt-1 block break-all text-xs">{conn.webhook_url}</code>
            </div>
          )}
        </div>
      )}
      {qrOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Conectar WhatsApp"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold">Conectar WhatsApp</h3>
                <p className="text-xs text-muted-foreground">
                  No WhatsApp: Aparelhos conectados → Conectar aparelho.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setQrOpen(false)}
                className="rounded-md p-1.5 hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid place-items-center rounded-xl bg-white p-3">
              {qr ? (
                <img src={qr} alt="QR Code para conectar o WhatsApp" className="h-56 w-56" />
              ) : (
                <div className="grid h-56 w-56 place-items-center text-sm text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>
            {pairCode && (
              <div className="mt-3 text-center text-xs text-muted-foreground">
                Código de pareamento: <code className="font-bold text-foreground">{pairCode}</code>
              </div>
            )}
            <button
              type="button"
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold transition hover:bg-secondary disabled:opacity-60"
            >
              {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{" "}
              Gerar novo QR Code
            </button>
          </div>
        </div>
      )}
    </section>
  );
}