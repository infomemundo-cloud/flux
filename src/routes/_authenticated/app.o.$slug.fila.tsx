import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ListSkeleton } from "@/components/skeletons";
import { listDemandas, createDemanda } from "@/lib/demandas/demandas.functions";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Plus, Search, X, PanelLeftOpen, Inbox, Filter } from "lucide-react";
import { formatRelative } from "@/components/demandas-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilaSidebarContext } from "@/lib/demandas/fila-sidebar-context";
import { useOrgSidebar } from "@/lib/org-sidebar-context";
import { STATE_COLOR } from "@/lib/demandas/state-colors";
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
  const [state, setState] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [pages, setPages] = useState<Record<number, any[]>>({});
  const [assignees, setAssignees] = useState<Record<string, any>>({});
  const [total, setTotal] = useState(0);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
    setPages({});
  }, [state, debouncedSearch, org?.id]);

  const { data: result, isFetching } = useQuery({
    queryKey: ["demandas", org?.id, state, debouncedSearch, offset],
    queryFn: () =>
      listFn({
        data: { orgId: org!.id, state: state as any, search: debouncedSearch || undefined, offset, limit: PAGE_SIZE },
      }),
    enabled: !!org?.id,
  });

  useEffect(() => {
    if (!result) return;
    setPages((prev) => ({ ...prev, [offset]: result.rows }));
    setAssignees((prev) => ({ ...prev, ...result.assignees }));
    setTotal(result.total);
  }, [result, offset]);

  const loadedRows = Object.keys(pages)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((k) => pages[k]);

  // Atrasadas sobem pro topo, sem precisar de filtro — o resto mantém a
  // ordem de chegada porque Array.sort é estável (JS garante isso desde 2019).
  const data = [...loadedRows].sort(
    (a, b) => Number(isOverdueDemanda(b)) - Number(isOverdueDemanda(a)),
  );
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
            className="absolute top-3 left-3 z-10 grid place-items-center h-8 w-8 rounded-lg bg-card border border-border shadow-sm text-muted-foreground/70 hover:bg-secondary hover:text-foreground transition"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Coluna da Fila — não renderiza nada quando recolhida (sem trilho vazio) */}
        {!collapsed && (
          <div
            className={`${hasSelection ? "hidden sm:flex" : "flex"} flex-col w-full sm:shrink-0 sm:w-[300px] lg:w-[320px] border-r border-border/60 bg-background`}
          >
            <div className="flex flex-col h-full">
              <div className="p-3.5 border-b border-border bg-card shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Inbox className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <h1 className="text-base font-bold tracking-tight text-foreground truncate">Fila</h1>
                    {total > 0 && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary shrink-0">
                        {total}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Busca — ícone abre um popover com o campo, some quando fecha */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          title="Buscar"
                          aria-label="Buscar"
                          className="relative grid place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                        >
                          <Search className="h-4 w-4" />
                          {search && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />}
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
                            className="h-9 pl-8 pr-7 rounded-lg border border-border bg-background text-xs w-full outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition"
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
                          className="relative grid place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                        >
                          <Filter className="h-4 w-4" />
                          {state && <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${STATE_COLOR[state] ?? "bg-primary"}`} />}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {STATES.map((s) => (
                          <DropdownMenuItem
                            key={s.label}
                            onClick={() => setState(s.v)}
                            className={`gap-2 text-xs cursor-pointer ${state === s.v ? "font-semibold text-primary" : ""}`}
                          >
                            <span className={`h-2 w-2 rounded-full shrink-0 ${s.v ? STATE_COLOR[s.v] ?? "bg-muted-foreground/40" : "bg-muted-foreground/30"}`} />
                            {s.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Nova demanda — só ícone, fica no canto */}
                    <button
                      onClick={() => setShowNew(true)}
                      title="Nova demanda"
                      aria-label="Nova demanda"
                      className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.98] transition"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista Rolável de Demandas */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
                {loadingFirstPage && <ListSkeleton rows={6} />}
                {!loadingFirstPage && data.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center my-4">
                    <div className="text-xs font-semibold">Nenhuma demanda encontrada</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Tente alterar os filtros de busca.</p>
                  </div>
                )}

                {/* Card no formato combinado: avatar+pip, nome, hora, prévia da última mensagem. */}
                {data.map((d: any) => {
                  const overdue = isOverdueDemanda(d);
                  const urgent = d.priority === "urgente";
                  const flagged = d.state !== "concluido" && (urgent || overdue);
                  const contactName = resolveContactName(d);
                  const stateColor = STATE_COLOR[d.state] ?? "bg-muted-foreground/40";
                  return (
                    <Link
                      key={d.id}
                      to="/app/o/$slug/fila/demandas/$id"
                      params={{ slug, id: d.id }}
                      className="group relative flex gap-2.5 overflow-hidden rounded-lg bg-card border border-border/70 pl-3 pr-2.5 py-2.5 transition-all hover:shadow-sm hover:border-primary/40"
                    >
                      <span className={`absolute left-0 top-0 h-full w-[3px] ${stateColor}`} />
                      <div className="relative shrink-0">
                        <ContactAvatar url={d.contacts?.avatar_url ?? null} name={contactName} tone="neutral" />
                        {flagged && (
                          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-foreground">{contactName}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatRelative(d.last_message_at ?? d.updated_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {d.last_message_preview || d.title}
                        </div>
                      </div>
                    </Link>
                  );
                })}

                {hasMore && !loadingFirstPage && (
                  <div className="py-2 flex justify-center">
                    <button
                      onClick={() => setOffset((o) => o + PAGE_SIZE)}
                      disabled={isFetching}
                      className="h-8 px-4 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition disabled:opacity-60"
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
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center">
                <Inbox className="h-6 w-6 text-primary" strokeWidth={1.8} />
              </div>
              <div className="text-sm font-semibold text-foreground">Selecione uma demanda para começar</div>
              <p className="text-[13px] text-muted-foreground max-w-[240px]">
                Escolha uma conversa na lista à esquerda para ver o histórico e responder.
              </p>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">Nova demanda</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <input
            required
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs outline-none focus:border-primary"
          />
          <textarea
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-20 p-3 rounded-md border border-input bg-background text-xs outline-none focus:border-primary"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Nome do contato"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs outline-none focus:border-primary"
            />
            <input
              placeholder="Telefone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs outline-none focus:border-primary"
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
              className="h-9 px-3 rounded-md border border-input bg-background text-xs outline-none focus:border-primary"
            />
          </div>
          <button
            disabled={m.isPending}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60 hover:brightness-110 transition"
          >
            {m.isPending ? "Criando..." : "Criar demanda"}
          </button>
        </form>
      </div>
    </div>
  );
}