import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getOrgBySlug, listMembers } from "@/lib/orgs.functions";
import { listWebhookTokens, createWebhookToken, deleteWebhookToken } from "@/lib/demandas.functions";
import { SectionTitle, StatCard } from "@/components/section-ui";
import { ThemeToggleInline } from "@/components/user-menu";
import { toast } from "sonner";
import { Copy, Trash2, Plus, Users, KeyRound, Webhook, Palette, Settings2 } from "lucide-react";

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
