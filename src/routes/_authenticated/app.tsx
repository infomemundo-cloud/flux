import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { listMyOrgs, createOrg } from "@/lib/orgs.functions";
import { toast } from "sonner";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  Inbox,
  Loader2,
  Plus,
  X,
} from "lucide-react";
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

/** MESMA regra do servidor (slugify em orgs.functions.ts) — o preview
 *  nunca promete um slug que o backend não vai gerar. */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "org";

/** Logo real da org ou iniciais em badge com gradiente (fallback gracioso). */
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
        className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
      />
    );
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-sm font-bold text-white shadow-sm">
      {initials}
    </span>
  );
}

/**
 * Organization Selector (pós-login): escolha EXPLÍCITA sempre —
 * nenhum auto-redirect (decisão revertida: multi-org é o coração do
 * produto; empurrar pra fila roubava a escolha de criar/alternar).
 * Seção 1: cards das orgs (avatar/logo, nome, tag de papel, chevron).
 * Seção 2: criação dedicada (colapsável; aberta por padrão no vazio).
 * Criação continua caindo no wizard de ativação (§38, Fase 3).
 */
function OrgPicker() {
  const location = useLocation();
  const navigate = useNavigate();
  const list = useServerFn(listMyOrgs);
  const create = useServerFn(createOrg);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState<boolean | null>(null); // null = auto (abre se vazio)
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({ queryKey: ["my-orgs"], queryFn: () => list() });

  const orgs = data ?? [];
  const empty = !isLoading && orgs.length === 0;
  const showCreate = createOpen === null ? empty : createOpen;

  useEffect(() => {
    if (showCreate) inputRef.current?.focus();
  }, [showCreate]);

  const m = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
      toast.success("Organização criada");
      // Fase 3 (§38): org nova cai direto no wizard de ativação
      // (2 passos: perfil + conectar WhatsApp), não na fila vazia.
      navigate({ to: "/app/onboarding/$slug", params: { slug: org.slug } });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  // Layout pathless pros filhos de /app (orgs) — só renderiza o picker em /app exato.
  if (location.pathname.replace(/\/$/, "") !== "/app") {
    return <Outlet />;
  }

  const trimmed = name.trim();
  const nameValid = trimmed.length >= 2;
  const previewSlug = slugify(trimmed);

  return (
    <div className="min-h-screen bg-background px-6 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        {/* Cabeçalho: marca + badge discreta */}
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary">
            <Inbox className="h-5 w-5 text-primary-foreground" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-bold tracking-tight">Fluxo</span>
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sua conta
          </span>
        </div>

        {/* Hero / título */}
        {empty && (
          <span className="mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" strokeWidth={1.8} />
          </span>
        )}
        <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${empty ? "mt-4" : "mt-8"}`}>
          {empty ? "Crie sua primeira organização" : "Selecione seu espaço de trabalho"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {empty
            ? "A organização reúne a fila, o time e o WhatsApp da sua empresa em um só lugar."
            : "Acesse uma organização existente ou crie uma nova para continuar."}
        </p>

        {/* Seção 1 — organizações existentes */}
        {!empty && (
          <div className="mt-8 space-y-2">
            {isLoading && !data ? (
              <ListSkeleton rows={3} height="h-[76px]" />
            ) : (
              orgs.map(({ org, role }) => (
                <Link
                  key={org.id}
                  to="/app/o/$slug/fila"
                  params={{ slug: org.slug }}
                  className="group flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-secondary/40 hover:shadow-[var(--shadow-card)]"
                >
                  <OrgAvatar url={org.logo_url} name={org.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{org.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          role === "owner" || role === "admin"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {ROLE_LABEL[role] ?? role}
                      </span>
                      <span className="truncate font-mono text-[11px]">/{org.slug}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))
            )}
          </div>
        )}

        {/* Seção 2 — criar nova organização */}
        <div className="mt-8">
          {showCreate ? (
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Building2 className="h-4 w-4 text-primary" />
                  Nova organização
                </div>
                {!empty && (
                  <button
                    type="button"
                    aria-label="Fechar formulário"
                    onClick={() => setCreateOpen(false)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (nameValid) m.mutate(trimmed);
                }}
              >
                <div>
                  <label htmlFor="org-name" className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Nome da empresa
                  </label>
                  <input
                    ref={inputRef}
                    id="org-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Acme Comércio"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                  />
                  {trimmed.length > 0 && !nameValid && (
                    <p className="mt-1 text-[11px] text-destructive">Use pelo menos 2 caracteres.</p>
                  )}
                  {nameValid && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Endereço: <span className="font-mono">/app/o/{previewSlug}</span>
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!nameValid || m.isPending}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:brightness-110 disabled:opacity-60"
                >
                  {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Criar e Acessar
                </button>
              </form>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-secondary/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Criar nova organização
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
