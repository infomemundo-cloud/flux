import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { listMyOrgs, createOrg } from "@/lib/orgs.functions";
import { toast } from "sonner";
import { ArrowRight, ChevronRight, Inbox, Loader2, Plus } from "lucide-react";
import { ListSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Suas organizações — Fluxo" }] }),
  component: OrgPicker,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  gerente: "Gerente",
  operador: "Operador",
  agente_ia: "Agente de IA",
};

/** MESMA regra do servidor (slugify em orgs.functions.ts). */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "org";

/** Avatar compacto: logo real ou iniciais em gradiente (fallback gracioso). */
function OrgAvatar({ url, name }: { url?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "F";
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-border/50"
      />
    );
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
      {initials}
    </span>
  );
}

/**
 * Hub de Organizações (pós-login): superfície de marca slate fixa, contida
 * (max-w-md) e centrada — escolha explícita sempre, sem auto-redirect.
 * Escopo `dark` no root: filhos token-based (ListSkeleton) renderizam
 * escuros dentro da superfície slate mesmo em tema light (D9).
 */
function OrgPicker() {
  const location = useLocation();
  const navigate = useNavigate();
  const list = useServerFn(listMyOrgs);
  const create = useServerFn(createOrg);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({ queryKey: ["my-orgs"], queryFn: () => list() });

  const orgs = data ?? [];
  const empty = !isLoading && orgs.length === 0;

  useEffect(() => {
    if (empty || showCreate) inputRef.current?.focus();
  }, [empty, showCreate]);

  const m = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
      toast.success("Organização criada com sucesso");
      // §38 Fase 3: org nova cai direto no wizard de ativação.
      navigate({ to: "/app/onboarding/$slug", params: { slug: org.slug } });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar organização"),
  });

  if (location.pathname.replace(/\/$/, "") !== "/app") {
    return <Outlet />;
  }

  const trimmed = name.trim();
  const nameValid = trimmed.length >= 2;
  const previewSlug = slugify(trimmed);

  return (
    <div className="dark min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Container Mestre com largura estritamente contida (max-w-md = 440px) */}
      <div className="w-full max-w-md space-y-4">
        {/* Cabeçalho Limpo */}
        <div className="flex flex-col items-center text-center space-y-1.5">
          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1 shadow-sm mb-1">
            <span className="grid h-4 w-4 place-items-center rounded bg-primary">
              <Inbox className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
            </span>
            <span className="text-xs font-semibold tracking-wide text-slate-200">Fluxo</span>
            <span className="h-1 w-1 rounded-full bg-slate-700" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Sua Conta
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            {empty ? "Crie sua organização" : "Selecione a organização"}
          </h1>
          <p className="text-xs text-slate-400">
            {empty
              ? "Crie seu espaço de trabalho para gerenciar atendimentos."
              : "Escolha qual empresa você deseja acessar agora."}
          </p>
        </div>

        {/* CARD ÚNICO (elegante, sem sobras nas laterais) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl backdrop-blur-sm space-y-4">
          {/* Lista de Organizações */}
          {!empty && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-400 px-1 mb-2">
                Suas empresas ({orgs.length})
              </div>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-0.5">
                {isLoading && !data ? (
                  <ListSkeleton rows={2} height="h-[56px]" />
                ) : (
                  orgs.map(({ org, role }) => (
                    <Link
                      key={org.id}
                      to="/app/o/$slug/fila"
                      params={{ slug: org.slug }}
                      className="group flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 transition-all hover:border-slate-700 hover:bg-slate-800/70"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <OrgAvatar url={org.logo_url} name={org.name} />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-100">
                            {org.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                            <span className="rounded bg-slate-800 border border-slate-700/60 px-1.5 py-0.2 font-medium text-slate-300">
                              {ROLE_LABEL[role] ?? role}
                            </span>
                            <span className="truncate font-mono text-slate-500">/{org.slug}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-200" />
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Divisor Discreto */}
          {!empty && (
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-slate-900/90 px-2 text-slate-500 font-medium">ou</span>
              </div>
            </div>
          )}

          {/* Formulário / Botão de Criar Nova */}
          <div>
            {!showCreate && !empty ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/80 bg-slate-950/30 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800/50 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                Criar outra organização
              </button>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (nameValid) m.mutate(trimmed);
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <label htmlFor="org-name" className="text-[11px] font-medium text-slate-300">
                      Nome da nova empresa
                    </label>
                    {!empty && (
                      <button
                        type="button"
                        onClick={() => setShowCreate(false)}
                        className="text-[10px] text-slate-500 hover:text-slate-300 transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  <input
                    ref={inputRef}
                    id="org-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Acme Comércio"
                    className="h-9 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 text-xs text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  {nameValid && (
                    <p className="mt-1 text-[10px] text-slate-500 px-0.5">
                      Slug: <span className="font-mono text-slate-400">/app/o/{previewSlug}</span>
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!nameValid || m.isPending}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
                >
                  {m.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  Criar e Acessar
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Rodapé / Dica (copy verdadeira: isolamento multi-tenant) */}
        <p className="text-center text-[11px] text-slate-500">
          Cada organização tem fila, time e WhatsApp próprios — isolados entre si.
        </p>
      </div>
    </div>
  );
}
