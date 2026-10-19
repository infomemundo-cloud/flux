import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptText } from "lucide-react"; // Ícone consistente com o placeholder atual
import { useInvoices } from "@/lib/billing/use-invoices";
import type { Invoice } from "@/lib/billing/invoices.functions";

// --- Helpers de Formatação ---

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDate(iso: string | null): string {
  if (!iso) return "Pendente";
  const date = new Date(iso);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getLastDigits(id: string): string {
  if (!id) return "";
  // Remove caracteres não alfanuméricos para garantir consistência se houver prefixos
  const cleanId = id.replace(/[^a-zA-Z0-9]/g, "");
  return cleanId.slice(-6);
}

// --- Componente de Status ---

function StatusBadge({ status }: { status: Invoice["status"] }) {
  switch (status) {
    case "paid":
      return (
        <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 hover:bg-green-500/10">
          Pago
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Falhou</Badge>;
    case "processing":
    case "retrying":
      return (
        <Badge 
          variant="secondary" 
          className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10"
        >
          Processando
        </Badge>
      );
    case "scheduled":
    default:
      return <Badge variant="outline">Agendado</Badge>;
  }
}

// --- Componente Principal ---

export function InvoicesPanel({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useInvoices(orgId);

  return (
    <Card className="border-slate-800 bg-slate-900/40 h-fit rounded-2xl shadow-none">
      <CardHeader className="pb-3 px-6 pt-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-slate-800 text-slate-400 shrink-0">
            <ReceiptText className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Histórico de Cobrança
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Faturas e comprovantes de pagamento.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 px-6 pb-6">
        
        {/* 1. Loading State (Skeleton) */}
        {isLoading && (
          <div className="space-y-4 pt-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24 bg-slate-800" />
                  <Skeleton className="h-3 w-32 bg-slate-800" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full bg-slate-800" />
              </div>
            ))}
          </div>
        )}

        {/* 2. Error State */}
        {isError && !isLoading && (
          <div className="py-6 text-center">
            <p className="text-xs text-destructive">
              Não foi possível carregar o histórico de cobrança.
            </p>
          </div>
        )}

        {/* 3. Empty State */}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-3">
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/50 border border-slate-700/50">
              <ReceiptText className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                Nenhuma cobrança registrada
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-[210px] leading-relaxed mx-auto">
                O histórico de faturas e notas fiscais aparecerá automaticamente após a primeira cobrança.
              </p>
            </div>
          </div>
        )}

        {/* 4. Data List */}
        {!isLoading && !isError && data && data.length > 0 && (
          <ul className="divide-y divide-slate-800">
            {data.map((inv) => (
              <li
                key={inv.id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular-nums text-foreground">
                    {brlFormatter.format(inv.amount_cents / 100)}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {formatDate(inv.paid_at)} · MP #{getLastDigits(inv.mp_payment_id)}
                  </p>
                </div>
                <StatusBadge status={inv.status as Invoice["status"]} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
