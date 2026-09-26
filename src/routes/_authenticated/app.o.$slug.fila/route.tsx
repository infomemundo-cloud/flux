import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ListSkeleton } from "@/components/skeletons";
import { listDemandas, createDemanda, markAllDemandasRead } from "@/lib/demandas/demandas.functions";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { getWhatsappConnection } from "@/lib/whatsapp.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import {
  X,
  PanelLeftOpen,
  Inbox,
  MessageCircle,
  Users,
  QrCode,
  Smartphone,
  CheckCircle2,
} from "lucide-react";
import { formatRelative } from "@/components/demandas-ui";
import { FilaSidebarContext } from "@/lib/demandas/fila-sidebar-context";
import { useOrgSidebar } from "@/lib/org-sidebar-context";
import { resolveContactName } from "@/lib/demandas/resolve-contact-name";
import { ContactAvatar } from "@/components/contact-avatar";
import { FilaHeaderToolbar, type FilaTab } from "./-components/fila-header-toolbar";

export const Route = createFileRoute("/_authenticated/app/o/$slug/fila")({
  head: () => ({ meta: [{ title: "Fila — Fluxo" }] }),
  component: FilaPage,
});

const PAGE_SIZE = 20;

function isOverdueDemanda(d: any) {
  return (
    d.state !== "concluido" &&
    d.due_at &&
    new Date(d.due_at) < new Date() &&
    d.state !== "aguardando_revisao_humana"
  );
}

/**
 * Última movimentação real = mais recente entre a última mensagem
 * (last_message_at) e qualquer update (updated_at). MESMA chave que o
 * servidor usa pra ordenar (activityOf) — posição e data visível nunca
 * discordam.
 */
function activityIso(d: any): string {
  const lm = typeof d.last_message_at === "string" ? d.last_message_at : "";
  const up = typeof d.updated_at === "string" ? d.updated_at : "";
  return lm > up ? lm : up;
}

/**
 * Borda lateral de 4px: SLA estourado SEMPRE vence (carmim); senão, cor do
 * estado do ticket. Tokens de estado (não paleta hardcoded) pra manter os
 * 3 temas do design system coerentes.
 */
function leftBorderColor(d: any): string {
  if (isOverdueDemanda(d)) return "bg-[var(--pill-red-fg)]";
  switch (d.state) {
    case "novo":
      return "bg-[var(--state-novo)]";
    case "em_analise":
      return "bg-[var(--state-analise)]";
    case "aguardando_cliente":
      return "bg-[var(--state-aguardando)]";
    case "aguardando_revisao_humana":
      return "bg-[var(--pill-violet-fg)]";
    case "concluido":
      return "bg-[var(--state-resolvido)]";
    default:
      return "bg-muted-foreground/40";
  }
}

/**
 * Card da fila — hierarquia por "contraste passivo" (estilo e-mail moderno),
 * válida nos 3 temas SEM hardcoded de paleta:
 * - NÃO LIDO: superfície elevada (bg-card; no dark sobe pra bg-popover) +
 *   ring visível + sombra profunda no dark + nome bold + prévia medium +
 *   dot primário no avatar.
 * - LIDO: superfície afundada (bg-muted/40; no dark black/20) + ring
 *   transparente + sem sombra + pesos normais + sem dot.
 */
