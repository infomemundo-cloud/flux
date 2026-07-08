import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getOrgBySlug, listMembers } from "@/lib/orgs.functions";
import { listWebhookTokens, createWebhookToken, deleteWebhookToken } from "@/lib/demandas.functions";
import { toast } from "sonner";
import { Copy, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Fluxo" }] }),
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
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Membros</h2>
        <p className="text-sm text-muted-foreground">Quem tem acesso a esta organização.</p>
        <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
          {members?.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between p-3 border-b border-border last:border-0">
              <div className="text-sm">{m.email ?? m.user_id}</div>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{m.role}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Convites por e-mail chegam na próxima iteração.</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Webhook — Entrada de demandas</h2>
        <p className="text-sm text-muted-foreground">Aponte a Evolution API (ou qualquer sistema) para este endpoint. Cada mensagem vira uma demanda.</p>

        <div className="mt-4 rounded-lg border border-border bg-card p-4 space-y-2 font-mono text-xs">
          <div><span className="text-muted-foreground">POST</span> {origin}/api/public/ingest/<b>{"{token}"}</b></div>
          <div className="text-muted-foreground">Body:</div>
          <pre className="bg-secondary/50 p-3 rounded overflow-x-auto">{EXAMPLE_BODY}</pre>
        </div>

        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tokName.trim()) createM.mutate(); }}>
          <input value={tokName} onChange={(e) => setTokName(e.target.value)} placeholder="Nome do token (ex: Evolution WhatsApp)"
            className="flex-1 h-10 px-3 rounded-md border border-input bg-background" />
          <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground inline-flex items-center gap-2 font-medium">
            <Plus className="h-4 w-4" /> Gerar token
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {tokens?.map((t: any) => (
            <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{t.name}</div>
                <code className="text-xs text-muted-foreground break-all">{t.token}</code>
              </div>
              <button title="Copiar" onClick={() => { navigator.clipboard.writeText(t.token); toast.success("Copiado"); }}
                className="p-2 rounded-md hover:bg-secondary"><Copy className="h-4 w-4" /></button>
              <button title="Remover" onClick={() => deleteM.mutate(t.id)}
                className="p-2 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}