import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { useInvoices } from "@/lib/billing/use-invoices";
import type { Invoice } from "@/lib/billing/invoices.functions";

// --- FORMATADORES ---

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Formata uma data ISO para exibição curta (DD/MM/AAAA).
 */
function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formata um intervalo de período (ex: 18 Out – 17 Nov).
 * Usado para faturas 'scheduled' onde não há paid_at ainda.
 */
function formatPeriodRange(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "Período Indeterminado";
  
  const start = new Date(startIso);
  const end = new Date(endIso);
  
  // Se for o mesmo dia, mostra apenas uma vez
  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  const startStr = start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const endStr = end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  
  return `${startStr} – ${endStr}`;
}

/**
 * Lógica Central de Exibição de Data:
 * - Se PAID: Mostra a data real do pagamento com ícone de check.
 * - Se SCHEDULED/PROCESSING: Mostra o PERÍODO DE REFERÊNCIA (ciclo mensal) com ícone de calendário.
 * Isso elimina a confusão entre "Pendente" (status) e "Quando vence/refere-se".
 */
function getDisplayDate(inv: Invoice): { label: string; value: string; icon: React.ReactNode } {
  if (inv.status === "paid" && inv.paid_at) {
    return {
      label: "Pago em",
      value: formatDateShort(inv.paid_at),
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
    };
  }

  // Para scheduled, processing, retrying ou failed sem paid_at
  // Prioriza period_end como vencimento, mas se tiver start/end, mostra o ciclo completo
  if (inv.period_start && inv.period_end) {
    return {
      label: "Referência Ciclo",
      value: formatPeriodRange(inv.period_start, inv.period_end),
      icon: <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />,
    };
  }

  // Fallback para due_at se existir (não está na interface atual, mas seguro ter)
  // Como nossa interface só tem period_start/end, caímos aqui se ambos forem nulos
  return {
    label: "Data Prevista",
    value: "A definir",
    icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  };
}

function getLastDigits(id: string): string {
  if (!id) return "—";
  const cleanId = id.replace(/[^a-zA-Z0-9]/g, "");
  return cleanId.slice(-6);
}

// --- COMPONENTES AUXILIARES ---

function StatusBadge({ status }: { status: Invoice["status"] }) {
  switch (status) {
    case "paid":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 gap-1 font-medium">
          <CheckCircle2 className="h-3 w-3" />
          Pago
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1 font-medium">
          <AlertCircle className="h-3 w-3" />
          Falhou
        </Badge>
      );
    case "processing":
    case "retrying":
      return (
        <Badge
          variant="secondary"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/10 gap-1 font-medium"
        >
          <Clock className="h-3 w-3 animate-spin" />
          Processando
        </Badge>
      );
    case "scheduled":
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground border-border gap-1 font-medium">
          <Clock className="h-3 w-3" />
          Agendado
        </Badge>
      );
  }
}

// --- COMPONENTE PRINCIPAL ---

/** Ordena por vencimento/período desc (extrato bancário: mais recente primeiro,
 *  incluindo pendentes). Fallback em created_at quando não há period_end. */
function sortByRecency(a: Invoice, b: Invoice): number {
  const ka = a.period_end ?? a.paid_at ?? "";
  const kb = b.period_end ?? b.paid_at ?? "";
  return String(kb).localeCompare(String(ka));
}

/**
 * Próxima cobrança = a NÃO-PAGA com MAIOR period_end (vencimento futuro mais
 * distante), nunca a primeira do sort por paid_at (que caía na invoice antiga
 * com período inflado). Sem não-pagas → null (tela mostra "último pagamento").
 */
function pickNextCharge(invoices: Invoice[]): Invoice | null {
  const pending = invoices.filter((i) => i.status !== "paid");
  if (pending.length === 0) return null;
  return pending.reduce((best, cur) =>
    String(cur.period_end ?? "") > String(best.period_end ?? "") ? cur : best,
  );
}

/** Formata intervalo compacto para referência de ciclo (ex: 18/10 – 18/11). */
function formatPeriodCompact(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Botão discreto de copiar ID completo com feedback visual. */
function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success("ID copiado para a área de transferência.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };
  
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground transition hover:bg-secondary hover:text-foreground active:scale-95"
      title={`Copiar ID completo: ${id}`}
      aria-label={`Copiar ID da transação ${id}`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          MP #{id.slice(-6)}
        </>
      )}
    </button>
  );
}

