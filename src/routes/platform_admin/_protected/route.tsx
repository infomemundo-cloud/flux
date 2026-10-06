import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Webhook,
  ScrollText,
  Flag,
  Layers,
  CreditCard,
  LogOut,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { getPlatformAdminSession } from "@/lib/platform-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { bumpRedirectHops, resetRedirectHops } from "@/lib/platform-admin-redirect-guard";

export const Route = createFileRoute("/platform_admin/_protected")({
  head: () => ({ meta: [{ title: "Platform Admin — Fluxo" }] }),
  component: PlatformAdminShell,
});

/**
 * Shell do platform_admin (Fase 1.7): guard de autorização + layout próprio
 * (D9). ANTI-CONGELAMENTO: o redirect pro login quando não há sessão admin
 * acontece em useEffect com circuit breaker de hops — nunca <Navigate> em
 * fase de renderização (ciclo síncrono login↔shell congela a aba).
 *
 * CACHE (alinhado): staleTime 5min + sem refetch em foco/reconexão — o
 * probe de sessão roda 1x a cada 5min no máximo, não por navegação.
 * Mutations que mudam status de admin invalidam esta query explicitamente.
 *
 * NAVEGAÇÃO pro LOGIN (fix de raiz): o validateSearch do login declara
 * `redirect` como OPCIONAL ({ redirect?: string }), então navegar pra lá
 * NÃO exige `search` — os 4 pontos abaixo usam navigate simples. O fluxo
 * de convite é o único que passa search ({ redirect: <token> }), vindo
 * de convite.$token.tsx.
 */
const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/platform_admin", soon: false },
  { label: "Tenants", icon: Building2, href: "/platform_admin/tenants", soon: false },
  { label: "Usuários", icon: Users, href: "/platform_admin/users", soon: false },
  { label: "Logs de webhook", icon: Webhook, href: "/platform_admin/webhooks", soon: false },
  { label: "Audit log", icon: ScrollText, href: null, soon: true },
  { label: "Feature flags", icon: Flag, href: "/platform_admin/flags", soon: false },
  { label: "Tiers", icon: Layers, href: "/platform_admin/tiers", soon: false },
  { label: "Billing", icon: CreditCard, href: null, soon: true },
] as const;

function PlatformAdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const sessionFn = useServerFn(getPlatformAdminSession);
  const { data: session, isPending } = useQuery({
    queryKey: ["platform-admin-session"],
    queryFn: async () => {
      try {
        return await sessionFn();
      } catch {
        return null; // sem sessão / não admin → redirect pro login (via effect)
      }
    },
    retry: false,
    // CACHE OTIMIZADO: sessão admin muda raramente (só via mutation).
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const [watchdog, setWatchdog] = useState(false);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setWatchdog(false);
      return;
    }
    const t = setTimeout(() => setWatchdog(true), 10_000);
    return () => clearTimeout(t);
  }, [isPending]);

  // Guard: sem sessão admin → login, via effect + hop guard.
  // Navigate simples: redirect é opcional no schema de search do login.
  useEffect(() => {
    if (isPending || session) return;
    if (bumpRedirectHops() > 2) {
      setLoop(true);
      return;
    }
    navigate({ to: "/platform_admin/login" });
  }, [session, isPending, navigate]);

  if (loop) {
    return (
      <div className="dark min-h-screen bg-slate-950 grid place-items-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 ring-1 ring-slate-800 p-6 text-center">
          <div className="text-sm font-bold text-slate-100">Loop de redirecionamento detectado</div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            O estado de sessão deste navegador está inconsistente entre o
            login e o painel. Limpe o estado abaixo ou saia de todas as sessões.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => {
                resetRedirectHops();
                setLoop(false);
                qc.clear();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-950 transition hover:bg-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Limpar estado
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                resetRedirectHops();
                qc.clear();
                navigate({ to: "/platform_admin/login" });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair de tudo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isPending && !watchdog) {
    return (
      <div className="dark min-h-screen bg-slate-950 grid place-items-center">
        <div className="text-xs text-slate-500">Verificando acesso…</div>
      </div>
    );
  }

  if (isPending && watchdog) {
    return (
      <div className="dark min-h-screen bg-slate-950 grid place-items-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 ring-1 ring-slate-800 p-6 text-center">
          <div className="text-sm font-bold text-slate-100">Não foi possível verificar seu acesso</div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            O servidor não respondeu à verificação de sessão. Em dev, isso
            geralmente é o servidor com manifesto desatualizado — reinicie o
            `npm run dev` se persistir.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["platform-admin-session"] })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-950 transition hover:bg-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
            </button>
            <button
              onClick={() => navigate({ to: "/platform_admin/login" })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              Ir para o login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sem sessão (effect já está navegando pro login): não renderiza o shell.
  if (!session) {
    return (
      <div className="dark min-h-screen bg-slate-950 grid place-items-center">
        <div className="text-xs text-slate-500">Redirecionando…</div>
      </div>
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    resetRedirectHops();
    qc.clear();
    navigate({ to: "/platform_admin/login" });
  }

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-56 shrink-0 border-r border-slate-800/80 bg-slate-900/60 flex flex-col">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-800/80">
          <ShieldCheck className="h-4 w-4 text-slate-300" strokeWidth={2} />
          <span className="text-xs font-bold tracking-wide">PLATFORM ADMIN</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.href === location.pathname;
            const inner = (
              <>
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                <span className="truncate">{item.label}</span>
                {item.soon && (
                  <span className="ml-auto rounded bg-slate-800 px-1 py-0.5 text-[9px] font-semibold text-slate-400">
                    em breve
                  </span>
                )}
              </>
            );
            const cls = `flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-xs transition ${
              active
                ? "bg-slate-800 text-slate-100 font-semibold"
                : item.soon
                  ? "text-slate-500 cursor-not-allowed"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
            }`;
            return item.href && !item.soon ? (
              <Link key={item.label} to={item.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <div key={item.label} className={cls} aria-disabled={item.soon}>
                {inner}
              </div>
            );
          })}
        </nav>
        <div className="p-2 border-t border-slate-800/80">
          <button
            onClick={signOut}
            className="flex items-center gap-2.5 rounded-lg px-2.5 h-9 w-full text-xs text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.9} /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
