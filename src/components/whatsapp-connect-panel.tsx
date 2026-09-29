import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { connectWhatsapp, getWhatsappConnection } from "@/lib/whatsapp.functions";

/**
 * Fonte única do painel de conexão WhatsApp (QR + status ao vivo).
 * Consumido pelo wizard de onboarding (step 2) e pela whatsapp-section
 * (Configurações → Canais).
 *
 * Regras de QR (lição do E2E de 2026-09-29 — org presa num QR expirado):
 * - O QR do WhatsApp expira em ~20-60s; mostrar QR velho é bug de UX.
 * - Enquanto aguarda o scan, o QR é regenerado AUTOMATICAMENTE a cada
 *   `qrRefreshMs` (connectWhatsapp é idempotente: conectado → connected;
 *   senão → QR novo) com countdown visível + botão manual sempre disponível.
 * - Org presa em status "connecting" sem QR ganha regeneração automática
 *   no mount (recupera o caso Tau Distribuidora).
 *
 * Layout (diretriz §34 — aproveitamento inteligente de tela):
 * grid 2 colunas no desktop (QR/ação | instruções), empilhado no mobile.
 */
type PanelStatus = "idle" | "loading" | "awaiting_scan" | "connecting" | "connected" | "error";

interface Snapshot {
  status: string;
  qr: string | null;
  code: string | null;
}

function normalizeSnapshot(raw: any): Snapshot {
  const status =
    raw?.connection_status ?? raw?.status ?? (raw?.connected === true ? "connected" : "disconnected");
  const qr = raw?.qr ?? raw?.qrCode ?? raw?.base64 ?? raw?.qr_base64 ?? null;
  const code = raw?.code ?? raw?.pairCode ?? null;
  return {
    status: String(status),
    qr: typeof qr === "string" && qr.trim() ? qr.trim() : null,
    code: typeof code === "string" && code.trim() ? code.trim() : null,
  };
}

