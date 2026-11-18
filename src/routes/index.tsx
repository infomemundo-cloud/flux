import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Bell,
  Check,
  CircleDashed,
  Copy,
  Filter,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  Lock,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flux — atendimento organizado para equipes" },
      {
        name: "description",
        content:
          "O Flux organiza os atendimentos do WhatsApp em uma fila compartilhada, com responsáveis, prazos e histórico para equipes que precisam acompanhar cada solicitação.",
      },
    ],
  }),
  component: Landing,
});

/**
 * Revela o bloco com fade-in/slide-up quando entra na viewport.
 * Sem lib nova: IntersectionObserver + transições do Tailwind.
 * Respeita prefers-reduced-motion (mostra direto, sem animação).
 */
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Mockup FIEL ao produto real (fila + conversa aberta), com a bolha de
 * acompanhamento do atendimento e o pill "Acompanhamento" — o mesmo que o operador vê no
 * histórico. Réplica de anatomia, não de dados: nomes/conteúdos ilustrativos.
 * - sidebar AZUL sólida (bg-primary) com tile ativo e dot de alerta;
 * - header da fila com pílulas de contagem (atrasadas em pill vermelho);
 * - cards com faixa 4px arredondada, avatar circular, dot de não-lida;
 * - bolhas com border-left colorida (cliente verde / agente primary).
 */
