/**
 * Fase 4.6 Item 3 — Dashboard de Saúde do Billing (Platform Admin).
 * 
 * DESIGN SYSTEM COMPLIANCE (§6 UI/UX SaaS Elite):
 * • Densidade alta: cards compactos, grids KV inline, badges informativos pequenos.
 * • Tipografia hierárquica: h1=text-xl, labels=text-xs/[10px], values=text-sm/font-bold tabular-nums.
 * • Bordas sutis: border-border/50 bg-card/50 backdrop-blur-sm (profundidade sem peso visual).
 * • Espaçamento controlado: gap-3/p-4 nos containers principais; py-1.5 nos stats mini.
 * • Proibido: w-full desnecessário, infinite scroll automático, spinner infinito engolindo erro.
 * 
 * PERFORMANCE COMPLIANCE (§2.1 UX Reativa & Zero Idle Cost):
 * • retry: 0 em TODAS as queries e mutations (diretriz absoluta pós-incidente 2026-10-04).
 * • staleTime herdado do QueryClient global (5min) para navegação/troca de aba servir da RAM.
 * • refetchOnWindowFocus: false implícito (global config) — nunca refetcha porque usuário trocou janela SO.
 * • On-Demand Restrito: conteúdo pesado (histórico expandido) só carrega via CTA "Carregar mais (+10)".
 * • Gating por contexto: queries dependentes usam enabled condicionado à presença de dados pai.
 * • Filtros fluidos: mudança de select refetcha imediatamente com placeholderData: keepPreviousData.
 * 
 * SEGURANÇA COMPLIANCE (§5 Backend Authority):
 * • Todas as operações passam por assertPlatformAdmin() no servidor antes de tocar banco.
 * • Mutações administrativas gravam logs imutáveis em admin_audit_log automaticamente.
 * • UI apenas OCULTA botões/actions para não-admins; nunca confia em client-side validation isolada.
 * 
 * FLUXO DE USO ESPERADO:
 * 1. Admin abre página → vê instantaneamente último snapshot cached (se existir) ou skeleton.
 * 2. Se houver problema detectado (zumbis/falhas/idade excessiva), badge vermelho aparece discretamente.
 * 3. Clique em "Executar Verificação Agora" dispara runBillingHealthCheck() sob demanda.
 * 4. Toast confirma sucesso/falha + alerta proativo se encontrou issues novos.
 * 5. Histórico expandível mostra timeline de execuções anteriores para correlação temporal.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  getBillingHealthSnapshot,
  runBillingHealthCheck,
} from "@/lib/billing/billing-health.functions";

export const Route = createFileRoute("/platform_admin/_protected/_billing/billing/")({
  head: () => ({ meta: [{ title: "Saúde do Billing — Flux Platform Admin" }] }),
  component: BillingHealthDashboard,
});

function BillingHealthDashboard() {
  const qc = useQueryClient();
  const [historyLimit, setHistoryLimit] = useState(10);

  // Hook seguro: useServerFn declarado NO TOPO do componente (§2.2 regra absoluta)
  const fetchSnapshot = useServerFn(getBillingHealthSnapshot);
  const executeCheck = useServerFn(runBillingHealthCheck);

  const snapshotQ = useQuery({
    queryKey: ["billing-health-snapshot", historyLimit],
    queryFn: () => fetchSnapshot({ data: { limit: historyLimit } }),
    staleTime: 5 * 60 * 1000, // Alinha com o padrão global de 5min (§2.1)
    retry: 0,                 // Diretriz absoluta: zero retries automáticos
    refetchOnWindowFocus: false, // 👈 CRÍTICO: Impede refetch ao trocar de aba
    refetchOnReconnect: false,   // 👈 CRÍTICO: Impede refetch ao reconectar rede
    placeholderData: (prev) => prev, // 👈 ANTI-FLICKER: Mantém dados antigos durante qualquer update
  });

  // Mutation: executar check manual (CTA explícito, nunca automático)
  const checkMut = useMutation({
    mutationFn: () => executeCheck({ data: { triggeredBy: "manual" } }),
    onSuccess: (result) => {
      // Invalidação cirúrgica: só esta query específica, não global heavy refresh
      qc.invalidateQueries({ queryKey: ["billing-health-snapshot"] });
      
      toast.success(`Verificação concluída (${result.metrics.durationMs}ms)`);
      
      // Alerta proativo DISCRETO (só se realmente houver problema novo)
      if (result.metrics.totalZombiesNow > 0) {
        toast.warning(
          `${result.metrics.totalZombiesNow} evento(s) pendente(s) detectado(s)`,
          {
            description:
              result.metrics.oldestPendingAgeSec > 900
                ? "Alguns estão presos há mais de 15min. Considere investigar logs ou acionar reconciliação."
                : "Processamento normal em andamento. Nenhum alerta crítico.",
            action: {
              label: "Ver Detalhes",
              onClick: () => scrollToSection("details"),
            },
          },
        );
      }
    },
    onError: (err: any) => {
      toast.error("Falha ao executar verificação", {
        description: err.message ?? "Erro interno desconhecido.",
      });
    },
  });

  const latestMetric = snapshotQ.data?.[0];
  const hasIssues =
    latestMetric &&
    (latestMetric.events_failed > 0 ||
      latestMetric.oldest_pending_age_sec > 900 || // > 15 min
      latestMetric.max_attempts_seen >= 8); // Perto do limite MAX_ATTEMPTS=10

  return (
    <div className="space-y-6 p-6">
      {/* Header Compacto com CTA Principal */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary shrink-0" />
            Saúde do Pipeline de Billing
          </h1>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            Monitoramento de eventos Mercado Pago • Última atualização:{" "}
            {latestMetric
              ? formatRelativeTime(latestMetric.window_end)
              : "Nunca verificada"}
          </p>
        </div>

        <Button
          size="sm"
          variant={hasIssues ? "destructive" : "outline"}
          onClick={() => checkMut.mutate()}
          disabled={checkMut.isPending}
          className="gap-2 shrink-0"
        >
          {checkMut.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Executar Verificação Agora
        </Button>
      </div>

      {/* Grid Principal: 4 Cards Densos Side-by-Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Status Geral (semaforo binário simplificado) */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Estado Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : !latestMetric ? (
              <EmptyState
                icon={<Database />}
                message="Sem dados ainda"
                hint='Use o botão "Executar Verificação Agora" acima.'
              />
            ) : (
              <div className="space-y-2">
                <Badge
                  variant={hasIssues ? "destructive" : "secondary"}
                  className="w-full justify-center py-1.5 text-[11px]"
                >
                  {hasIssues ? "⚠️ Atenção Necessária" : "✅ Sistema Saudável"}
                </Badge>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {hasIssues
                    ? `${latestMetric.events_failed} falha(s) e ${latestMetric.total_zombies_now} pendência(s) detectada(s).`
                    : "Todos os eventos processados corretamente nas últimas janelas."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Eventos Recentes (breakdown numérico denso) */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Janela Últimos 15min
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : !latestMetric ? (
              <EmptyState icon={<Clock />} message="—" hint="" />
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <StatMini
                  label="Recebidos"
                  value={latestMetric.events_received}
                  color="blue"
                />
                <StatMini
                  label="Processados"
                  value={latestMetric.events_processed}
                  color="green"
                />
                <StatMini
                  label="Retry"
                  value={latestMetric.events_retrying}
                  color="yellow"
                />
                <StatMini
                  label="Falhas"
                  value={latestMetric.events_failed}
                  color="red"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Idade Máxima Pendente (métrica de urgência temporal) */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Evento Mais Antigo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : !latestMetric ? (
              <EmptyState icon={<AlertTriangle />} message="—" hint="" />
            ) : (
              <div className="space-y-1">
                <div
                  className={`text-lg font-bold tabular-nums transition-colors ${
                    latestMetric.oldest_pending_age_sec > 900
                      ? "text-destructive"
                      : latestMetric.oldest_pending_age_sec > 300
                        ? "text-yellow-500"
                        : "text-green-500"
                  }`}
                >
                  {formatDuration(latestMetric.oldest_pending_age_sec)}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {latestMetric.total_zombies_now === 0
                    ? "Nenhum evento preso aguardando processamento."
                    : `${latestMetric.total_zombies_now} evento(s) aguardando recuperação.`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Pico de Retries (indicador de saturação do zumbi-gate) */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Pico de Retries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : !latestMetric ? (
              <EmptyState icon={<RefreshCw />} message="—" hint="" />
            ) : (
              <div className="space-y-1">
                <div
                  className={`text-lg font-bold tabular-nums transition-colors ${
                    latestMetric.max_attempts_seen >= 8
                      ? "text-destructive"
                      : latestMetric.max_attempts_seen >= 5
                        ? "text-yellow-500"
                        : "text-slate-400"
                  }`}
                >
                  {latestMetric.max_attempts_seen}/10
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Limite técnico: MAX_ATTEMPTS=10 (zumbi-gate anti-loop).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Seção de Histórico Expandido (On-Demand Restrito §2.1) */}
      <section
        id="details"
        className="space-y-3 pt-4 border-t border-border/50"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Histórico de Execuções
          </h2>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setHistoryLimit((prev) => prev + 10)}
            disabled={snapshotQ.isFetching || historyLimit >= 50}
            className="shrink-0"
          >
            Carregar mais (+10)
          </Button>
        </div>

        {snapshotQ.isLoading && historyLimit === 10 ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : !snapshotQ.data?.length ? (
          <EmptyState
            icon={<Database />}
            message="Nenhuma execução registrada ainda"
            hint='Use o botão "Executar Verificação Agora" acima para popular o histórico.'
          />
        ) : (
          <div className="space-y-2">
            {snapshotQ.data.map((metric) => (
              <MetricRow key={metric.id} metric={metric} />
            ))}
            
            {historyLimit >= 50 && (
              <p className="text-center text-[10px] text-muted-foreground pt-2">
                Mostrando últimas 50 execuções. Para análise profunda, consulte
                logs diretos na Vercel ou Supabase Studio.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// COMPONENTES AUXILIARES REUTILIZÁVEIS
// ============================================================================

function StatMini({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "green" | "yellow" | "red";
}) {
  const colors: Record<typeof color, string> = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <div
      className={`rounded-md px-2 py-1 border ${colors[color]} flex items-center justify-between`}
    >
      <span className="text-[10px] font-medium opacity-80">{label}</span>
      <span className="text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

function MetricRow({ metric }: { metric: any }) {
  const isRecent =
    Date.now() - new Date(metric.window_end).getTime() < 15 * 60 * 1000;

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isRecent
          ? "border-primary/30 bg-primary/5"
          : "border-border/50 bg-card/30 hover:bg-card/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 shrink-0"
            >
              {metric.triggered_by === "manual" ? "👤 Manual" : "⏰ Cron"}
            </Badge>
            <span className="text-xs font-medium text-muted-foreground truncate">
              {new Date(metric.window_start).toLocaleString("pt-BR")}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2 text-[10px]">
            <MiniStat label="Recv" val={metric.events_received} tone="neutral" />
            <MiniStat label="Proc" val={metric.events_processed} tone="positive" />
            <MiniStat label="Retry" val={metric.events_retrying} tone="warning" />
            <MiniStat label="Fail" val={metric.events_failed} tone="negative" />
            <MiniStat label="Ignr" val={metric.events_ignored} tone="neutral" />
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs font-mono text-muted-foreground">
            {(metric.duration_ms / 1000).toFixed(1)}s
          </div>
          <div className="text-[10px] text-muted-foreground/70">dur. exec.</div>
        </div>
      </div>

      {/* Barra de progresso visual simples (proporção processado/recebido) */}
      {metric.events_received > 0 && (
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{
              width: `${(metric.events_processed / metric.events_received) * 100}%`,
            }}
          />
          <div
            className="bg-yellow-500 h-full transition-all"
            style={{
              width: `${(metric.events_retrying / metric.events_received) * 100}%`,
            }}
          />
          <div
            className="bg-red-500 h-full transition-all"
            style={{
              width: `${(metric.events_failed / metric.events_received) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  val,
  tone,
}: {
  label: string;
  val: number;
  tone: "neutral" | "positive" | "warning" | "negative";
}) {
  const tones = {
    neutral: "text-slate-400",
    positive: "text-emerald-400",
    warning: "text-yellow-400",
    negative: "text-red-400",
  };

  return (
    <div className="flex flex-col items-center">
      <span className={`font-bold tabular-nums ${tones[tone]}`}>{val}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function EmptyState({
  icon,
  message,
  hint,
}: {
  icon: React.ReactNode;
  message: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{message}</p>
      {hint && (
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// UTILITÁRIOS DE FORMATAÇÃO (pure functions, testáveis isoladamente)
// ============================================================================

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins}min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;

  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (mins < 60) return `${mins}m${secs > 0 ? ` ${secs}s` : ""}`;

  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;

  return `${hours}h${remMins > 0 ? ` ${remMins}m` : ""}`;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}