function qrSrc(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

const SCAN_STEPS = [
  "Abra o WhatsApp no celular da empresa.",
  "Toque em Configurações → Aparelhos conectados → Conectar um aparelho.",
  "Aponte a câmera para o QR Code ao lado.",
];

interface WhatsappConnectPanelProps {
  orgId: string;
  onConnected?: () => void;
  /** Poll do status enquanto aguarda o scan (detecta conexão). */
  pollMs?: number;
  /** TTL do QR: regenera automaticamente neste intervalo. */
  qrRefreshMs?: number;
}

export function WhatsappConnectPanel({
  orgId,
  onConnected,
  pollMs = 4000,
  qrRefreshMs = 45000,
}: WhatsappConnectPanelProps) {
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const firedRef = useRef(false);

  function fireConnected() {
    if (firedRef.current) return;
    firedRef.current = true;
    setStatus("connected");
    onConnected?.();
  }

  function stampQr(q: string, c: string | null) {
    setQr(q);
    setCode(c);
    setQrExpiresAt(Date.now() + qrRefreshMs);
    setSecsLeft(Math.round(qrRefreshMs / 1000));
  }

  async function refresh(opts?: { adoptQr?: boolean }) {
    try {
      const snap = normalizeSnapshot(await getWhatsappConnection({ data: { orgId } }));
      if (snap.status === "connected") {
        fireConnected();
        return;
      }
      if (opts?.adoptQr && snap.qr && snap.qr !== qr) {
        stampQr(snap.qr, snap.code);
        setStatus("awaiting_scan");
      }
    } catch (err: any) {
      setError(err?.message ?? "Falha ao consultar o status da conexão");
      setStatus("error");
    }
  }

  /** Regenera o QR (auto por TTL ou manual). Idempotente no servidor. */
  async function regenerate(auto: boolean) {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const snap = normalizeSnapshot(await connectWhatsapp({ data: { orgId } }));
      if (snap.status === "connected") {
        fireConnected();
        return;
      }
      if (snap.qr) {
        stampQr(snap.qr, snap.code);
        setStatus("awaiting_scan");
      } else if (!auto) {
        setError("A Evolution não retornou um QR Code agora. Tente novamente.");
        setStatus("error");
      }
    } catch (err: any) {
      if (!auto) {
        setError(err?.message ?? "Falha ao gerar o QR Code");
        setStatus("error");
      }
    } finally {
      setRefreshing(false);
    }
  }

  // Snapshot inicial; org presa em "connecting" sem QR se auto-recupera.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = normalizeSnapshot(await getWhatsappConnection({ data: { orgId } }));
        if (cancelled) return;
        if (snap.status === "connected") {
          fireConnected();
          return;
        }
        if (snap.qr) {
          stampQr(snap.qr, snap.code);
          setStatus("awaiting_scan");
          return;
        }
        if (snap.status === "connecting") {
          setStatus("connecting");
          void regenerate(true);
          return;
        }
        setStatus("idle");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Falha ao consultar a conexão");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Poll de status enquanto aguarda (para sozinho ao conectar).
  useEffect(() => {
    if (status !== "awaiting_scan" && status !== "connecting") return;
    const id = setInterval(() => void refresh({ adoptQr: true }), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pollMs, orgId]);

  // Countdown visível do TTL do QR (tick de 1s).
  useEffect(() => {
    if (status !== "awaiting_scan" || !qrExpiresAt) return;
    const id = setInterval(() => {
      setSecsLeft(Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [status, qrExpiresAt]);

  // TTL zerou → regenera automaticamente (nunca deixa QR morto na tela).
  useEffect(() => {
    if (status !== "awaiting_scan" || secsLeft !== 0) return;
    void regenerate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secsLeft, status]);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
      {/* Coluna 1 — QR / ação */}
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-border bg-background p-6">
        {(status === "loading" || status === "connecting") && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">
              {status === "connecting" ? "Preparando QR Code…" : "Consultando o status da conexão…"}
            </div>
          </div>
        )}

        {status === "connected" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </span>
            <div className="text-center">
              <div className="text-lg font-semibold">WhatsApp conectado</div>
              <div className="text-sm text-muted-foreground">Pronto pra receber a primeira mensagem.</div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-destructive/10">
              <WifiOff className="h-8 w-8 text-destructive" />
            </span>
            <div className="max-w-md text-center">
              <div className="text-lg font-semibold">Não foi possível conectar agora</div>
              <div className="mt-1 text-sm text-muted-foreground">{error}</div>
            </div>
            <button
              onClick={() => void regenerate(false)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </button>
          </div>
        )}

        {status === "awaiting_scan" && qr && (
          <>
            <div className="relative rounded-xl border-2 border-border bg-white p-3 shadow-sm">
              {refreshing && (
                <span className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </span>
              )}
              <img
                src={qrSrc(qr)}
                alt="QR Code de conexão do WhatsApp"
                className="h-56 w-56 sm:h-64 sm:w-64"
              />
            </div>
            {code && code.length <= 16 && (
              <div className="mt-3 text-xs text-muted-foreground">
                Ou use o código:{" "}
                <code className="font-bold tracking-widest text-foreground">{code}</code>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing
                ? "Atualizando QR…"
                : secsLeft != null
                  ? `Novo QR automático em ${secsLeft}s`
                  : "Aguardando o scan…"}
            </div>
            <button
              onClick={() => void regenerate(false)}
              disabled={refreshing}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-secondary disabled:opacity-60"
            >
              <QrCode className="h-3.5 w-3.5" /> Gerar novo QR agora
            </button>
          </>
        )}

        {status === "idle" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="text-center">
              <div className="text-lg font-semibold">Conecte o WhatsApp da sua empresa</div>
              <div className="mt-1 max-w-sm text-sm text-muted-foreground">
                A conexão é feita por QR Code, sem compartilhar senhas. O número conectado
                passa a alimentar a fila automaticamente.
              </div>
            </div>
            <button
              onClick={() => void regenerate(false)}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 font-medium text-primary-foreground hover:opacity-90"
            >
              <QrCode className="h-4 w-4" /> Gerar QR Code
            </button>
          </div>
        )}
      </div>

      {/* Coluna 2 — instruções (lado a lado no desktop, abaixo no mobile) */}
      <div className="flex flex-col justify-center gap-5">
        <div>
          <div className="text-sm font-semibold text-foreground">Como escanear</div>
          <ol className="mt-3 space-y-3">
            {SCAN_STEPS.map((s, i) => (
              <li key={s} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Smartphone className="h-3.5 w-3.5 text-primary" /> O que acontece depois
          </div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>Mensagens dos clientes viram demandas na fila em segundos.</li>
            <li>O time é notificado em tempo real no painel.</li>
            <li>Dá pra desconectar a qualquer momento em Configurações → Canais.</li>
          </ul>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Por segurança o QR expira rápido — geramos um novo automaticamente enquanto
          esta tela estiver aberta.
        </p>
      </div>
    </div>
  );
}
