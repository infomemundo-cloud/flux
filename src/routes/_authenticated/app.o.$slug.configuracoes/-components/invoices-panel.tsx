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
import { ReceiptText, CheckCircle2, Clock, AlertCircle, CalendarDays } from "lucide-react";
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

export function InvoicesPanel({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useInvoices(orgId);

  // Métricas Agregadas
  const totalPaid = data?.filter((i) => i.status === "paid").reduce((acc, curr) => acc + curr.amount_cents, 0) ?? 0;
  
  // Identifica a próxima cobrança prevista (primeira não-paga ordenada por period_end asc, 
  // mas como nosso sort é DESC por paid_at/nulls last, assumimos que a primeira da lista 
  // que não é 'paid' é a mais relevante para o resumo superior)
  const nextScheduled = data?.find(i => i.status !== 'paid');
  const lastProcessed = data?.find(i => i.status === 'paid');

  return (
    <div className="space-y-6">
      {/* CARDS DE RESUMO SUPERIORES */}
      {!isLoading && !isError && data && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* CARD 1: SITUAÇÃO ATUAL DA COBRANÇA */}
          <Card className="border-border bg-card shadow-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs flex items-center gap-1.5">
                {nextScheduled ? (
                  <>
                    <Clock className="h-3 w-3" />
                    Próxima Cobrança Prevista
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Último Pagamento Efetivo
                  </>
                )}
              </CardDescription>
              <CardTitle className="text-xl font-semibold text-foreground">
                {nextScheduled 
                  ? brlFormatter.format(nextScheduled.amount_cents / 100) 
                  : (lastProcessed ? brlFormatter.format(lastProcessed.amount_cents / 100) : "R$ 0,00")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {nextScheduled ? (
                  <>
                    Referência: {formatPeriodRange(nextScheduled.period_start, nextScheduled.period_end)}
                  </>
                ) : (
                  <>
                    Pago em: {lastProcessed ? formatDateShort(lastProcessed.paid_at) : "—"}
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          {/* CARD 2: VOLUME HISTÓRICO */}
          <Card className="border-border bg-card shadow-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total de Faturas Registradas</CardDescription>
              <CardTitle className="text-xl font-semibold text-foreground">
                {data.length} {data.length === 1 ? "fatura" : "faturas"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Sincronizado via Mercado Pago</p>
            </CardContent>
          </Card>

          {/* CARD 3: TOTAL EFETIVO */}
          <Card className="border-border bg-card shadow-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total Pago em Faturas</CardDescription>
              <CardTitle className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {brlFormatter.format(totalPaid / 100)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Histórico acumulado</p>
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

          {/* LISTA REAL */}
          {!isLoading && !isError && data && data.length > 0 && (
            <Table>
              <TableHeader className="bg-muted/50 border-b border-border">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs text-muted-foreground font-medium pl-6">
                    Data / Referência
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">
                    ID Transação MP
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">
                    Valor
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium text-right pr-6">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((inv) => {
                  const displayInfo = getDisplayDate(inv);
                  
                  return (
                    <TableRow key={inv.id} className="border-border/60 hover:bg-muted/30 transition-colors">
                      {/* COLUNA DATA REFINADA */}
                      <TableCell className="pl-6 py-4 align-middle">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                            {displayInfo.icon}
                            {displayInfo.label}
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            {displayInfo.value}
                          </span>
                        </div>
                      </TableCell>
                      
                      {/* COLUNA ID */}
                      <TableCell className="text-xs text-muted-foreground font-mono py-4 align-middle">
                        MP #{getLastDigits(inv.mp_payment_id)}
                      </TableCell>
                      
                      {/* COLUNA VALOR */}
                      <TableCell className="text-sm font-semibold text-foreground tabular-nums py-4 align-middle">
                        {brlFormatter.format(inv.amount_cents / 100)}
                      </TableCell>
                      
                      {/* COLUNA STATUS */}
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