function ProductMockup() {
  const queue = [
    {
      initials: "C",
      name: "Carlos Mendes",
      time: "há 2 min",
      preview: "Meu pedido ainda será entregue hoje?",
      stripe: "var(--pill-red-fg)",
      unread: true,
    },
    {
      initials: "J",
      name: "Juliana Costa",
      time: "há 5 min",
      preview: "Pode enviar o orçamento atualizado?",
      stripe: "var(--state-novo)",
      unread: true,
    },
    {
      initials: "M",
      name: "Marcos Lima",
      time: "21/10/2026",
      preview: "Conseguiram verificar meu chamado?",
      stripe: "var(--pill-red-fg)",
      unread: false,
    },
    {
      initials: "F",
      name: "Fernanda Alves",
      time: "05/10/2026",
      preview: "Perfeito, obrigado pelo retorno!",
      stripe: "var(--state-resolvido)",
      unread: false,
    },
  ];
  const tabs = [
    { label: "Fila", count: 4, kind: "active" as const },
    { label: "Minhas", count: 1, kind: "plain" as const, icon: "user" as const },
    { label: "Órfãs", count: 2, kind: "plain" as const, icon: "orphan" as const },
    { label: "Atrasadas", count: 2, kind: "alert" as const, icon: "alert" as const },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[680px] lg:mx-0" aria-hidden="true">
      {/* Glow radial suave atrás da janela */}
      <div className="pointer-events-none absolute -inset-6 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.10),transparent_60%)]" />
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-pop)]">
        {/* Chrome do navegador */}
        <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-destructive/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          <div className="ml-2 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground">
            fluxapp.cloud/app/o/acme/fila
          </div>
        </div>
        {/* Corpo: sidebar azul + fila + conversa aberta */}
        <div className="grid grid-cols-1 sm:grid-cols-[3.25rem_minmax(0,14rem)_minmax(0,1fr)]">
          {/* Sidebar AZUL sólida — igual à org-sidebar real */}
          <div className="hidden sm:flex flex-col items-center gap-2 bg-primary py-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 text-white shadow-sm">
              <Inbox className="h-4 w-4" />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg text-white/70">
              <LayoutDashboard className="h-4 w-4" />
            </span>
            <span className="relative grid h-8 w-8 place-items-center rounded-lg text-white/70">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-primary" />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg text-white/70">
              <Users className="h-4 w-4" />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg text-white/70">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="mt-auto grid h-8 w-8 place-items-center rounded-full bg-white/20 text-[10px] font-bold text-white">
              AJ
            </span>
          </div>
          {/* Coluna da Fila */}
          <div className="flex flex-col border-r border-border bg-background">
            <div className="flex items-center justify-between gap-1 px-2 py-2">
              <div className="flex min-w-0 items-center gap-1">
                {tabs.map((t) => (
                  <span
                    key={t.label}
                    className={
                      t.kind === "active"
                        ? "inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-1.5 py-0.5 text-[9px] font-bold text-foreground shadow-sm"
                        : t.kind === "alert"
                          ? "inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--pill-red-bg)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--pill-red-fg)]"
                          : "inline-flex shrink-0 items-center gap-1 rounded-lg px-1 py-0.5 text-[9px] font-semibold text-muted-foreground"
                    }
                  >
                    {t.icon === "user" && <Users className="h-2.5 w-2.5" />}
                    {t.icon === "orphan" && <CircleDashed className="h-2.5 w-2.5" />}
                    {t.icon === "alert" && <TriangleAlert className="h-2.5 w-2.5" />}
                    {t.kind === "active" ? t.label : ""}
                    <span className="tabular-nums">{t.count}</span>
                  </span>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground">
                  <Search className="h-3 w-3" />
                </span>
                <span className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground">
                  <Filter className="h-3 w-3" />
                </span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Plus className="h-3 w-3" />
                </span>
              </div>
            </div>
            {/* Cards — anatomia idêntica ao FilaCard real */}
            <div className="space-y-2 p-2 pt-1">
              {queue.map((q) => (
                <div
                  key={q.name}
                  className={`relative flex gap-2 overflow-hidden rounded-xl py-2 pl-3 pr-2 ${
                    q.unread
                      ? "bg-card shadow-[var(--shadow-card)] ring-1 ring-border/60"
                      : "bg-muted/40 ring-1 ring-transparent"
                  }`}
                >
                  <span
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
                    style={{ background: q.stripe }}
                  />
                  <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-foreground">
                    {q.initials}
                    {q.unread && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1.5">
                      <span
                        className={`truncate text-[10px] ${
                          q.unread ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                        }`}
                      >
                        {q.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 text-[8px] tabular-nums text-muted-foreground/70">
                        <MessageCircle className="h-2 w-2" />
                        {q.time}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[9px] ${
                        q.unread
                          ? "font-medium text-foreground/80"
                          : "font-normal text-muted-foreground/70"
                      }`}
                    >
                      {q.preview}
                    </span>
                  </span>
                </div>
              ))}
              <div className="pt-0.5 text-center text-[8px] text-muted-foreground/60">
                Fim da lista · 4 demandas
              </div>
            </div>
          </div>
          {/* Conversa aberta — bolhas reais + acompanhamento do atendimento com identificação do responsável */}
          <div className="flex flex-col bg-background">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-foreground">
                  C
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-foreground">Carlos Mendes</div>
                  <div className="truncate font-mono text-[9px] text-muted-foreground">DM-038F39</div>
                </div>
              </div>
              <span className="pill-red inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                <span className="h-1 w-1 rounded-full bg-[var(--pill-red-fg)] animate-alert-blink" />
                SLA -2h
              </span>
            </div>
            <div className="space-y-2 p-3">
              {/* Bolha do cliente */}
              <div className="max-w-[88%] rounded-xl border border-border border-l-[3px] border-l-[var(--pill-green-fg)] bg-card px-3 py-1.5 text-[10px] text-foreground shadow-[var(--shadow-card)]">
                <div className="mb-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Carlos Mendes</span>
                  <span className="pill-green rounded px-1 py-px text-[8px] font-bold">Cliente</span>
                  <span>· há 2 min</span>
                </div>
                Preciso remarcar a entrega de hoje…
              </div>
              {/* Bolha do agente com acompanhamento do atendimento + identificação do responsável (recurso real) */}
              <div className="ml-auto max-w-[88%] rounded-xl border border-primary/20 border-l-[3px] border-l-primary bg-primary/[0.04] px-3 py-1.5 text-[10px] text-foreground">
                <div className="mb-0.5 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
                  <span>agora</span>
                  <span className="pill-brand rounded px-1 py-px text-[8px] font-bold">Você</span>
                </div>
                Oi Carlos! Já confirmei com a equipe. Sua entrega está reagendada para amanhã. 👍
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">Responsável: Ana Paula</span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold text-primary">
                    <Check className="h-2.5 w-2.5" /> Acompanhamento
                  </span>
                </span>
              </div>
            </div>
            {/* Composer — mesmo layout do DemandaComposer */}
            <div className="mt-auto flex items-center gap-1.5 border-t border-border bg-card p-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground">
                <Copy className="h-3.5 w-3.5" />
              </span>
              <div className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">
                Digite uma mensagem...
              </div>
              <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const [user, setUser] = useState<{ email?: string | null; name?: string | null } | null | undefined>(
    undefined,
  );
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(
        u
          ? {
              email: u.email,
              name: (u.user_metadata as any)?.full_name ?? (u.user_metadata as any)?.name ?? null,
            }
          : null,
      );
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUser(
        u
          ? {
              email: u.email,
              name: (u.user_metadata as any)?.full_name ?? (u.user_metadata as any)?.name ?? null,
            }
          : null,
      );
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const isAuthed = !!user;
  const displayName = user?.name || user?.email || "";

  const integrations = [
    { icon: MessageCircle, label: "WhatsApp" },
    { icon: Zap, label: "Evolution API" },
    { icon: Webhook, label: "Webhooks / API" },
  ];
  const kpis = [
    { icon: ShieldCheck, title: "Histórico registrado", desc: "Ações importantes ficam registradas com autor e horário." },
    { icon: Inbox, title: "Uma fila só", desc: "WhatsApp e webhooks no mesmo lugar." },
    { icon: Timer, title: "SLA vivo", desc: "O alerta aparece antes do cliente reclamar." },
  ];
  const panelPoints = [
    {
      icon: ArrowDownWideNarrow,
      tint: "pill-brand",
      title: "A equipe sabe por onde começar",
      desc: "As conversas ficam em uma fila compartilhada, com prioridade para o que precisa de atenção.",
    },
    {
      icon: Users,
      tint: "pill-green",
      title: "Cada solicitação tem responsável",
      desc: "A equipe consegue identificar quem está cuidando de cada atendimento e acompanhar o andamento.",
    },
    {
      icon: Timer,
      tint: "pill-red",
      title: "Prazos ficam visíveis",
      desc: "Os alertas de SLA ajudam a perceber conversas que estão paradas e precisam de atenção.",
    },
    {
      icon: History,
      tint: "pill-violet",
      title: "O histórico acompanha a conversa",
      desc: "Mensagens e atualizações ficam reunidas para a equipe retomar o atendimento com contexto.",
    },
  ];
  const dayMoments = [
    {
      time: "09:12",
      title: "“Chegou um pedido de orçamento.”",
      desc: "A mensagem do cliente aparece na fila compartilhada, com a conversa e o histórico disponíveis para a equipe.",
      tint: "pill-green",
    },
    {
      time: "10:05",
      title: "“A Ana ficou responsável.”",
      desc: "A solicitação é atribuída a uma pessoa da equipe. Todos conseguem identificar quem está acompanhando o cliente.",
      tint: "pill-brand",
    },
    {
      time: "14:30",
      title: "“O gestor acompanha o andamento.”",
      desc: "O prazo e o status ficam visíveis. Se a conversa ficar parada, o alerta ajuda a equipe a agir antes que ela seja esquecida.",
      tint: "pill-amber",
    },
  ];
  const trustPoints = [
    {
      icon: ShieldCheck,
      tint: "pill-brand",
      title: "Ações registradas",
      desc: "Mudanças de status, atribuições e mensagens ficam registradas com autor e horário, facilitando o acompanhamento.",
    },
    {
      icon: Lock,
      tint: "pill-violet",
      title: "Espaço separado por empresa",
      desc: "Cada organização possui seu próprio ambiente, com acesso controlado de acordo com as permissões da equipe.",
    },
    {
      icon: History,
      tint: "pill-amber",
      title: "Histórico do atendimento",
      desc: "A equipe pode consultar o contexto da conversa e acompanhar o que aconteceu ao longo da solicitação.",
    },
    {
      icon: Users,
      tint: "pill-green",
      title: "Visão compartilhada",
      desc: "O gestor e os colaboradores acompanham a mesma fila, sem depender de mensagens repassadas entre celulares.",
    },
  ];
  const steps = [
    {
      n: "1",
      title: "Crie o espaço da sua empresa",
      desc: "Cadastre sua organização e convide as pessoas que participam do atendimento.",
    },
    {
      n: "2",
      title: "Conecte o WhatsApp",
      desc: "Configure a integração disponível para receber as conversas no Flux. Você também pode conectar webhooks e API.",
    },
    {
      n: "3",
      title: "Organize o trabalho da equipe",
      desc: "Acompanhe as conversas, distribua responsabilidades e veja o que ainda precisa ser resolvido.",
    },
  ];


  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary">
              <Inbox className="h-4 w-4 text-primary-foreground" strokeWidth={2.2} />
            </span>
            Flux
          </div>
          <nav className="flex items-center gap-2 text-sm">
            {isAuthed ? (
              <>
                <span className="hidden px-2 text-muted-foreground sm:inline">Olá, {displayName}</span>
                <Link
                  to="/app"
                  className="rounded-lg bg-primary px-3.5 py-2 font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
                >
                  Abrir painel
                </Link>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                  }}
                  className="rounded-lg px-3 py-2 transition hover:bg-secondary"
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link to="/auth" className="rounded-lg px-3.5 py-2 transition hover:bg-secondary">
                  Entrar
                </Link>
                <Link
                  to="/auth"
                  className="rounded-lg bg-primary px-3.5 py-2 font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
                >
                  Testar grátis
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── HERO: posicionamento para equipes que compartilham o WhatsApp ── */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 lg:pt-20">
        <Reveal>
          <div className="max-w-4xl">
            <div className="pill-brand inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--pill-brand-fg)]" />
              Atendimento compartilhado para empresas
            </div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight lg:text-6xl">
              Seu WhatsApp tem várias conversas.{" "}
              <span className="text-primary">Sua equipe sabe quem está cuidando de cada uma?</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-muted-foreground lg:text-lg">
              O Flux reúne os atendimentos em uma fila compartilhada para sua equipe distribuir
              responsabilidades, acompanhar prazos e consultar o histórico de cada cliente.
              Assim, o gestor sabe o que está pendente e quem está cuidando de cada solicitação.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to={isAuthed ? "/app" : "/auth"}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground shadow-[var(--shadow-pop)] transition hover:brightness-110"
              >
                Experimentar gratuitamente <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 transition hover:bg-secondary"
              >
                Ver como funciona
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              7 dias grátis · Sem cartão de crédito · Ideal para equipes que atendem pelo WhatsApp
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Fila compartilhada</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Responsáveis definidos</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Prazos e histórico</span>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-5 lg:items-center">
          <Reveal delay={100} className="lg:col-span-3">
            <ProductMockup />
          </Reveal>
          <Reveal delay={200} className="lg:col-span-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-primary">
              Mais controle para quem coordena. Mais clareza para quem atende.
            </div>
            <ul className="mt-6 space-y-4">
              {panelPoints.map(({ icon: Icon, tint, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tint}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── FAIXA DE INTEGRAÇÕES & GARANTIAS ── */}
      <section className="border-y border-border bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 lg:flex-row lg:items-center">
          <Reveal className="lg:shrink-0">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Conecta com o que você já usa
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {integrations.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
          <div className="h-px bg-border lg:h-16 lg:w-px lg:shrink-0" />
          <Reveal delay={100} className="flex-1">
            <div className="grid gap-6 sm:grid-cols-3">
              {kpis.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-foreground">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── UM DIA COM O FLUXO (narrativa) ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">Como o atendimento pode funcionar com o Flux</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Veja uma situação comum: uma solicitação chega, alguém assume o atendimento e o gestor consegue acompanhar o andamento.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {dayMoments.map(({ time, title, desc, tint }, i) => (
            <Reveal key={time} delay={i * 80}>
              <div className="h-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
                    {time}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tint}`}>
                    {i === 0 ? "entrou" : i === 1 ? "alertou" : "registrou"}
                  </span>
                </div>
                <div className="mt-3 text-sm font-semibold">{title}</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── COMO FUNCIONA POR DENTRO (bento) ── */}
      <section id="como-funciona" className="border-y border-border bg-card/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight">O que sua equipe consegue acompanhar</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Cada mensagem vira uma demanda com ciclo de vida controlado. Estados, responsáveis e
              prazos garantem que nada trava sem alguém saber.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {/* State machine */}
            <Reveal className="md:col-span-2">
              <div className="h-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
                <div className="flex items-center gap-3">
                  <span className="pill-brand grid h-9 w-9 place-items-center rounded-lg">
                    <GitBranch className="h-4 w-4" />
                  </span>
                  <div className="font-semibold">Etapas do atendimento</div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="pill-brand rounded-full px-2.5 py-1 text-[11px] font-bold">Novo</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="pill-amber rounded-full px-2.5 py-1 text-[11px] font-bold">Em análise</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="pill-orange rounded-full px-2.5 py-1 text-[11px] font-bold">Aguardando cliente</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="pill-green rounded-full px-2.5 py-1 text-[11px] font-bold">Concluído</span>
                </div>
                <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Ana Paula</span> atualizou o status de{" "}
                  <span className="pill-brand rounded px-1.5 py-0.5 font-bold">Novo</span> para{" "}
                  <span className="pill-amber rounded px-1.5 py-0.5 font-bold">Em análise</span> · há 2 min
                </div>
              </div>
            </Reveal>
            {/* SLA */}
            <Reveal delay={80} className="md:col-span-2">
              <div className="h-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
                <div className="flex items-center gap-3">
                  <span className="pill-red grid h-9 w-9 place-items-center rounded-lg">
                    <Timer className="h-4 w-4" />
                  </span>
                  <div className="font-semibold">SLA & prazos sob controle</div>
                </div>
                <div className="mt-5 space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <span className="pill-red inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--pill-red-fg)] animate-alert-blink" /> SLA
                      estourado · 2h
                    </span>
                    <span className="text-[11px] text-muted-foreground">DM-1102 · Carlos Mendes</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <span className="pill-amber rounded-full px-2 py-0.5 text-[10px] font-bold">Vence em 4h</span>
                    <span className="text-[11px] text-muted-foreground">DM-0977 · Juliana Costa</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <span className="pill-green rounded-full px-2 py-0.5 text-[10px] font-bold">Dentro do prazo</span>
                    <span className="text-[11px] text-muted-foreground">DM-0954 · Marcos Lima</span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Alertas aparecem antes do cliente perceber o atraso.
                </p>
              </div>
            </Reveal>
            {/* Confiança (4 cards) */}
            {trustPoints.map(({ icon: Icon, tint, title, desc }, i) => (
              <Reveal key={title} delay={i * 60}>
                <div className="h-full rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${tint}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="mt-3 text-sm font-semibold">{title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── PASSOS PARA COMEÇAR ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">Comece a organizar o atendimento</h2>
            <p className="mt-2 text-muted-foreground">Configure o espaço da empresa, conecte o canal e reúna a equipe na mesma fila.</p>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map(({ n, title, desc }, i) => (
            <Reveal key={n} delay={i * 100}>
              <div className="relative rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <span className="absolute -top-3.5 left-6 grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                  {n}
                </span>
                <div className="mt-2 text-base font-semibold">{title}</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-10 md:p-14 shadow-xl">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Sua equipe está pronta para atender com mais organização?
              </h2>
              <p className="mt-3 max-w-xl text-slate-300">
                Crie sua conta em segundos, conecte seu canal e nunca mais perca o controle de uma
                conversa.
              </p>
              <Link
                to={isAuthed ? "/app" : "/auth"}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-slate-900 shadow-lg shadow-sky-500/20 transition hover:scale-[1.02] hover:bg-slate-100"
              >
                Experimentar o Flux <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border bg-card/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary">
              <Inbox className="h-3.5 w-3.5 text-primary-foreground" />
            </span>
            Flux
            <span className="font-normal text-muted-foreground">© {new Date().getFullYear()} — Atendimento compartilhado</span>
          </div>
          <nav className="flex items-center gap-6">
            <a href="#" className="transition hover:text-foreground">Termos</a>
            <a href="#como-funciona" className="transition hover:text-foreground">Documentação</a>
            <a href="#" className="transition hover:text-foreground">Status</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
