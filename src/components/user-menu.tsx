import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTheme, THEMES, type Theme } from "@/lib/theme";
import { useLocation, useParams } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronsUpDown,
  LogOut,
  MessageSquareHeart,
  Settings,
  Sun,
  Moon,
  Building2,
  Check,
} from "lucide-react";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { evaluateFeatureFlags } from "@/lib/feature-flag.functions";
import { FeedbackDialog } from "@/components/feedback-dialog";

const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, corporate: Building2 };

export function ThemeToggleInline({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className={`grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 ${className}`}>
      {THEMES.map((t) => {
        const Icon = THEME_ICON[t.value];
        const active = theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            aria-pressed={active}
            title={t.hint}
            className={`flex flex-col items-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] font-semibold transition-colors ${
              active ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeCycleButton({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICON[theme];
  const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "corporate" : "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Tema: ${THEMES.find((t) => t.value === theme)?.label}`}
      aria-label="Alternar tema"
      className={`grid place-items-center h-8 w-8 rounded-md hover:bg-sidebar-accent/60 ${className}`}
    >
      <Icon className="h-4 w-4" strokeWidth={2.1} />
    </button>
  );
}

export function UserMenu({
  name,
  email,
  role,
  collapsed,
  settingsTo,
  onSignOut,
  showTooltip = true,
  round = false,
}: {
  name: string;
  email?: string | null;
  role?: string | null;
  collapsed?: boolean;
  // Opcional: sem ele, o item "Configurações" some do menu (usuário sem permissão).
  settingsTo?: string;
  onSignOut: () => void;
  // Tooltip de hover só faz sentido em contexto de mouse (sidebar desktop recolhida).
  // Em touch (mobile), o Radix Tooltip pode ficar "preso" aberto porque não existe
  // mouse-leave real — por isso o OrgMobileNav/header passam showTooltip={false}.
  showTooltip?: boolean;
  // Avatar circular translúcido pra barras de marca (MobileAppHeader):
  // círculo branco/15 com ring, iniciais brancas — o "JS" do anúncio.
  round?: boolean;
}) {
  const { theme } = useTheme();
  const location = useLocation();
  // Feedback (Fase 9.2): org vem do cache compartilhado ["org", slug] —
  // mesma queryKey do layout/da fila, zero fetch extra e zero prop nova
  // nos callers (sidebar desktop + header mobile). Fora de rota de org,
  // slug é undefined → query desabilitada → item não existe.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { slug } = useParams({ strict: false }) as { slug?: string };
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => orgFn({ data: { slug: slug! } }),
    enabled: !!slug,
  });
  const orgId = org?.id ?? null;
  // Gate da flag (9.5): mesma serverFn do portal/simulador; memo 60s no
  // servidor + staleTime 5min aqui = propagação documentada da Fase 1.9.
  const evalFn = useServerFn(evaluateFeatureFlags);
  const { data: flagEval } = useQuery({
    queryKey: ["feature-flags", orgId],
    queryFn: () => evalFn({ data: { orgId: orgId! } }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
  const canFeedback =
    !!orgId &&
    (flagEval?.flags ?? []).some((f) => f.key === "product_feedback" && f.enabled);
  const initials = name
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  const trigger = round ? (
    <DropdownMenuTrigger
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 text-[11px] font-bold text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {initials || "U"}
    </DropdownMenuTrigger>
  ) : (
    <DropdownMenuTrigger
      className={`flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/30 px-2 py-2 text-left transition hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
        collapsed ? "justify-center px-1.5" : ""
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground">
        {initials || "U"}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">{name}</span>
            <span className="block truncate text-[11px] text-sidebar-foreground/60">{email ?? role ?? ""}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
        </>
      )}
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {!round && collapsed && showTooltip ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="space-y-0.5">
              <p className="text-xs font-semibold leading-tight text-current">{name}</p>
              {(email ?? role) && (
                <p className="text-[11px] leading-tight text-current/80">{email ?? role}</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        align={collapsed || round ? "start" : "end"}
        side="top"
        sideOffset={10}
        collisionPadding={16}
        avoidCollisions
        className={`z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-xs ${collapsed || round ? "w-64" : ""}`}
      >
        <DropdownMenuLabel className="pb-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          {email && <div className="truncate text-xs font-normal text-muted-foreground">{email}</div>}
          {role && (
            <span className="mt-1.5 inline-flex items-center rounded-md pill-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {role}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Tema
            <span className="inline-flex items-center gap-1 font-semibold normal-case tracking-normal">
              <Check className="h-3 w-3" /> {THEMES.find((t) => t.value === theme)?.label}
            </span>
          </div>
          <ThemeToggleInline />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href={`/ajuda?from=${encodeURIComponent(location.pathname)}`}
            className="cursor-pointer"
          >
            <BookOpen className="h-4 w-4" /> Ajuda & documentação
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {canFeedback && (
          <>
            <DropdownMenuItem
              onClick={() => setFeedbackOpen(true)}
              className="cursor-pointer"
            >
              <MessageSquareHeart className="h-4 w-4" /> Enviar feedback
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {settingsTo && (
          <>
            <DropdownMenuItem asChild>
              <a href={settingsTo} className="cursor-pointer">
                <Settings className="h-4 w-4" /> Configurações de conta
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={onSignOut}
          className="cursor-pointer font-semibold text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
      {/* Dialog portalizado: vive no root do DropdownMenu (provider),
          não dentro do Content — sobrevive ao fechar do menu. */}
      {canFeedback && orgId && (
        <FeedbackDialog
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          orgId={orgId}
          surface="menu"
        />
      )}
    </DropdownMenu>
  );
}
