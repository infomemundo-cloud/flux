import { createFileRoute, Navigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getOrgBySlug, listMembers } from "@/lib/orgs.functions";
import { listWebhookTokens, createWebhookToken, deleteWebhookToken } from "@/lib/demandas/webhook-tokens.functions";
import { getWhatsappConnection, connectWhatsapp, disconnectWhatsapp, setWhatsappAutoReply } from "@/lib/whatsapp.functions";
import {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  type QuickReply,
} from "@/lib/quick-replies.functions";
import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle, StatCard } from "@/components/section-ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Copy, Trash2, Plus, Users, KeyRound, Webhook, Settings2, MessageCircle, Loader2,
  QrCode, PowerOff, RefreshCw, X, Smartphone, Eye, EyeOff, Tags, CreditCard, SlidersHorizontal, Shuffle,
  Zap, Pencil, Save,
} from "lucide-react";
import { FormSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/app/o/$slug/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Fluxo" },
      { name: "description", content: "Ajuste membros e integrações da sua organização no Fluxo." },
    ],
  }),
  component: Config,
});

const EXAMPLE_BODY = `{ "message": "Cliente pediu segunda via da fatura", "contact": { "name": "Maria", "phone": "+5511999999999" }, "channel_kind": "whatsapp", "priority": "media" }`;

/** Mostra só o começo/fim do token por padrão — é um segredo de verdade. */
function maskToken(token: string) {
  if (token.length <= 12) return token;
  return `${token.slice(0, 7)}${"•".repeat(10)}${token.slice(-4)}`;
}