function FilaCard({ d, slug }: { d: any; slug: string }) {
  const unread = !!d.unread;
  const contactName = resolveContactName(d);
  const isGroup = !!d.whatsapp_jid?.endsWith("@g.us");
  return (
    <Link
      to="/app/o/$slug/fila/demandas/$id"
      params={{ slug, id: d.id }}
      className={`group relative flex gap-3 overflow-hidden rounded-xl py-3 pl-4 pr-3 transition-all duration-150 ${
        unread
          ? "bg-card dark:bg-popover shadow-[var(--shadow-card)] ring-1 ring-border/60 dark:ring-white/10 dark:shadow-[0_4px_12px_oklch(0_0_0/0.5)] hover:shadow-[var(--shadow-pop)] hover:ring-primary/40"
          : "bg-muted/40 dark:bg-black/20 shadow-none ring-1 ring-transparent hover:bg-muted/60 dark:hover:bg-black/25"
      }`}
    >
      {/* Indicador lateral: SLA estourado (carmim) ou cor do estado */}
      <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${leftBorderColor(d)}`} />
      <div className="relative shrink-0">
        <ContactAvatar url={d.contacts?.avatar_url ?? null} name={contactName} tone="neutral" />
        {/* Dot discreto de NÃO LIDA — some quando a demanda é aberta */}
        {unread && (
          <span
            title="Não lida"
            aria-label="Não lida"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card dark:ring-popover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`truncate text-xs ${
              unread ? "font-bold text-foreground" : "font-medium text-muted-foreground dark:text-foreground/50"
            }`}
          >
            {contactName}
          </span>
          {/* Canal + horário: sutis, sem roubar o protagonismo da prévia */}
          <span
            className={`flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums ${
              unread ? "text-muted-foreground" : "text-muted-foreground/70"
            }`}
          >
            <span
              title={isGroup ? "Conversa em grupo" : "WhatsApp"}
              aria-label={isGroup ? "Conversa em grupo" : "WhatsApp"}
              className={unread ? "text-muted-foreground/80" : "text-muted-foreground/60"}
            >
              {isGroup ? <Users className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
            </span>
            {formatRelative(activityIso(d))}
          </span>
        </div>
        <div
          className={`mt-0.5 truncate text-[11px] ${
            unread
              ? "font-medium text-foreground/80"
              : "font-normal text-muted-foreground/70 dark:text-foreground/40"
          }`}
        >
          {d.last_message_preview || d.title}
        </div>
      </div>
    </Link>
  );
}

/**
 * Vazio da aba Fila SEMPRE contextualizado pra quem chega pela primeira vez:
 * com filtro/busca ativos → mensagem de filtro (comportamento antigo);
 * WhatsApp não conectado → onboarding com CTA pra Configurações (owner/admin);
 * demais papéis veem aviso neutro ("assim que um gestor conectar...");
 * conectado e vazio → "aguardando a primeira mensagem" (conforto, não dúvida).
 */
function FilaEmptyState({
  hasFilters,
  waStatus,
  canConfigure,
  slug,
}: {
  hasFilters: boolean;
  waStatus: string;
  canConfigure: boolean;
  slug: string;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 translate-y-2 scale-90 rounded-3xl bg-primary/10 blur-2xl" />
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-border/50">
            <Inbox className="h-7 w-7 text-primary" strokeWidth={1.6} />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-foreground">Nenhuma demanda encontrada</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Tente alterar os filtros de busca.</p>
        </div>
      </div>
    );
  }
  if (waStatus !== "connected") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 translate-y-2 scale-90 rounded-3xl bg-primary/10 blur-2xl" />
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-border/50">
            <Smartphone className="h-7 w-7 text-primary" strokeWidth={1.6} />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-foreground">Sua fila está pronta pra começar</div>
          <p className="mx-auto mt-1 max-w-[240px] text-[11px] text-muted-foreground">
            {canConfigure
              ? "Conecte o WhatsApp da empresa pra receber os primeiros chamados aqui na fila."
              : "Assim que um gestor conectar o WhatsApp da empresa, os chamados aparecem aqui."}
          </p>
        </div>
        {canConfigure && (
          <Link
            to="/app/o/$slug/configuracoes"
            params={{ slug }}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
          >
            <QrCode className="h-3.5 w-3.5" />
            Conectar WhatsApp
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 translate-y-2 scale-90 rounded-3xl bg-[var(--pill-green-bg)] blur-2xl" />
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-border/50">
          <MessageCircle className="h-7 w-7 text-[var(--pill-green-fg)]" strokeWidth={1.6} />
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-foreground">Tudo certo por aqui</div>
        <p className="mx-auto mt-1 max-w-[240px] text-[11px] text-muted-foreground">
          O WhatsApp está conectado. Assim que um cliente mandar a primeira mensagem, a demanda aparece nesta fila.
        </p>
      </div>
    </div>
  );
}

function FilaPage() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/fila" });
  const location = useLocation();
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });

  // Status da conexão WhatsApp pra mensagem de vazio correta (onboarding vs. espera).
  const connFn = useServerFn(getWhatsappConnection);
  const { data: conn } = useQuery({
    queryKey: ["whatsapp-connection", org?.id],
    enabled: !!org?.id,
    retry: false,
    queryFn: () => connFn({ data: { orgId: org!.id } }),
  });
  const waStatus = conn?.status ?? "disconnected";

  const hasSelection = location.pathname.includes("/fila/demandas/");
  const [collapsed, setCollapsed] = useState(false);
  const orgSidebar = useOrgSidebar();

  // Estado 2 (foco no atendimento): abrir uma demanda recolhe a sidebar
  // principal (ícones) e a fila junto. Estado 3 (retorno): fechar restaura as duas.
  useEffect(() => {
    setCollapsed(hasSelection);
    orgSidebar?.setCollapsed(hasSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSelection]);

  const listFn = useServerFn(listDemandas);
  const markAllFn = useServerFn(markAllDemandasRead);
  const qc = useQueryClient();

  // Abas: "fila" = escopo do papel (gestor: tudo; operador: suas+órfãs);
  // "minhas"/"orfas" = recortes de responsável; "atrasadas" = SLA estourado.
  const [tab, setTab] = useState<FilaTab>("fila");
  const [state, setState] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Paginação por LIMIT crescente (não por páginas cacheadas): cada clique em
  // "Mais demandas" refaz UMA query com limit = carregados + 20, devolvendo a
  // lista inteira de um único snapshot do servidor.
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Mudou aba/filtro/busca/org → volta pro primeiro "lote".
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [tab, state, debouncedSearch, org?.id]);

  const { data: result, isFetching, isLoading } = useQuery({
    queryKey: ["demandas", org?.id, tab, state, debouncedSearch, limit],
    queryFn: () =>
      listFn({
        data: {
          orgId: org!.id,
          state: state as any,
          search: debouncedSearch || undefined,
          offset: 0,
          limit,
          scope: tab === "minhas" ? "mine" : tab === "orfas" ? "orphan" : "all",
          overdueOnly: tab === "atrasadas",
        },
      }),
    enabled: !!org?.id,
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn({ data: { orgId: org!.id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["demandas"] });
      toast.success(`Tudo marcado como lido (${r.count} demandas).`);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  // Ordem 100% autoritativa do servidor (atividade recente) — um snapshot só.
  const data = result?.rows ?? [];
  const total = result?.total ?? 0; // tamanho da aba atual (paginação)
  const counts = result?.counts ?? { fila: 0, mine: 0, orphan: 0, overdue: 0 };
  const hasMore = data.length < total;

  // Skeleton SÓ no primeiro load (isLoading = ainda nunca houve resposta).
  // Refetch em background (poll/invalidação) não pisca mais a lista vazia —
  // era isso que fazia a fila "recarregar" visualmente a cada ~30s em org vazia.
  const loadingFirstPage = isLoading;

  return (
    <FilaSidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="relative flex h-screen overflow-hidden">
        {/* Botão flutuante pra reabrir — só existe quando a fila está recolhida. */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expandir fila"
            aria-label="Expandir fila"
            className="absolute top-3 left-3 z-10 grid place-items-center h-8 w-8 rounded-xl bg-card text-muted-foreground/70 shadow-[var(--shadow-card)] ring-1 ring-border/40 transition hover:text-foreground hover:shadow-[var(--shadow-pop)]"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        {/* Coluna da Fila — 360px no lg (toolbar extraída + cluster compacto
            cabem em linha única); sm mantém 330 e a strip rola se preciso. */}
        {!collapsed && (
          <div
            className={`${hasSelection ? "hidden sm:flex" : "flex"} flex-col w-full sm:shrink-0 sm:w-[330px] lg:w-[360px] border-r border-border/50 bg-background`}
          >
            <div className="flex flex-col h-full">
              {/* Header: barra de ferramentas isolada (abas + ações) */}
              <div className="p-2.5 pb-2 shrink-0">
                <FilaHeaderToolbar
                  tab={tab}
                  onTabChange={setTab}
                  counts={counts}
                  search={search}
                  onSearchChange={setSearch}
                  state={state}
                  onStateChange={setState}
                  canMarkAll={!!org}
                  markingAll={markAll.isPending}
                  onMarkAllRead={() => markAll.mutate()}
                  onNewDemanda={() => setShowNew(true)}
                />
              </div>
              {/* Lista Rolável de Demandas */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2.5 pt-1 space-y-2">
                {loadingFirstPage && <ListSkeleton rows={6} />}
                {/* Vazio da aba Fila — contextualizado pra primeira viagem */}
                {!loadingFirstPage && tab === "fila" && data.length === 0 && (
                  <FilaEmptyState
                    hasFilters={!!state || !!debouncedSearch}
                    waStatus={waStatus}
                    canConfigure={org?.role === "owner" || org?.role === "admin"}
                    slug={slug}
                  />
                )}
                {/* Vazio da aba Minhas */}
                {!loadingFirstPage && tab === "minhas" && data.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="relative">
                      <div className="absolute inset-0 -z-10 translate-y-2 scale-90 rounded-3xl bg-primary/10 blur-2xl" />
                      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-border/50">
                        <CheckCircle2 className="h-7 w-7 text-primary" strokeWidth={1.6} />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">Nenhuma demanda sua</div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Quando uma demanda for atribuída a você — ou você puxar uma da aba órfãs —, ela aparece aqui.
                      </p>
                    </div>
                  </div>
                )}
                {/* Vazio da aba Órfãs */}
                {!loadingFirstPage && tab === "orfas" && data.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="relative">
                      <div className="absolute inset-0 -z-10 translate-y-2 scale-90 rounded-3xl bg-[var(--pill-green-bg)] blur-2xl" />
                      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-border/50">
                        <CheckCircle2 className="h-7 w-7 text-[var(--pill-green-fg)]" strokeWidth={1.6} />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">Nenhuma demanda órfã</div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Toda demanda aberta tem um responsável. Bom trabalho de distribuição!
                      </p>
                    </div>
                  </div>
                )}
                {/* Vazio da aba Atrasadas */}
                {!loadingFirstPage && tab === "atrasadas" && data.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="relative">
                      <div className="absolute inset-0 -z-10 translate-y-2 scale-90 rounded-3xl bg-[var(--pill-green-bg)] blur-2xl" />
                      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-border/50">
                        <CheckCircle2 className="h-7 w-7 text-[var(--pill-green-fg)]" strokeWidth={1.8} />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">Nenhuma demanda atrasada</div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {state === "concluido"
                          ? "Demandas concluídas nunca estão atrasadas — remova o filtro de estado."
                          : "Tudo em dia por aqui. O time está vencendo o SLA."}
                      </p>
                    </div>
                  </div>
                )}
                {/* Cards da aba atual — ordem de atividade vinda do servidor */}
                {data.map((d: any) => (
                  <FilaCard key={d.id} d={d} slug={slug} />
                ))}
                {hasMore && !loadingFirstPage && (
                  <div className="py-2 flex justify-center">
                    <button
                      onClick={() => setLimit((l) => l + PAGE_SIZE)}
                      disabled={isFetching}
                      className="h-8 px-4 rounded-xl bg-card text-xs font-medium text-foreground shadow-[var(--shadow-card)] ring-1 ring-border/40 transition hover:shadow-[var(--shadow-pop)] hover:ring-primary/30 disabled:opacity-60"
                    >
                      {isFetching ? "Carregando..." : `Mais demandas (${data.length}/${total})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Área Principal de Detalhes da Demanda */}
        <div className={`${hasSelection ? "block" : "hidden sm:block"} flex-1 min-w-0 bg-card/20 overflow-hidden scrollbar-thin`}>
          {hasSelection ? (
            <Outlet />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="relative">
                <div className="absolute inset-0 -z-10 translate-y-3 scale-90 rounded-3xl bg-primary/10 blur-2xl" />
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-border/50">
                  <Inbox className="h-9 w-9 text-primary" strokeWidth={1.6} />
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight text-foreground">
                  Selecione uma demanda para começar
                </div>
                <p className="mt-1.5 max-w-[260px] text-sm text-muted-foreground">
                  Escolha uma conversa na lista à esquerda para ver o histórico e responder com contexto.
                </p>
              </div>
            </div>
          )}
        </div>
        {showNew && org && <NewDemandaModal orgId={org.id} onClose={() => setShowNew(false)} />}
      </div>
    </FilaSidebarContext.Provider>
  );
}

function NewDemandaModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const create = useServerFn(createDemanda);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta" | "urgente">("media");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [dueAt, setDueAt] = useState("");
  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          orgId,
          title,
          description: description || undefined,
          priority,
          contact_name: contactName || undefined,
          contact_phone: contactPhone || undefined,
          due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demandas"] });
      toast.success("Demanda criada");
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl w-full max-w-lg p-5 shadow-[var(--shadow-pop)] ring-1 ring-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">Nova demanda</h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <input
            required
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-border/60 bg-background text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
          <textarea
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-20 p-3 rounded-xl border border-border/60 bg-background text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Nome do contato"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="h-10 px-3 rounded-xl border border-border/60 bg-background text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
            <input
              placeholder="Telefone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="h-10 px-3 rounded-xl border border-border/60 bg-background text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="h-10 px-3 rounded-xl border border-border/60 bg-background text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            >
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-10 px-3 rounded-xl border border-border/60 bg-background text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button
            disabled={m.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-md shadow-primary/20 transition hover:brightness-110 hover:shadow-lg disabled:opacity-60"
          >
            {m.isPending ? "Criando..." : "Criar demanda"}
          </button>
        </form>
      </div>
    </div>
  );
}