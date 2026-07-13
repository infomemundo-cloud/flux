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
    <div className="p-4 sm:p-6 pb-24 sm:pb-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Fila de demandas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Tudo que precisa de acompanhamento.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="shrink-0 h-10 px-3 sm:px-4 rounded-md bg-primary text-primary-foreground font-medium inline-flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nova demanda</span><span className="sm:hidden">Nova</span>
        </button>
      </div>

      <div className="mt-4 sm:mt-6 flex gap-2 items-center overflow-x-auto sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {STATES.map((s) => (
          <button key={s.label} onClick={() => setState(s.v)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${state === s.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            {s.label}
          </button>
        ))}
        <div className="sm:ml-auto relative shrink-0">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar título..."
            className="h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm w-44 sm:w-64" />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border overflow-hidden bg-card">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando...</div>}
        {data?.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma demanda encontrada.</div>}
        {data?.map((d: any) => (
          <Link key={d.id} to="/app/o/$slug/demandas/$id" params={{ slug, id: d.id }}
            className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-center gap-x-3 gap-y-1 sm:gap-4 px-3 sm:px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition">
            <div className="min-w-0 sm:order-2 sm:flex-1">
              <div className="font-medium truncate text-sm sm:text-base">{d.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {d.contacts?.name || d.contacts?.phone || "Sem contato"} · atualizada {formatRelative(d.updated_at)}
              </div>
            </div>
            <div className="shrink-0 sm:order-1"><StateBadge state={d.state} /></div>
            <div className="col-span-2 flex items-center gap-3 sm:col-auto sm:order-3 sm:contents">
              <PriorityBadge priority={d.priority} />
              {d.due_at && (
                <span className={`text-xs ${new Date(d.due_at) < new Date() && d.state !== "resolvido" && d.state !== "fechado" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  venc. {new Date(d.due_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          </Link>
        ))}
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