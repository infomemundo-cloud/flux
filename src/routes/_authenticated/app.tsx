import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMyOrgs, createOrg } from "@/lib/orgs.functions";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Suas organizações — Fluxo" }] }),
  component: OrgPicker,
});

function OrgPicker() {
  const location = useLocation();
  const navigate = useNavigate();
  const list = useServerFn(listMyOrgs);
  const create = useServerFn(createOrg);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["my-orgs"], queryFn: () => list() });
  const m = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
      toast.success("Organização criada");
      navigate({ to: "/app/o/$slug/fila", params: { slug: org.slug } });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  if (location.pathname.replace(/\/$/, "") !== "/app") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl mt-16">
        <div className="flex items-center gap-2 font-semibold mb-8">
          <span className="inline-block h-7 w-7 rounded-md bg-primary" /> Fluxo
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Suas organizações</h1>
        <p className="text-sm text-muted-foreground mt-1">Escolha uma para abrir o painel, ou crie uma nova.</p>

        <div className="mt-6 space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
          {data?.length === 0 && <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center">Você ainda não pertence a nenhuma organização.</div>}
          {data?.map(({ org, role }) => (
            <Link key={org.id} to="/app/o/$slug/fila" params={{ slug: org.slug }}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/40 transition">
              <div>
                <div className="font-medium">{org.name}</div>
                <div className="text-xs text-muted-foreground">/{org.slug} · {role}</div>
              </div>
              <span className="text-primary text-sm">Abrir →</span>
            </Link>
          ))}
        </div>

        <form className="mt-8 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.mutate(name.trim()); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da nova organização"
            className="flex-1 h-10 px-3 rounded-md border border-input bg-background" />
          <button disabled={m.isPending} className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium inline-flex items-center gap-2 disabled:opacity-60">
            <Plus className="h-4 w-4" /> Criar
          </button>
        </form>
      </div>
    </div>
  );
}