/** Estado "em breve" reutilizável pras abas que ainda não existem de verdade. */
function ComingSoon({ icon: Icon, title, description }: { icon: typeof Tags; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      <span className="mt-3 inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}

/** Seção estática de Distribuição Automática de Demandas */
function AutomaticDistributionSection() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [distributionMode, setDistributionMode] = useState<"round-robin" | "lowest-load">("round-robin");
  const handleSave = () => {
    console.log("Salvando configurações de distribuição:", { isEnabled, distributionMode });
    toast.success("Configurações de distribuição salvas com sucesso!");
  };
  return (
    <div className="card-elevated space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Shuffle className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div>
          <h3 className="text-base font-semibold">Distribuição Automática de Demandas</h3>
          <p className="text-sm text-muted-foreground">
            Atribua novas demandas recebidas via WhatsApp automaticamente entre os membros da equipe.
          </p>
        </div>
      </div>
      <div className="space-y-4 pt-2">
        {/* Toggle Switch */}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-4 cursor-pointer hover:bg-secondary/30 transition-colors">
          <div className="min-w-0">
            <span className="block text-sm font-semibold">Ativar distribuição automática</span>
            <span className="block text-xs text-muted-foreground">
              Quando ligado, as novas demandas serão distribuídas conforme a regra selecionada abaixo.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label="Ativar distribuição automática"
            onClick={() => setIsEnabled(!isEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${isEnabled ? "bg-primary" : "bg-secondary"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
                isEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </label>
        {/* Modo de Distribuição (visualmente desabilitado quando o toggle está off) */}
        <div className={`space-y-3 transition-all duration-300 ${isEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
          <span className="block text-sm font-medium text-muted-foreground">Modo de Distribuição</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all ${
                distributionMode === "round-robin"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-secondary/30"
              }`}
            >
              <input
                type="radio"
                name="distributionMode"
                value="round-robin"
                checked={distributionMode === "round-robin"}
                onChange={() => setDistributionMode("round-robin")}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="min-w-0">
                <span className="block text-sm font-semibold">Round-Robin (Revezamento)</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  Distribui as demandas em fila circular sequencial entre os operadores.
                </span>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all ${
                distributionMode === "lowest-load"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-secondary/30"
              }`}
            >
              <input
                type="radio"
                name="distributionMode"
                value="lowest-load"
                checked={distributionMode === "lowest-load"}
                onChange={() => setDistributionMode("lowest-load")}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="min-w-0">
                <span className="block text-sm font-semibold">Menor Carga de Trabalho</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  Atribui para o operador com menor número de demandas em aberto.
                </span>
              </div>
            </label>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}

/** CRUD completo de macros (respostas rápidas) da organização */
function MacrosSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listQuickReplies);
  const createFn = useServerFn(createQuickReply);
  const updateFn = useServerFn(updateQuickReply);
  const deleteFn = useServerFn(deleteQuickReply);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editContent, setEditContent] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newContent, setNewContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: macros, isLoading } = useQuery({
    queryKey: ["quick-replies", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { orgId, label: newLabel.trim(), content: newContent.trim() } }),
    onSuccess: () => {
      setNewLabel("");
      setNewContent("");
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro criada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const update = useMutation({
    mutationFn: () => updateFn({ data: { id: editingId!, label: editLabel.trim(), content: editContent.trim() } }),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro atualizada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro excluída");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const startEdit = (m: QuickReply) => {
    setEditingId(m.id);
    setEditLabel(m.label);
    setEditContent(m.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditContent("");
  };

  const filtered = (macros ?? []).filter((m) => {
    const q = search.trim().toLowerCase();
    return !q || m.label.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
  });

  return (
    <section className="space-y-6">
      <SectionTitle
        icon={Zap}
        title="Macros / Respostas Rápidas"
        hint="Textos prontos que a equipe usa no composer (gatilho '/' ou botão de atalho). Compartilhadas por toda a organização."
      />
      {/* Form de criação */}
      <div className="card-elevated space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Criar nova macro</span>
        </div>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nome da macro (ex: boas-vindas, prazo)"
          maxLength={60}
          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Texto que será inserido no composer..."
          rows={3}
          maxLength={4000}
          className="w-full rounded-lg border border-border bg-card p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!newLabel.trim() || !newContent.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar macro
          </button>
        </div>
      </div>
      {/* Lista de macros */}
      <div className="card-elevated overflow-hidden">
        <div className="border-b border-border p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou conteúdo..."
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {macros?.length === 0 ? "Nenhuma macro criada ainda." : "Nenhuma macro encontrada."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((m) => (
              <div key={m.id} className="p-4">
                {editingId === m.id ? (
                  <div className="space-y-3">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Nome da macro"
                      maxLength={60}
                      className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Conteúdo da macro"
                      rows={3}
                      maxLength={4000}
                      className="w-full rounded-lg border border-border bg-card p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!editLabel.trim() || !editContent.trim() || update.isPending}
                        onClick={() => update.mutate()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                      >
                        {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Zap className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{m.label}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.content}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        Criada em {new Date(m.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Editar"
                        aria-label="Editar macro"
                        onClick={() => startEdit(m)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {confirmDeleteId === m.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(m.id)}
                            className="h-8 px-2.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-60"
                          >
                            {remove.isPending ? "..." : "Confirmar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-8 px-2.5 rounded-lg border border-border text-xs hover:bg-secondary"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          title="Excluir"
                          aria-label="Excluir macro"
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Config() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/configuracoes" });
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });

  // Página restrita: a UI esconde o link, e aqui a rota devolve pra Fila
  // se alguém colar a URL direto no navegador.
  const isOwnerOrAdmin = org?.role === "owner" || org?.role === "admin";

  const membersFn = useServerFn(listMembers);
  const { data: members } = useQuery({
    queryKey: ["members", org?.id],
    enabled: !!org?.id && isOwnerOrAdmin,
    queryFn: () => membersFn({ data: { orgId: org!.id } }),
  });
  const tokensFn = useServerFn(listWebhookTokens);
  const { data: tokens } = useQuery({
    queryKey: ["tokens", org?.id],
    enabled: !!org?.id && isOwnerOrAdmin,
    queryFn: () => tokensFn({ data: { orgId: org!.id } }),
  });
  const createTok = useServerFn(createWebhookToken);
  const deleteTok = useServerFn(deleteWebhookToken);
  const qc = useQueryClient();
  const [tokName, setTokName] = useState("");
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(new Set());
  const [confirmDeleteTokenId, setConfirmDeleteTokenId] = useState<string | null>(null);
  const toggleReveal = (id: string) =>
    setRevealedTokens((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const createM = useMutation({
    mutationFn: () => createTok({ data: { orgId: org!.id, name: tokName } }),
    onSuccess: () => { setTokName(""); qc.invalidateQueries({ queryKey: ["tokens"] }); toast.success("Token criado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteTok({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tokens"] }); toast.success("Removido"); setConfirmDeleteTokenId(null); },
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!org) return <FormSkeleton sections={3} />;
  if (!isOwnerOrAdmin) return <Navigate to="/app/o/$slug/fila" params={{ slug }} />;

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-4xl">
      <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
        <Settings2 className="h-5 w-5 text-primary" strokeWidth={2.2} /> Configurações
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground">Acessos, atendimento e integrações desta organização.</p>
      <Tabs defaultValue="geral" className="mt-6">
        <div className="overflow-x-auto scrollbar-thin">
          <TabsList>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="integracoes">Integrações</TabsTrigger>
            <TabsTrigger value="etapas">Etapas do Atendimento</TabsTrigger>
            <TabsTrigger value="macros">Macros</TabsTrigger>
            <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
          </TabsList>
        </div>
        {/* Geral — visão rápida, sem duplicar a página de Equipe */}
        <TabsContent value="geral" className="mt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={Users} label="Total de membros" value={members?.length ?? "—"} />
            <StatCard icon={KeyRound} label="Tokens ativos" value={tokens?.length ?? "—"} tone="green" />
            <StatCard icon={Webhook} label="Canal de entrada" value="Webhook" tone="violet" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Pra convidar, aprovar ou trocar o papel de alguém, use a página <b>Equipe</b> no menu lateral.
          </p>
        </TabsContent>
        {/* WhatsApp */}
        <TabsContent value="whatsapp" className="mt-5">
          <WhatsappSection orgId={org.id} />
        </TabsContent>
        {/* Integrações — webhook de entrada */}
        <TabsContent value="integracoes" className="mt-5">
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
            {tokens?.map((t: any) => {
              const revealed = revealedTokens.has(t.id);
              return (
                <div key={t.id} className="row-zebra flex flex-wrap items-center gap-3 border-b border-border p-3 last:border-0">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg pill-green">
                    <KeyRound className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{t.name}</div>
                    <code className="break-all text-xs text-muted-foreground">{revealed ? t.token : maskToken(t.token)}</code>
                  </div>
                  <button title={revealed ? "Ocultar token" : "Revelar token"} aria-label={revealed ? "Ocultar token" : "Revelar token"}
                    onClick={() => toggleReveal(t.id)} className="rounded-md p-2 hover:bg-secondary shrink-0">
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button title="Copiar" aria-label="Copiar token" onClick={() => { navigator.clipboard.writeText(t.token); toast.success("Copiado"); }}
                    className="rounded-md p-2 hover:bg-secondary shrink-0"><Copy className="h-4 w-4" /></button>
                  {confirmDeleteTokenId === t.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => deleteM.mutate(t.id)} disabled={deleteM.isPending}
                        className="h-8 px-2.5 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-60">
                        {deleteM.isPending ? "..." : "Confirmar"}
                      </button>
                      <button onClick={() => setConfirmDeleteTokenId(null)} className="h-8 px-2.5 rounded-md border border-border text-xs hover:bg-secondary">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button title="Remover" aria-label="Remover token" onClick={() => setConfirmDeleteTokenId(t.id)}
                      className="rounded-md p-2 text-destructive hover:bg-destructive/10 shrink-0"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
        {/* Etapas do Atendimento */}
        <TabsContent value="etapas" className="mt-5 space-y-6">
          <SectionTitle icon={SlidersHorizontal} title="Etapas do Atendimento" hint="Nomeie e escolha a cor de cada etapa da sua fila, do seu jeito." />
          <AutomaticDistributionSection />
          <ComingSoon
            icon={Tags}
            title="Personalize as etapas"
            description="Em breve você vai poder renomear e escolher a cor de cada etapa (hoje: Novo, Em análise, Aguardando cliente, Aguardando revisão, Concluído) pra combinar com o seu negócio — por exemplo, 'Novo Lead' em vez de 'Novo', numa loja que vende pelo WhatsApp."
          />
        </TabsContent>
        {/* Macros / Respostas Rápidas */}
        <TabsContent value="macros" className="mt-5">
          <MacrosSection orgId={org.id} />
        </TabsContent>
        {/* Faturamento — módulo financeiro, ainda não existe */}
        <TabsContent value="faturamento" className="mt-5">
          <SectionTitle icon={CreditCard} title="Faturamento" hint="Plano atual e histórico de cobranças desta organização." />
          <ComingSoon
            icon={CreditCard}
            title="Plano e cobrança"
            description="Em breve você vai poder ver seu plano atual, mudar de plano e consultar o histórico de cobranças por aqui."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const STATUS_META = {
  connected: { label: "Conectado", pill: "pill-green" },
  connecting: { label: "Conectando", pill: "pill-amber" },
  disconnected: { label: "Desconectado", pill: "pill-red" },
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
      setQrOpen(false); setQr(null); setPairCode(null); setConfirmDisconnect(false);
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
    <section>
      <SectionTitle icon={MessageCircle} title="Integração WhatsApp" hint="Conecte o WhatsApp desta organização lendo um QR Code. As mensagens entram e saem apenas por aqui." />
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
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "connecting" ? "animate-pulse" : ""}`} /> {meta.label}
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
                confirmDisconnect ? (
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-xs text-muted-foreground">Desconectar?</span>
                    <button type="button" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition disabled:opacity-60">
                      {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
                    </button>
                    <button type="button" onClick={() => setConfirmDisconnect(false)}
                      className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-secondary">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDisconnect(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/10">
                    <PowerOff className="h-4 w-4" />
                    Desconectar / Excluir instância
                  </button>
                )
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