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
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  RefreshCw,
  ShieldAlert,
  Zap,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  getBillingHealthSnapshot,
  runBillingHealthCheck,
  getCronStatus,
  setCronEnabled,
} from "@/lib/billing/billing-health.functions";

export const Route = createFileRoute("/platform_admin/_protected/_billing/billing/")({
  head: () => ({ meta: [{ title: "Saúde do Billing — Flux Platform Admin" }] }),
  component: BillingHealthDashboard,
});

function BillingHealthDashboard() {
  const qc = useQueryClient();
  const [historyLimit, setHistoryLimit] = useState(10);

  const fetchSnapshot = useServerFn(getBillingHealthSnapshot);
  const executeCheck = useServerFn(runBillingHealthCheck);
  const fetchCronStatus = useServerFn(getCronStatus);
  const toggleCronFn = useServerFn(setCronEnabled);

  const snapshotQ = useQuery({
    queryKey: ["billing-health-snapshot", historyLimit],
    queryFn: () => fetchSnapshot({ data: { limit: historyLimit } }),
    staleTime: 5 * 60 * 1000,
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
  });

  const cronQ = useQuery({
    queryKey: ["billing-cron-status"],
    queryFn: () => fetchCronStatus(),
    staleTime: 30 * 1000,
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
  });

  const isCronActive = cronQ.data?.enabled ?? false;
  const lastRunInfo = cronQ.data?.last_run_at
    ? formatRelativeTime(cronQ.data.last_run_at)
    : "Nunca executado";

  const checkMut = useMutation({
    mutationFn: () => executeCheck({ data: { triggeredBy: "manual" } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["billing-health-snapshot"] });
      
      toast.success(`Verificação concluída (${result.metrics.durationMs}ms)`);
      
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

  const toggleCronMut = useMutation<{ ok: boolean; enabled: boolean }, Error, { enabled: boolean }>({
    mutationFn: ({ enabled }) => toggleCronFn({ data: { enabled } }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["billing-cron-status"] });
      toast.success(variables.enabled ? "Cron ativado." : "Cron pausado.");
    },
    onError: (err: any) => {
      toast.error("Falha ao alterar status do cron", { description: err.message });
    },
  });

  const latestMetric = snapshotQ.data?.[0];
  const hasIssues =
    latestMetric &&
    (latestMetric.events_failed > 0 ||
      latestMetric.oldest_pending_age_sec > 900 ||
      latestMetric.max_attempts_seen >= 8);

  return (
    <div className="space-y-6 p-6">
      {/* Header Compacto com CTA Principal */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 text-slate-100">
            <Activity className="h-5 w-5 text-primary shrink-0" />
            Saúde do Pipeline de Billing
          </h1>
          <p className="text-xs text-slate-400 mt-1 truncate">
            Monitoramento de eventos Mercado Pago • Última atualização:{" "}
            {latestMetric
              ? formatRelativeTime(latestMetric.window_end)
              : "Nunca verificada"}
          </p>
        </div>

        <Button
          size="sm"
          variant={hasIssues ? "destructive" : "default"}
          onClick={() => checkMut.mutate()}
          disabled={checkMut.isPending}
          className="gap-2 shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-950/40"
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
        {/* Card 1: Status Geral */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Estado Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isLoading && !snapshotQ.data ? (
              <Skeleton className="h-16 w-full bg-slate-800" />
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
                  className={`w-full justify-center py-1.5 text-[11px] font-semibold ${
                    hasIssues 
                      ? "bg-red-500/20 text-red-300 border border-red-500/30" 
                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {hasIssues ? "⚠️ Atenção Necessária" : "✅ Sistema Saudável"}
                </Badge>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {hasIssues
                    ? `${latestMetric.events_failed} falha(s) e ${latestMetric.total_zombies_now} pendência(s) detectada(s).`
                    : "Todos os eventos processados corretamente nas últimas janelas."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Eventos Recentes */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Janela Últimos 15min
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isLoading && !snapshotQ.data ? (
              <Skeleton className="h-16 w-full bg-slate-800" />
            ) : !latestMetric ? (
              <EmptyState icon={<Clock />} message="—" hint="" />
            ) : (
              <div className="space-y-1.5">
                <StatRow label="Recebidos" value={latestMetric.events_received} color="text-blue-400" />
                <StatRow label="Processados" value={latestMetric.events_processed} color="text-emerald-400" />
                <StatRow label="Retry" value={latestMetric.events_retrying} color="text-yellow-400" />
                <StatRow label="Falhas" value={latestMetric.events_failed} color="text-red-400" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Idade Máxima Pendente */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Evento Mais Antigo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isLoading && !snapshotQ.data ? (
              <Skeleton className="h-16 w-full bg-slate-800" />
            ) : !latestMetric ? (
              <EmptyState icon={<AlertTriangle />} message="—" hint="" />
            ) : (
              <div className="space-y-1">
                <div
                  className={`text-lg font-bold tabular-nums transition-colors ${
                    latestMetric.oldest_pending_age_sec > 900
                      ? "text-red-400"
                      : latestMetric.oldest_pending_age_sec > 300
                        ? "text-yellow-400"
                        : "text-emerald-400"
                  }`}
                >
                  {formatDuration(latestMetric.oldest_pending_age_sec)}
                </div>
                <p className="text-[10px] text-slate-400">
                  {latestMetric.total_zombies_now === 0
                    ? "Nenhum evento preso aguardando."
                    : `${latestMetric.total_zombies_now} evento(s) aguardando.`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Pico de Retries */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Pico de Retries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotQ.isLoading && !snapshotQ.data ? (
              <Skeleton className="h-16 w-full bg-slate-800" />
            ) : !latestMetric ? (
              <EmptyState icon={<RefreshCw />} message="—" hint="" />
            ) : (
              <div className="space-y-1">
                <div
                  className={`text-lg font-bold tabular-nums transition-colors ${
                    latestMetric.max_attempts_seen >= 8
                      ? "text-red-400"
                      : latestMetric.max_attempts_seen >= 5
                        ? "text-yellow-400"
                        : "text-slate-200"
                  }`}
                >
                  {latestMetric.max_attempts_seen}/10
                </div>
                <p className="text-[10px] text-slate-400">
                  Limite técnico: MAX_ATTEMPTS=10.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BLOCO: CONTROLE DO CRON DE SEGURANÇA */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:bg-slate-900/60">
        
        {/* Lado Esquerdo: Info & Contexto */}
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isCronActive ? 'bg-emerald-950/30 text-emerald-400 ring-1 ring-emerald-900/50' : 'bg-slate-800/50 text-slate-400'}`}>
            <Timer className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200 leading-none mb-1">
              Automação de Recuperação (Cron)
            </h3>
            <p className="text-[11px] text-slate-400 max-w-md leading-relaxed">
              Processa eventos pendentes e reconcilia assinaturas com o Mercado Pago diariamente.
              <span className="block mt-0.5 text-[10px] text-slate-500 italic">
                Desative durante manutenções ou testes manuais intensivos.
              </span>
            </p>
          </div>
        </div>

        {/* Lado Direito: Status + Toggle perfeitamente alinhados */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end pt-3 md:pt-0 border-t md:border-t-0 border-slate-800/80">
          
          {/* Texto Auxiliar de Última Execução */}
          {!cronQ.isLoading && (
            <span className="text-[10px] text-slate-500 whitespace-nowrap">
              Last: {lastRunInfo}
            </span>
          )}

          {/* Badge Dinâmico */}
          {cronQ.isLoading && !cronQ.data ? (
            <Skeleton className="h-6 w-20 bg-slate-800" />
          ) : (
            <Badge 
              variant="outline" 
              className={`capitalize px-2 py-1 text-[10px] font-bold tracking-wide border ${
                isCronActive 
                  ? "bg-emerald-950/50 text-emerald-300 border-emerald-900/50" 
                  : "bg-slate-800/50 text-slate-400 border-slate-700/50"
              }`}
            >
              {isCronActive ? "● ATIVO" : "○ PAUSADO"}
            </Badge>
          )}

          {/* Switch Ligado/Desligado */}
          <Switch 
            checked={isCronActive} 
            onCheckedChange={(checked) => toggleCronMut.mutate({ enabled: checked })}
            disabled={toggleCronMut.isPending || cronQ.isLoading}
            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-700 scale-105"
          />
        </div>
      </div>

      {/* Seção de Histórico Expandido */}
      <section
        id="details"
        className="space-y-3 pt-4 border-t border-slate-800/80"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
            <Database className="h-4 w-4 text-slate-400" />
            Histórico de Execuções
          </h2>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setHistoryLimit((prev) => prev + 10)}
            disabled={snapshotQ.isFetching || historyLimit >= 50}
            className="shrink-0 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
          >
            Carregar mais (+10)
          </Button>
        </div>

        {snapshotQ.isLoading && historyLimit === 10 && !snapshotQ.data ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl bg-slate-800" />
            ))}
          </div>
        ) : !snapshotQ.data?.length ? (
          <EmptyState
            icon={<Database />}
            message="Nenhuma execução registrada ainda"
            hint='Use o botão "Executar Verificação Agora" acima para popular o histórico.'
          />
        ) : (
          <div className="space-y-2.5">
            {snapshotQ.data.map((metric) => (
              <MetricRow key={metric.id} metric={metric} />
            ))}
            
            {historyLimit >= 50 && (
              <p className="text-center text-[10px] text-slate-500 pt-2">
                Mostrando últimas 50 execuções. Para análise profunda, consulte logs na Vercel ou Supabase.
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

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-950/40 border border-slate-800/50">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span className={`text-xs font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function MetricRow({ metric }: { metric: any }) {
  const isRecent =
    Date.now() - new Date(metric.window_end).getTime() < 15 * 60 * 1000;

  return (
    <div
      className={`rounded-xl border p-4 transition-colors shadow-md ${
        isRecent
          ? "border-emerald-500/30 bg-slate-900/80 ring-1 ring-emerald-500/10"
          : "border-slate-800 bg-slate-900/40 hover:bg-slate-900/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[10px] h-5 px-2 font-medium ${
              metric.triggered_by === "manual" 
                ? "bg-sky-500/10 text-sky-300 border-sky-500/20" 
                : "bg-purple-500/10 text-purple-300 border-purple-500/20"
            }`}
          >
            {metric.triggered_by === "manual" ? "👤 Manual" : "⏰ Cron"}
          </Badge>
          <span className="text-xs font-medium text-slate-300">
            {new Date(metric.window_start).toLocaleString("pt-BR")}
          </span>
        </div>

        <div className="text-right shrink-0">
          <span className="text-xs font-mono font-medium text-slate-300">
            {(metric.duration_ms / 1000).toFixed(1)}s
          </span>
          <span className="text-[10px] text-slate-500 ml-1.5">dur. exec.</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <MiniStat label="Recv" val={metric.events_received} tone="neutral" />
        <MiniStat label="Proc" val={metric.events_processed} tone="positive" />
        <MiniStat label="Retry" val={metric.events_retrying} tone="warning" />
        <MiniStat label="Fail" val={metric.events_failed} tone="negative" />
        <MiniStat label="Ignr" val={metric.events_ignored} tone="neutral" />
      </div>

      {metric.events_received > 0 && (
        <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden flex ring-1 ring-slate-800">
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
    neutral: "text-slate-300",
    positive: "text-emerald-400",
    warning: "text-yellow-400",
    negative: "text-red-400",
  };

  return (
    <div className="flex flex-col bg-slate-950/60 rounded-lg p-2 border border-slate-800/80 text-center">
      <span className={`font-bold tabular-nums text-xs ${tones[tone]}`}>{val}</span>
      <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">
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
      <div className="h-10 w-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-400 shadow-inner">
        {icon}
      </div>
      <p className="text-sm font-medium text-slate-200">{message}</p>
      {hint && (
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

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