export function InvoicesPanel({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useInvoices(orgId);

  const sorted = useMemo(() => [...(data ?? [])].sort(sortByRecency), [data]);
  const totalPaid = sorted
    .filter((i) => i.status === "paid")
    .reduce((acc, curr) => acc + curr.amount_cents, 0);
  const nextScheduled = pickNextCharge(sorted);
  const lastProcessed = sorted.find((i) => i.status === "paid") ?? null;
  const hasAnyPaid = totalPaid > 0;
  
  // Ciclo vigente: usa subscription se disponível, senão infere da última invoice paga
  // (period_end da última = início do próximo ciclo previsto)
  const currentCycleStart = lastProcessed?.period_end ?? null;
  const currentCycleEnd = nextScheduled?.period_end ?? 
    (lastProcessed ? new Date(new Date(lastProcessed.period_end!).getTime() + 30*86_400_000).toISOString() : null);

  return (
    <div className="space-y-6">
      {/* CARDS DE RESUMO SUPERIORES — hierarquia sem ambiguidade */}
      {!isLoading && !isError && sorted.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* CARD 1: ÚLTIMO PAGAMENTO (efetivo passado) */}
          <Card className="border-border bg-card shadow-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Último Pagamento
              </CardDescription>
              <CardTitle className="text-xl font-semibold tabular-nums text-foreground">
                {lastProcessed ? brlFormatter.format(lastProcessed.amount_cents / 100) : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {lastProcessed && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Confirmado em{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatDateShort(lastProcessed.paid_at)}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Transação
                      </span>
                      <CopyIdButton id={lastProcessed.mp_payment_id} />
                    </div>
                  </>
                )}
                {!lastProcessed && (
                  <p className="text-xs text-muted-foreground italic">
                    Nenhum pagamento efetivo registrado.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* CARD 2: CICLO VIGENTE / PRÓXIMA RENOVÃO (futuro previsto) */}
          <Card className="border-border bg-card shadow-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs flex items-center gap-1.5">
                <CalendarRange className="h-3 w-3 text-primary" />
                Ciclo Vigente
              </CardDescription>
              <CardTitle className="text-lg font-semibold tabular-nums text-foreground">
                {currentCycleStart && currentCycleEnd
                  ? formatPeriodCompact(currentCycleStart, currentCycleEnd)
                  : nextScheduled
                    ? formatPeriodCompact(nextScheduled.period_start, nextScheduled.period_end)
                    : "A definir"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {nextScheduled ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Próxima cobrança prevista:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatDateShort(nextScheduled.period_end)}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/80">
                      Valor estimado: {brlFormatter.format(nextScheduled.amount_cents / 100)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Todas as cobranças do ciclo atual foram quitadas.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* CARD 3: TOTAL ACUMULADO (histórico efetivo) */}
          <Card className="border-border bg-card shadow-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total Pago Acumulado</CardDescription>
              <CardTitle
                className={`text-xl font-semibold tabular-nums ${
                  hasAnyPaid
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {brlFormatter.format(totalPaid / 100)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {sorted.filter((i) => i.status === "paid").length} fatura(s) paga(s)
                </p>
                {sorted.some((i) => i.status !== "paid") && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    {sorted.filter((i) => i.status !== "paid").length} pendente(s)/agendada(s)
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TABELA PRINCIPAL DE EXTRATO */}
      <Card className="border-border bg-card shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-muted text-muted-foreground shrink-0">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Extrato Detalhado de Faturas
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Histórico completo de cobranças, pagamentos pendentes e efetivos.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* LOADING STATE */}
          {isLoading && (
            <div className="p-6 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <Skeleton className="h-5 w-32 bg-muted" />
                  <Skeleton className="h-5 w-24 bg-muted" />
                  <Skeleton className="h-5 w-16 bg-muted" />
                  <Skeleton className="h-5 w-20 bg-muted" />
                </div>
              ))}
            </div>
          )}

          {/* ERROR STATE */}
          {isError && !isLoading && (
            <div className="py-12 text-center">
              <p className="text-sm text-destructive">
                Não foi possível carregar o histórico de cobrança.
              </p>
            </div>
          )}

          {/* EMPTY STATE */}
          {!isLoading && !isError && (!data || data.length === 0) && (
            <div className="py-16 flex flex-col items-center justify-center text-center gap-3">
              <div className="h-12 w-12 items-center justify-center rounded-full bg-muted border border-border flex">
                <ReceiptText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Nenhuma cobrança registrada
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed mx-auto">
                  O histórico de faturas e pagamentos aparecerá automaticamente assim que novas cobranças forem geradas pelo sistema.
                </p>
              </div>
            </div>
          )}

          {/* LISTA REAL — escaneável como extrato bancário/Stripe */}
          {!isLoading && !isError && sorted.length > 0 && (
            <Table>
              <TableHeader className="bg-muted/50 border-b border-border">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs text-muted-foreground font-medium pl-6">
                    Movimento
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">
                    Referência do Ciclo
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">
                    ID Transação
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium text-right">
                    Valor
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium text-right pr-6">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((inv) => {
                  const isPaid = inv.status === "paid";
                  const movementDate = isPaid ? formatDateShort(inv.paid_at) : "—";
                  const cycleRef = formatPeriodCompact(inv.period_start, inv.period_end);
                  
                  return (
                    <TableRow 
                      key={inv.id} 
                      className="border-border/60 hover:bg-muted/30 transition-colors group/row"
                    >
                      {/* COLUNA MOVIMENTO (data efetiva ou placeholder) */}
                      <TableCell className="pl-6 py-4 align-middle">
                        <div className="flex items-center gap-2">
                          {isPaid ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {movementDate}
                            </p>
                            {!isPaid && (
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                {inv.status === "scheduled" ? "Agendado" : 
                                 inv.status === "processing" ? "Processando" : 
                                 inv.status === "failed" ? "Falhou" : "Pendente"}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      
                      {/* COLUNA REFERÊNCIA DO CICLO (novo!) */}
                      <TableCell className="py-4 align-middle">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono tabular-nums">
                            {cycleRef}
                          </span>
                        </div>
                      </TableCell>
                      
                      {/* COLUNA ID TRANSAÇÃO (com botão copiar) */}
                      <TableCell className="py-4 align-middle">
                        <CopyIdButton id={inv.mp_payment_id} />
                      </TableCell>
                      
                      {/* COLUNA VALOR (alinhado à direita) */}
                      <TableCell className="text-sm font-semibold text-foreground tabular-nums py-4 align-middle text-right">
                        {brlFormatter.format(inv.amount_cents / 100)}
                      </TableCell>
                      
                      {/* COLUNA STATUS (badge semântico contextualizado) */}
                      <TableCell className="text-right pr-6 py-4 align-middle">
                        <StatusBadge status={inv.status as Invoice["status"]} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
