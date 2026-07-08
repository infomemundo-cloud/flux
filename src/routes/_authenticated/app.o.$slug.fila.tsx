import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listDemandas, createDemanda } from "@/lib/demandas.functions";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { toast } from "sonner";
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
  { v: "resolvido", label: "Resolvido" },
  { v: "fechado", label: "Fechado" },
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
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fila de demandas</h1>
          <p className="text-sm text-muted-foreground">Tudo que precisa de acompanhamento.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nova demanda
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 items-center">
        {STATES.map((s) => (
          <button key={s.label} onClick={() => setState(s.v)}
            className={`px-3 py-1.5 rounded-full text-xs border ${state === s.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            {s.label}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar título..."
            className="h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm w-64" />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border overflow-hidden bg-card">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando...</div>}
        {data?.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma demanda encontrada.</div>}
        {data?.map((d: any) => (
          <Link key={d.id} to="/app/o/$slug/demandas/$id" params={{ slug, id: d.id }}
            className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition">
            <StateBadge state={d.state} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{d.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {d.contacts?.name || d.contacts?.phone || "Sem contato"} · atualizada {formatRelative(d.updated_at)}
              </div>
            </div>
            <PriorityBadge priority={d.priority} />
            {d.due_at && (
              <span className={`text-xs ${new Date(d.due_at) < new Date() && d.state !== "resolvido" && d.state !== "fechado" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                venc. {new Date(d.due_at).toLocaleDateString("pt-BR")}
              </span>
            )}
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
    onError: (e: any) => toast.error(e.message ?? "Erro"),
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