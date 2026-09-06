import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getOrgBySlug, listMembers } from "@/lib/orgs.functions";
import { listWebhookTokens, createWebhookToken, deleteWebhookToken } from "@/lib/demandas.functions";
import { getWhatsappConnection, connectWhatsapp, disconnectWhatsapp, setWhatsappAutoReply } from "@/lib/whatsapp.functions";
import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle, StatCard } from "@/components/section-ui";
import { ThemeToggleInline } from "@/components/user-menu";
import { toast } from "sonner";
import { Copy, Trash2, Plus, Users, KeyRound, Webhook, Palette, Settings2, MessageCircle, Loader2, QrCode, PowerOff, RefreshCw, X, Smartphone } from "lucide-react";
import { useEffect } from "react";
import { FormSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/app/o/$slug/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Fluxo" },
      { name: "description", content: "Ajuste tema, membros e tokens de integração da sua organização no Fluxo." },
    ],
  }),
  component: Config,
});

const EXAMPLE_BODY = `{
  "message": "Cliente pediu segunda via da fatura",
  "contact": { "name": "Maria", "phone": "+5511999999999" },
  "channel_kind": "whatsapp",
  "priority": "media"
}`;

function Config() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/configuracoes" });
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });

  const membersFn = useServerFn(listMembers);
  const { data: members } = useQuery({
    queryKey: ["members", org?.id], enabled: !!org?.id,
    queryFn: () => membersFn({ data: { orgId: org!.id } }),
  });

  const tokensFn = useServerFn(listWebhookTokens);
  const { data: tokens } = useQuery({
    queryKey: ["tokens", org?.id], enabled: !!org?.id,
    queryFn: () => tokensFn({ data: { orgId: org!.id } }),
  });

  const createTok = useServerFn(createWebhookToken);
  const deleteTok = useServerFn(deleteWebhookToken);
  const qc = useQueryClient();
  const [tokName, setTokName] = useState("");

  const createM = useMutation({
    mutationFn: () => createTok({ data: { orgId: org!.id, name: tokName } }),
    onSuccess: () => { setTokName(""); qc.invalidateQueries({ queryKey: ["tokens"] }); toast.success("Token criado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteTok({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tokens"] }); toast.success("Removido"); },
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!org) return <FormSkeleton sections={3} />;

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-4xl">
      <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
        <Settings2 className="h-5 w-5 text-primary" strokeWidth={2.2} /> Configurações
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground">Aparência, acessos e integrações desta organização.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard icon={Users} label="Total de membros" value={members?.length ?? "—"} />
        <StatCard icon={KeyRound} label="Tokens ativos" value={tokens?.length ?? "—"} tone="green" />
        <StatCard icon={Webhook} label="Canal de entrada" value="Webhook" tone="violet" />
      </div>

      <section className="mt-8">
        <SectionTitle icon={Palette} title="Aparência" hint="Escolha o tema desta interface. A preferência fica salva neste navegador." />
        <div className="card-elevated p-3.5">
          <ThemeToggleInline className="max-w-xs" />
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle icon={Users} title="Membros" hint="Quem tem acesso a esta organização." />
        <div className="card-elevated overflow-hidden">
          {members?.map((m: any) => (
            <div key={m.id} className="row-zebra flex items-center justify-between gap-3 border-b border-border p-3 last:border-0">
              <div className="min-w-0 truncate text-sm">{m.email ?? m.user_id}</div>
              <span className="shrink-0 rounded-md pill-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">{m.role}</span>
            </div>
          ))}
          {members?.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum membro.</div>}
        </div>
      </section>

      <WhatsappSection orgId={org.id} />

      <section className="mt-8">
        <SectionTitle icon={Webhook} title="Webhook — Entrada de demandas" hint="Aponte a Evolution API (ou qualquer sistema) para este endpoint. Cada mensagem vira uma demanda." />

        <div className="card-elevated space-y-2 p-4 font-mono text-xs">
          <div><span className="text-muted-foreground">POST</span> {origin}/api/public/ingest/<b>{"{token}"}</b></div>
          <div className="text-muted-foreground">Body:</div>
          <pre className="overflow-x-auto rounded-md bg-secondary/60 p-3">{EXAMPLE_BODY}</pre>
        </div>

        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tokName.trim()) createM.mutate(); }}>
          <input value={tokName} onChange={(e) => setTokName(e.target.value)} placeholder="Nome do token (ex: Evolution WhatsApp)"
            className="h-10 flex-1 min-w-0 rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          <button className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
            <Plus className="h-4 w-4" /> Gerar token
          </button>
        </form>

        <div className="card-elevated mt-4 overflow-hidden">
          {tokens?.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum token gerado ainda.</div>}
          {tokens?.map((t: any) => (
            <div key={t.id} className="row-zebra flex items-center gap-3 border-b border-border p-3 last:border-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg pill-green">
                <KeyRound className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t.name}</div>
                <code className="break-all text-xs text-muted-foreground">{t.token}</code>
              </div>
              <button title="Copiar" aria-label="Copiar token" onClick={() => { navigator.clipboard.writeText(t.token); toast.success("Copiado"); }}
                className="rounded-md p-2 hover:bg-secondary"><Copy className="h-4 w-4" /></button>
              <button title="Remover" aria-label="Remover token" onClick={() => deleteM.mutate(t.id)}
                className="rounded-md p-2 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const STATUS_META = {
  connected: { label: "Conectado", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  connecting: { label: "Conectando", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500 animate-pulse" },
  disconnected: { label: "Desconectado", cls: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
} as const;

function WhatsappSection({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getWhatsappConnection);
  const connectFn = useServerFn(connectWhatsapp);
  const disconnectFn = useServerFn(disconnectWhatsapp);
  const autoFn = useServerFn(setWhatsappAutoReply);
  const qc = useQueryClient();

  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);

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
      setQrOpen(false); setQr(null); setPairCode(null);
      qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] });
      toast.success("WhatsApp desconectado");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const auto = useMutation({
    mutationFn: (enabled: boolean) => autoFn({ data: { orgId, enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] }),
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (error) return null;

  return (
    <section className="mt-8">
      <SectionTitle icon={MessageCircle} title="Integração WhatsApp" hint="Conecte o WhatsApp desta organização lendo um QR Code. As mensagens entram e saem apenas por aqui." />
      {isLoading ? (
        <FormSkeleton sections={1} />
      ) : (
        <div className="card-elevated space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Smartphone className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
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
                <button type="button" disabled={connect.isPending || !conn?.service_ready} onClick={() => connect.mutate()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
                  {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                  Gerar QR Code / Conectar WhatsApp
                </button>
              )}
              {(status !== "disconnected" || conn?.instance_name) && (
                <button type="button" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-60">
                  {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
                  Desconectar / Excluir instância
                </button>
              )}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Resposta automática por IA</span>
              <span className="block text-xs text-muted-foreground">Quando ligado, o atendimento pode responder automaticamente.</span>
            </span>
            <button type="button" role="switch" aria-checked={!!conn?.auto_reply_enabled} aria-label="Resposta automática por IA"
              onClick={() => auto.mutate(!conn?.auto_reply_enabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${conn?.auto_reply_enabled ? "bg-primary" : "bg-secondary"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${conn?.auto_reply_enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>

          {conn?.webhook_url && (
            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Endereço de entrada configurado automaticamente</div>
              <code className="mt-1 block break-all text-xs">{conn.webhook_url}</code>
            </div>
          )}
        </div>
      )}

      {qrOpen && (
        <div role="dialog" aria-modal="true" aria-label="Conectar WhatsApp"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold">Conectar WhatsApp</h3>
                <p className="text-xs text-muted-foreground">No WhatsApp: Aparelhos conectados → Conectar aparelho.</p>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setQrOpen(false)} className="rounded-md p-1.5 hover:bg-secondary">
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

            <button type="button" disabled={connect.isPending} onClick={() => connect.mutate()}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold transition hover:bg-secondary disabled:opacity-60">
              {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Gerar novo QR Code
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
