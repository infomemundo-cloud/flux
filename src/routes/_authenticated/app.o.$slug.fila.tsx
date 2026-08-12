import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listDemandas, createDemanda } from "@/lib/demandas.functions";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Plus, Search, X } from "lucide-react";
import { StateBadge, PriorityBadge, formatRelative } from "@/components/demandas-ui";

export const Route = createFileRoute("/_authenticated/app/o/$slug/fila")({
  head: () => ({ meta: [{ title: "Fila — Fluxo" }] }),
  component: FilaPage,
});

const STATES = [
  { v: undefined, label: "Todas" },
  { v: "novo", label: "Novo" },
  { v: "em_analise", label: "Em análise" },
  { v: "aguardando_cliente", label: "Aguardando cliente" },
  { v: "aguardando_revisao_humana", label: "Aguard. revisão" },
  { v: "concluido", label: "Concluído" },
] as const;

function FilaPage() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/fila" });
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });

  const listFn = useServerFn(listDemandas);
  const [state, setState] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["demandas", org?.id, state, search],
    queryFn: () => listFn({ data: { orgId: org!.id, state: state as any, search: search || undefined } }),
    enabled: !!org?.id,
  });

  return (
    <div className="p-4 sm:p-8 pb-24 sm:pb-10 max-w-6xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight truncate">Fila de demandas</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Tudo que precisa de acompanhamento{typeof data?.length === "number" ? ` · ${data.length} ${data.length === 1 ? "demanda" : "demandas"}` : ""}.
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="shrink-0 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 shadow-[0_6px_16px_-6px_var(--primary)] hover:brightness-110 active:scale-[0.98] transition">
          <Plus className="h-4 w-4" strokeWidth={2.4} /> <span className="hidden sm:inline">Nova demanda</span><span className="sm:hidden">Nova</span>
        </button>
      </div>

      <div className="mt-5 sm:mt-6 flex flex-col-reverse sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1.5 items-center overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-0.5 sm:flex-wrap">
          {STATES.map((s) => (
            <button key={s.label} onClick={() => setState(s.v)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${state === s.v ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto relative shrink-0">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título..."
            className="h-10 pl-9 pr-9 rounded-xl border border-border bg-card text-sm w-full sm:w-72 shadow-[var(--shadow-card)] outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10 transition" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {isLoading && [0, 1, 2].map((i) => <div key={i} className="h-[76px] rounded-xl bg-card border border-border animate-pulse" />)}
        {data?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
            <div className="text-sm font-semibold">Nenhuma demanda encontrada</div>
            <p className="mt-1 text-[13px] text-muted-foreground">Ajuste os filtros ou crie uma nova demanda.</p>
          </div>
        )}
        {data?.map((d: any) => {
          const overdue = d.due_at && new Date(d.due_at) < new Date() && d.state !== "aguardando_revisao_humana" && d.state !== "concluido";
          return (
            <Link key={d.id} to="/app/o/$slug/demandas/$id" params={{ slug, id: d.id }}
              className="group block rounded-xl bg-card border border-border shadow-[var(--shadow-card)] px-4 py-3.5 hover:border-primary/40 hover:shadow-[var(--shadow-pop)] transition-all">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StateBadge state={d.state} />
                    <PriorityBadge priority={d.priority} />
                    {overdue && <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">atrasada</span>}
                  </div>
                  <div className="mt-2 font-semibold text-[15px] leading-snug truncate group-hover:text-primary transition-colors">{d.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">
                    {d.contacts?.name || d.contacts?.phone || "Sem contato"} · atualizada {formatRelative(d.updated_at)}
                  </div>
                </div>
                {d.due_at && (
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencimento</div>
                    <div className={`text-xs font-semibold ${overdue ? "text-destructive" : "text-foreground"}`}>
                      {new Date(d.due_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {showNew && org && <NewDemandaModal orgId={org.id} onClose={() => setShowNew(false)} />}
    </div>
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
    mutationFn: () => create({ data: {
      orgId, title, description: description || undefined, priority,
      contact_name: contactName || undefined, contact_phone: contactPhone || undefined,
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
    }}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["demandas"] }); toast.success("Demanda criada"); onClose(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Nova demanda</h2>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <input required placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background" />
          <textarea placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-24 p-3 rounded-md border border-input bg-background" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nome do contato" value={contactName} onChange={(e) => setContactName(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background" />
            <input placeholder="Telefone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={priority} onChange={(e) => setPriority(e.target.value as any)}
              className="h-10 px-3 rounded-md border border-input bg-background">
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background" />
          </div>
          <button disabled={m.isPending} className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-60">
            {m.isPending ? "Criando..." : "Criar demanda"}
          </button>
        </form>
      </div>
    </div>
  );
}