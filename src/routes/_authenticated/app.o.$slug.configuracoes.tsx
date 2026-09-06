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

const INPUT_CLS =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function WhatsappSection({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getWhatsappSettings);
  const saveFn = useServerFn(saveWhatsappSettings);
  const testFn = useServerFn(testWhatsappConnection);
  const qc = useQueryClient();

  const { data: cfg, isLoading, error } = useQuery({
    queryKey: ["whatsapp-settings", orgId],
    queryFn: () => getFn({ data: { orgId } }),
    retry: false,
  });

  const [baseUrl, setBaseUrl] = useState("");
  const [instance, setInstance] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    setBaseUrl(cfg.base_url);
    setInstance(cfg.instance_name);
    setAuto(cfg.auto_reply_enabled);
  }, [cfg]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { orgId, base_url: baseUrl, instance_name: instance, api_key: apiKey || undefined, auto_reply_enabled: auto } }),
    onSuccess: () => { setApiKey(""); qc.invalidateQueries({ queryKey: ["whatsapp-settings", orgId] }); toast.success("Integração salva"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { orgId } }),
    onSuccess: (r: any) => (r?.ok ? toast.success(r.message) : toast.error(r?.message ?? "Falha no teste")),
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (error) return null;

  return (
    <section className="mt-8">
      <SectionTitle icon={MessageCircle} title="Integração WhatsApp" hint="Conecte seu WhatsApp para receber e responder mensagens direto nas demandas." />
      {isLoading ? (
        <FormSkeleton sections={1} />
      ) : (
        <form className="card-elevated space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Endereço do serviço</span>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.evolution.com" className={INPUT_CLS} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Nome da instância</span>
              <input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="minha-instancia" className={INPUT_CLS} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                Chave de acesso {cfg?.has_api_key && <span className="font-normal">(já salva — preencha só para trocar)</span>}
              </span>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off"
                placeholder={cfg?.has_api_key ? "••••••••" : "Chave global / token da instância"} className={INPUT_CLS} />
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Integração ativa / resposta automática por IA</span>
              <span className="block text-xs text-muted-foreground">Quando ligado, o atendimento pode responder automaticamente.</span>
            </span>
            <button type="button" role="switch" aria-checked={auto} aria-label="Integração ativa" onClick={() => setAuto((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${auto ? "bg-primary" : "bg-secondary"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${auto ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>

          <div className="flex flex-wrap gap-2">
            <button disabled={save.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              Salvar
            </button>
            <button type="button" disabled={test.isPending} onClick={() => test.mutate()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold transition hover:bg-secondary disabled:opacity-60">
              {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Testar conexão
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
