import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { connectWhatsapp, getWhatsappConnection } from "@/lib/whatsapp.functions";
import { InfoTip } from "@/components/info-tip";

/**
 * Fonte única do painel de conexão WhatsApp (QR + status ao vivo),
 * compartilhada por wizard (layout completo) e Configurações (compact).
 * Regras: 1º QR só por clique; renovação automática com teto (3×) e pausa
 * em background; `expired` com ação manual; `syncing` celebra 1.5s antes
 * de onConnected. Em compact o mount NÃO mostra loader: entra em idle
 * direto (a section já sabe que não está conectado) e só evolui se houver
 * QR pendente ou conexão confirmada — acesso sem atrito.
 */
type PanelStatus =
  | "loading"
  | "idle"
  | "starting"
  | "awaiting_scan"
  | "connecting"
  | "syncing"
  | "connected"
  | "expired"
  | "error";

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

const STARTING_MESSAGES = [
  "Alocando instância na Evolution…",
  "Solicitando QR Code à API…",
  "Preparando a conexão segura…",
];

/** Teto de renovações automáticas do QR (padrão WhatsApp Web/WATI). */
const MAX_AUTO_RENEWALS = 3;

interface WhatsappConnectPanelProps {
  orgId: string;
  onConnected?: () => void;
  pollMs?: number;
  qrRefreshMs?: number;
  /** Configurações → Canais: coluna única, sem loader no mount, botão ghost. */
  compact?: boolean;
}

