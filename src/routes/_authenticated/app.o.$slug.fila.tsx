import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ListSkeleton } from "@/components/skeletons";
import { listDemandas, createDemanda, markAllDemandasRead } from "@/lib/demandas/demandas.functions";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import {
  Plus,
  Search,
  X,
  PanelLeftOpen,
  Inbox,
  Filter,
  MessageCircle,
  Users,
  MoreHorizontal,
  CheckCheck,
  CheckCircle2,
} from "lucide-react";
import { formatRelative } from "@/components/demandas-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilaSidebarContext } from "@/lib/demandas/fila-sidebar-context";
import { useOrgSidebar } from "@/lib/org-sidebar-context";
import { resolveContactName } from "@/lib/demandas/resolve-contact-name";
import { ContactAvatar } from "@/components/contact-avatar";

export const Route = createFileRoute("/_authenticated/app/o/$slug/fila")({
  head: () => ({ meta: [{ title: "Fila — Fluxo" }] }),
  component: FilaPage,
});

const PAGE_SIZE = 20;

const STATES = [
  { v: undefined, label: "Todas" },
  { v: "novo", label: "Novo" },
  { v: "em_analise", label: "Em análise" },
  { v: "aguardando_cliente", label: "Aguardando cliente" },
  { v: "aguardando_revisao_humana", label: "Aguardando revisão" },
  { v: "concluido", label: "Concluído" },
] as const;

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

/** Cor do dot de estado no menu de filtro (mesmos tokens da borda do card). */
function stateDotColor(v: string | undefined): string {
  switch (v) {
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
      return "bg-muted-foreground/30";
  }
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
 * NÃO LIDO: superfície elevada (bg-card; no dark sobe pra bg-popover) +
 * ring visível + sombra profunda no dark + nome bold + prévia medium +
 * dot primário no avatar.
 * LIDO: superfície afundada (bg-muted/40; no dark black/20) + ring
 * transparente + sem sombra + pesos normais + sem dot.
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
            className={`flex shrink-0 items-center gap-1 text-[10px] tabular-nums ${
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

function FilaPage() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/fila" });
  const location = useLocation();
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });
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
  // Abas: "fila" = tudo em ordem de atividade; "atrasadas" = só SLA estourado.
  const [tab, setTab] = useState<"fila" | "atrasadas">("fila");
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

  const { data: result, isFetching } = useQuery({
    queryKey: ["demandas", org?.id, tab, state, debouncedSearch, limit],
    queryFn: () =>
      listFn({
        data: {
          orgId: org!.id,
          state: state as any,
          search: debouncedSearch || undefined,
          offset: 0,
          limit,
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
  const total = result?.total ?? 0;               // tamanho da aba atual (paginação)
  const scopeTotal = result?.scopeTotal ?? 0;     // badge da aba Fila (escopo)
  const overdueTotal = result?.overdueTotal ?? 0; // badge da aba Atrasadas
  const hasMore = data.length < total;
  const loadingFirstPage = isFetching && data.length === 0;

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

        {/* Coluna da Fila — largura ampliada pra caber abas + toolbar sem apertar */}
        {!collapsed && (
          <div
            className={`${hasSelection ? "hidden sm:flex" : "flex"} flex-col w-full sm:shrink-0 sm:w-[330px] lg:w-[360px] border-r border-border/50 bg-background`}
          >
            <div className="flex flex-col h-full">
              {/* Header: abas com contagens + toolbar de ações + nova demanda */}
              <div className="p-2.5 pb-2 shrink-0">
                <div className="flex items-center justify-between gap-1.5">
                  {/* Abas Fila / Atrasadas */}
                  <div className="flex items-center gap-0.5 rounded-xl bg-muted/70 p-1 min-w-0">
                    <button
                      onClick={() => setTab("fila")}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                        tab === "fila"
                          ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Fila
                      <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold tabular-nums text-primary">
                        {scopeTotal}
                      </span>
                    </button>
                    <button
                      onClick={() => setTab("atrasadas")}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                        tab === "atrasadas"
                          ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Atrasadas
                      <span
                        className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
                          overdueTotal > 0
                            ? "bg-[var(--pill-red-bg)] text-[var(--pill-red-fg)]"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {overdueTotal}
                      </span>
                    </button>
                  </div>

                  {/* Toolbar de ações + ação primária */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex items-center gap-0.5 rounded-xl bg-muted/70 p-1">
                      {/* Busca — ícone abre um popover com o campo, some quando fecha */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            title="Buscar"
                            aria-label="Buscar"
                            className="relative grid place-items-center h-7 w-7 rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground hover:shadow-sm"
                          >
                            <Search className="h-3.5 w-3.5" />
                            {search && (
                              <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 p-2">
                          <div className="relative">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input
                              autoFocus
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              placeholder="Buscar demanda ou contato..."
                              className="h-9 pl-8 pr-7 rounded-xl border border-border/60 bg-background text-xs w-full outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                            />
                            {search && (
                              <button
                                onClick={() => setSearch("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {/* Filtro de status — ícone abre menu, fecha sozinho ao escolher */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            title="Filtrar por status"
                            aria-label="Filtrar por status"
                            className="relative grid place-items-center h-7 w-7 rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground hover:shadow-sm"
                          >
                            <Filter className="h-3.5 w-3.5" />
                            {state && (
                              <span className={`absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full ${stateDotColor(state)}`} />
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl">
                          {STATES.map((s) => (
                            <DropdownMenuItem
                              key={s.label}
                              onClick={() => setState(s.v)}
                              className={`gap-2 text-xs cursor-pointer rounded-lg ${state === s.v ? "font-semibold text-primary" : ""}`}
                            >
                              <span className={`h-2 w-2 rounded-full shrink-0 ${stateDotColor(s.v)}`} />
                              {s.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* Mais opções — ações secundárias (a primária é o + ao lado) */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            title="Mais opções"
                            aria-label="Mais opções"
                            className="grid place-items-center h-7 w-7 rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground hover:shadow-sm"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                          <DropdownMenuItem
                            onClick={() => markAll.mutate()}
                            disabled={markAll.isPending || !org}
                            className="gap-2 text-xs cursor-pointer rounded-lg"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            {markAll.isPending ? "Marcando..." : "Marcar todas como lidas"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {/* Ação primária: nova demanda (visível, nunca escondida) */}
                    <button
                      onClick={() => setShowNew(true)}
                      title="Nova demanda"
                      aria-label="Nova demanda"
                      className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:brightness-110 hover:shadow-md active:scale-[0.96]"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista Rolável de Demandas */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2.5 pt-1 space-y-2">
                {loadingFirstPage && <ListSkeleton rows={6} />}

                {/* Vazio da aba Fila */}
                {!loadingFirstPage && tab === "fila" && data.length === 0 && (
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