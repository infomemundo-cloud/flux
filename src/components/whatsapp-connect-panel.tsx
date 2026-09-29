import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, QrCode, RefreshCw, WifiOff } from "lucide-react";
import { connectWhatsapp, getWhatsappConnection } from "@/lib/whatsapp.functions";

/**
 * Fonte única do painel de conexão WhatsApp (QR + status ao vivo).
 * Consumido hoje pelo wizard de onboarding (step 2); no fechamento da
 * Fase 2 a `whatsapp-section.tsx` (Configurações → Canais) passa a
 * consumir este componente no lugar do bloco inline dela.
 *
 * Acoplagem com src/lib/whatsapp.functions.ts (server functions):
 * - connectWhatsapp({ orgId }): cria instância na Evolution se preciso,
 *   configura o webhook e devolve o QR pra escanear;
 * - getWhatsappConnection({ orgId }): snapshot atual (status + QR pendente).
 * normalizeSnapshot absorve variações de shape (qr/qrCode/base64;
 * status/connection_status) sem espalhar ifs pela UI.
 */
type PanelStatus = "idle" | "loading" | "awaiting_scan" | "connecting" | "connected" | "error";

interface Snapshot {
  status: string;
  qr: string | null;
}

function normalizeSnapshot(raw: any): Snapshot {
  const status =
    raw?.connection_status ?? raw?.status ?? (raw?.connected === true ? "connected" : "disconnected");
  const qr = raw?.qr ?? raw?.qrCode ?? raw?.base64 ?? raw?.qr_base64 ?? null;
  return { status: String(status), qr: typeof qr === "string" && qr.trim() ? qr.trim() : null };
}

function qrSrc(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

interface WhatsappConnectPanelProps {
  orgId: string;
  onConnected?: () => void;
  pollMs?: number;
}

export function WhatsappConnectPanel({ orgId, onConnected, pollMs = 4000 }: WhatsappConnectPanelProps) {
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);

  function fireConnected() {
    if (firedRef.current) return;
    firedRef.current = true;
    setStatus("connected");
    onConnected?.();
  }

  async function refresh(opts?: { acceptQr?: boolean }) {
    try {
      const snap = normalizeSnapshot(await getWhatsappConnection({ data: { orgId } }));
      if (snap.status === "connected") {
        fireConnected();
        return;
      }
      if (opts?.acceptQr && snap.qr) {
        setQr(snap.qr);
        setStatus("awaiting_scan");
        return;
      }
      setStatus((cur) => (cur === "awaiting_scan" && snap.qr ? cur : snap.qr ? "awaiting_scan" : "idle"));
      if (snap.qr) setQr(snap.qr);
    } catch (err: any) {
      setError(err?.message ?? "Falha ao consultar o status da conexão");
      setStatus("error");
    }
  }

  useEffect(() => {
    void refresh({ acceptQr: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (status !== "awaiting_scan") return;
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pollMs, orgId]);

  async function handleConnect() {
    setError(null);
    setStatus("connecting");
    try {
      const snap = normalizeSnapshot(await connectWhatsapp({ data: { orgId } }));
      if (snap.status === "connected") {
        fireConnected();
        return;
      }
      if (snap.qr) {
        setQr(snap.qr);
        setStatus("awaiting_scan");
      } else {
        setError("A Evolution não retornou o QR Code. Tente novamente.");
        setStatus("error");
      }
    } catch (err: any) {
      setError(err?.message ?? "Falha ao iniciar a conexão");
      setStatus("error");
    }
  }

  if (status === "loading" || status === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">
          {status === "connecting" ? "Preparando a conexão segura…" : "Consultando o status da conexão…"}
        </div>
      </div>
    );
  }

  if (status === "connected") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </span>
        <div className="text-center">
          <div className="text-lg font-semibold">WhatsApp conectado</div>
          <div className="text-sm text-muted-foreground">Pronto pra receber a primeira mensagem.</div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-destructive/10">
          <WifiOff className="h-8 w-8 text-destructive" />
        </span>
        <div className="text-center max-w-md">
          <div className="text-lg font-semibold">Não foi possível conectar agora</div>
          <div className="text-sm text-muted-foreground mt-1">{error}</div>
        </div>
        <button
          onClick={() => void handleConnect()}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  if (status === "awaiting_scan" && qr) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-10">
        <div className="text-center space-y-1">
          <div className="text-lg font-semibold">Escaneie o QR Code</div>
          <div className="text-sm text-muted-foreground max-w-md">
            No celular: WhatsApp → <b>Configurações</b> → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>.
          </div>
        </div>
        <div className="rounded-xl border-2 border-border bg-white p-4 shadow-sm">
          <img src={qrSrc(qr)} alt="QR Code de conexão do WhatsApp" className="h-64 w-64" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Aguardando o scan… (verificação automática a cada {Math.round(pollMs / 1000)}s)
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16">
      <div className="text-center space-y-1">
        <div className="text-lg font-semibold">Conecte o WhatsApp da sua empresa</div>
        <div className="text-sm text-muted-foreground max-w-md">
          A conexão é feita por QR Code, sem compartilhar senhas. O número conectado passa a
          alimentar a fila automaticamente.
        </div>
      </div>
      <button
        onClick={() => void handleConnect()}
        className="inline-flex items-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
      >
        <QrCode className="h-4 w-4" /> Gerar QR Code
      </button>
    </div>
  );
}