export function WhatsappConnectPanel({
  orgId,
  onConnected,
  pollMs = 4000,
  qrRefreshMs = 45000,
  compact = false,
}: WhatsappConnectPanelProps) {
  // Compact: idle imediato (acesso sem carregamento). Wizard: loading neutro.
  const [status, setStatus] = useState<PanelStatus>(compact ? "idle" : "loading");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const [startingMsg, setStartingMsg] = useState(STARTING_MESSAGES[0]);
  const [visible, setVisible] = useState(
    () => (typeof document !== "undefined" ? !document.hidden : true),
  );
  const [autoRenewals, setAutoRenewals] = useState(0);
  const firedRef = useRef(false);
  const startingMsgRef = useRef(0);

  function fireConnected() {
    if (firedRef.current) return;
    firedRef.current = true;
    setStatus("syncing");
    window.setTimeout(() => {
      onConnected?.();
    }, 1500);
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

  /** Regenera o QR (auto por TTL ou manual). Clique manual reseta o teto. */
  async function regenerate(auto: boolean) {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    if (!auto) setAutoRenewals(0);
    setStatus("starting");
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
      } else {
        setStatus("idle");
      }
    } catch (err: any) {
      if (!auto) {
        setError(err?.message ?? "Falha ao gerar o QR Code");
        setStatus("error");
      } else {
        setStatus("idle");
      }
    } finally {
      setRefreshing(false);
    }
  }

  // Snapshot inicial: só evolui o estado (QR pendente / conectado).
  // Compact nunca sai do idle por causa de "connecting" antigo no DB.
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
        if (snap.status === "connecting" && !compact) {
          setStatus("connecting");
          return;
        }
        if (!compact) setStatus("idle");
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
  }, [orgId, compact]);

  // Poll de status (pausado com a aba oculta).
  useEffect(() => {
    if (status !== "awaiting_scan" && status !== "connecting") return;
    if (!visible) return;
    const id = setInterval(() => void refresh({ adoptQr: true }), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pollMs, orgId, visible]);

  // Countdown do TTL do QR.
  useEffect(() => {
    if (status !== "awaiting_scan" || !qrExpiresAt) return;
    const id = setInterval(() => {
      setSecsLeft(Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [status, qrExpiresAt]);

  // TTL zerou: renova dentro do teto e com aba visível; senão `expired`.
  useEffect(() => {
    if (status !== "awaiting_scan" || secsLeft !== 0) return;
    if (!visible) return;
    if (autoRenewals >= MAX_AUTO_RENEWALS) {
      setStatus("expired");
      return;
    }
    setAutoRenewals((n) => n + 1);
    void regenerate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secsLeft, status, visible, autoRenewals]);

  // Mensagens rotativas do `starting` (pós-clique).
  useEffect(() => {
    if (status !== "starting") return;
    const id = setInterval(() => {
      startingMsgRef.current = (startingMsgRef.current + 1) % STARTING_MESSAGES.length;
      setStartingMsg(STARTING_MESSAGES[startingMsgRef.current]);
    }, 1400);
    return () => clearInterval(id);
  }, [status]);

  // Pausa/retoma com o foco da aba.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const statusBadge = (() => {
    switch (status) {
      case "loading":
        return { color: "text-muted-foreground", dot: "bg-muted-foreground", label: "Consultando status…", pulse: true };
      case "awaiting_scan":
        return { color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "Aguardando leitura", pulse: true };
      case "connecting":
      case "starting":
        return { color: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500", label: "Estabelecendo conexão…", pulse: true };
      case "syncing":
        return { color: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label: "Sincronizando…", pulse: true };
      case "connected":
        return { color: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label: "Instância online e sincronizada", pulse: false };
      case "expired":
        return { color: "text-muted-foreground", dot: "bg-muted-foreground", label: "QR expirado", pulse: false };
      case "error":
        return { color: "text-red-600 dark:text-red-400", dot: "bg-red-500", label: "Falha na conexão", pulse: false };
      default:
        return { color: "text-muted-foreground", dot: "bg-muted-foreground", label: "Desconectado", pulse: false };
    }
  })();

  const idleCompact = compact && status === "idle";

  return (
    <>
      <style>{`
        @keyframes flux-qr-scan {
          0%, 100% { transform: translateY(-48%); opacity: 0.1; }
          10%, 90% { opacity: 1; }
          50% { transform: translateY(48%); opacity: 1; }
        }
        @keyframes flux-qr-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.45); }
          50% { box-shadow: 0 0 0 8px rgba(14, 165, 233, 0); }
        }
        @keyframes flux-check-bounce {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes flux-progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>

      <div className={compact ? "flex flex-col gap-4" : "grid gap-6 lg:grid-cols-2 lg:gap-8"}>
        {/* Coluna 1: estados / QR / ação */}
        <div
          className={`relative flex flex-col items-center overflow-hidden rounded-xl border border-border bg-background ${
            idleCompact
              ? "p-4"
              : compact
                ? "min-h-[280px] justify-center p-4"
                : "min-h-[320px] justify-center p-6"
          }`}
        >
          {/* Badge de status — só no wizard; em Configurações o header do card já mostra */}
          {!compact && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold ring-1 ring-border/60">
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot} ${statusBadge.pulse ? "animate-pulse" : ""}`}
              />
              <span className={statusBadge.color}>{statusBadge.label}</span>
            </div>
          )}

          {/* Loading neutro (só wizard): nunca diz "Alocando instância" */}
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-10 animate-in fade-in duration-300">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <div className="text-xs text-muted-foreground">Consultando o status da conexão…</div>
            </div>
          )}

          {/* Starting/connecting: só existe após ação do usuário (ou fluxo do wizard) */}
          {(status === "starting" || status === "connecting") && (
            <div className="flex flex-col items-center gap-3 py-10 animate-in fade-in duration-300">
              <div className="relative grid h-14 w-14 place-items-center">
                <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
              <div className="text-sm font-medium text-foreground transition-opacity duration-300">
                {status === "connecting" ? "Sincronizando com a Evolution…" : startingMsg}
              </div>
              <div className="text-xs text-muted-foreground">Isso leva alguns segundos</div>
            </div>
          )}

          {status === "syncing" && (
            <div className="flex w-full max-w-xs flex-col items-center gap-4 py-10">
              <span
                className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10"
                style={{ animation: "flux-check-bounce 500ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
              >
                <CheckCircle2 className="h-8 w-8 text-emerald-500" strokeWidth={2.2} />
              </span>
              <div className="text-center">
                <div className="text-base font-semibold">Leitura confirmada!</div>
                <div className="mt-1 text-xs text-muted-foreground">Preparando a fila de demandas…</div>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ animation: "flux-progress 1.5s linear forwards" }}
                />
              </div>
            </div>
          )}

          {status === "connected" && (
            <div className="flex flex-col items-center gap-4 py-10 animate-in fade-in duration-300">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" strokeWidth={2.2} />
              </span>
              <div className="text-center">
                <div className="text-base font-semibold">WhatsApp conectado</div>
                <div className="text-xs text-muted-foreground">Pronto pra receber a primeira mensagem.</div>
              </div>
            </div>
          )}

          {status === "expired" && (
            <div className="flex flex-col items-center gap-4 py-10 animate-in fade-in duration-300">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-muted">
                <RefreshCw className="h-8 w-8 text-muted-foreground" />
              </span>
              <div className="max-w-xs text-center">
                <div className="text-base font-semibold">Este QR Code expirou</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Por segurança geramos poucos QR Codes automáticos. Clique para criar um novo e escanear em seguida.
                </div>
              </div>
              <button
                onClick={() => void regenerate(false)}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <QrCode className="h-4 w-4" /> Gerar novo QR Code
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 py-10 animate-in fade-in duration-300">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-destructive/10">
                <WifiOff className="h-8 w-8 text-destructive" />
              </span>
              <div className="max-w-md text-center">
                <div className="text-base font-semibold">Não foi possível conectar agora</div>
                <div className="mt-1 text-xs text-muted-foreground">{error}</div>
              </div>
              <button
                onClick={() => void regenerate(false)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
              </button>
            </div>
          )}

          {status === "awaiting_scan" && qr && (
            <>
              <div
                className="relative rounded-xl bg-white shadow-sm"
                style={{
                  padding: compact ? "10px" : "14px",
                  animation: "flux-qr-pulse 2.5s ease-in-out infinite",
                }}
              >
                <div className="relative overflow-hidden rounded-lg">
                  {refreshing && (
                    <span className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-white/80 backdrop-blur-sm">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </span>
                  )}
                  <img
                    src={qrSrc(qr)}
                    alt="QR Code de conexão do WhatsApp"
                    className={compact ? "h-48 w-48" : "h-56 w-56 sm:h-64 sm:w-64"}
                  />
                  <span
                    className="pointer-events-none absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-500 to-transparent"
                    style={{ animation: "flux-qr-scan 2.5s ease-in-out infinite", top: "50%" }}
                  />
                </div>
              </div>
              {code && code.length <= 16 && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Ou use o código: <code className="font-bold tracking-widest text-foreground">{code}</code>
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

          {status === "idle" &&
              (compact ? (
                // CONFIGURAÇÕES: 2 linhas compactas — (1) título + info tip;
                // (2) botão de gerar QR. Sem parágrafo solto, sem buraco vertical.
                <div className="flex w-full flex-col items-start gap-3 animate-in fade-in duration-300">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-semibold text-foreground">
                      Conecte o WhatsApp da sua empresa
                    </div>
                    <InfoTip text="Conexão por QR Code, sem compartilhar senhas. O número conectado alimenta a fila automaticamente." />
                  </div>
                  <button
                    onClick={() => void regenerate(false)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-transparent px-3 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                  >
                    <QrCode className="h-4 w-4" /> Gerar QR Code
                  </button>
                </div>
              ) : (
              // Wizard: palco centralizado (tela de foco).
              <div className="flex flex-col items-center gap-4 py-10 animate-in fade-in duration-300">
                <div className="text-center">
                  <div className="text-base font-semibold">Conecte o WhatsApp da sua empresa</div>
                  <div className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Conexão por QR Code, sem compartilhar senhas. O número conectado passa a alimentar a fila automaticamente.
                  </div>
                </div>
                <button
                  onClick={() => void regenerate(false)}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  <QrCode className="h-4 w-4" /> Gerar QR Code
                </button>
              </div>
            ))}
        </div>

        {/* Coluna 2: instruções (só no wizard) */}
        {!compact && (
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
              Por segurança o QR expira rápido — geramos um novo automaticamente enquanto esta tela estiver aberta.
            </p>
          </div>
        )}

        {compact && status !== "idle" && status !== "connected" && (
          <p className="text-center text-[11px] text-muted-foreground">
            Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho.
          </p>
        )}
      </div>
    </>
  );
}
