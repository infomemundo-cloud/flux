/**
 * Aba Financeiro com navegação por Sub-Abas (Tabs).
 * FASE 4.8 — Separação Clara de Contextos:
 * • "Planos & Assinatura": Foco comercial (Upgrade/Downgrade/Cancelamento).
 * • "Histórico de Pagamentos": Foco financeiro (Faturas passadas/futuras via invoices).
 * • "Cobranças Pix": chave Pix da org, colada pelo gestor exatamente como
 *   foi gerada no banco dele (zero geração/validação nossa). O composer do
 *   chat consome pix_key via cache ["org", slug] e monta a mensagem única
 *   com a chave; o valor é sempre livre, digitado a cada envio.
 * ARQUITETURA DE DADOS:
 * Mantém as queries globais (access, subscription, pendingSwitch) no escopo do componente pai.
 * Isso garante que trocar de aba não dispare re-fetch desnecessário dos dados de plano,
 * pois eles já estão cacheados pelo TanStack Query.
 */
import { useState } from "react";
import { Banknote, CreditCard, Layers, ReceiptText, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SectionTitle } from "@/components/section-ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { friendlyError } from "@/lib/friendly-error";
import { getAccountAccess } from "@/lib/billing/account-access";
import { updateOrgPixKey } from "@/lib/orgs.functions";
import {
  getCurrentSubscription,
  getPendingTierSwitch,
} from "@/lib/billing/mp-checkout.functions";
import { BillingPlanCard } from "./billing-plan-card";
import { InvoicesPanel } from "./invoices-panel";

interface FinanceiroTabProps {
  orgId: string;
  isOwner: boolean;
  pixKey: string | null;
}

/** Classe das pílulas de sub-aba — padrão responsivo (scroll + fade + snap). */
const SUBTAB_TRIGGER_CLASS =
  "shrink-0 snap-start inline-flex items-center gap-1.5 whitespace-nowrap rounded-full" +
  " px-3 py-1.5 text-xs font-medium cursor-pointer select-none outline-none" +
  " transition-all duration-200 ease-in-out" +
  " bg-secondary/50 text-muted-foreground border border-border/50" +
  " hover:bg-secondary hover:text-foreground hover:shadow-sm hover:border-border" +
  " data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" +
  " data-[state=active]:shadow-md data-[state=active]:border-primary/20 data-[state=active]:font-semibold";

export function FinanceiroTab({ orgId, isOwner, pixKey }: FinanceiroTabProps) {
  const accessFn = useServerFn(getAccountAccess);
  const subscriptionFn = useServerFn(getCurrentSubscription);
  const pendingSwitchFn = useServerFn(getPendingTierSwitch);

  // --- QUERIES GLOBAIS (Dados de Plano/Assinatura) ---
  // Executam imediatamente ao montar a aba principal.
  const { data: access, isLoading: loadingAccess } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // Cache 5 min
    retry: 0,
  });
  const { data: subscription, isLoading: loadingSub } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: () => subscriptionFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // Cache 5 min
    retry: 0,
  });
  const { data: pendingSwitch, isLoading: loadingPendingSwitch } = useQuery({
    queryKey: ["pending-tier-switch", orgId],
    queryFn: () => pendingSwitchFn({ data: { orgId } }),
    staleTime: 1000 * 15, // Cache curto (estado transitório)
    retry: 0,
  });

  const isLoadingPlans = loadingAccess || loadingSub || loadingPendingSwitch;

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={CreditCard}
        title="Financeiro"
        hint="Gerencie o plano vigente, cobranças Pix e faturas da sua organização."
      />

      <Tabs defaultValue="planos" className="w-full space-y-6">
        {/*
         * Wrapper de scroll horizontal com affordance visual — mesmo padrão
         * das abas principais: fade degradê à direita + snap scroll preciso.
         */}
        <div className="relative -mx-4 sm:mx-0">
          {/* Fade degradê à direita — só visível no mobile */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 z-10 bg-gradient-to-l from-background to-transparent sm:hidden"
          />
          <div className="overflow-x-auto scrollbar-none snap-x snap-mandatory">
            <TabsList
              className={
                "flex flex-nowrap items-center gap-1.5 px-4 sm:px-0 py-1" +
                " w-max min-w-full h-auto bg-transparent p-0 justify-start rounded-none"
              }
            >
              <TabsTrigger value="planos" className={SUBTAB_TRIGGER_CLASS}>
                <Layers className="h-3.5 w-3.5 shrink-0" />
                Planos & Assinatura
              </TabsTrigger>
              <TabsTrigger value="faturas" className={SUBTAB_TRIGGER_CLASS}>
                <ReceiptText className="h-3.5 w-3.5 shrink-0" />
                Histórico de Pagamentos
              </TabsTrigger>
              <TabsTrigger value="pix" className={SUBTAB_TRIGGER_CLASS}>
                <Banknote className="h-3.5 w-3.5 shrink-0" />
                Cobranças Pix
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* SUB-ABA 1: PLANOS & ASSINATURA */}
        <TabsContent value="planos" className="space-y-6 focus-visible:outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          {isLoadingPlans ? (
            <CardSkeleton />
          ) : (
            <BillingPlanCard
              subscription={subscription ?? null}
              access={access ?? null}
              pendingSwitch={pendingSwitch ?? null}
              isOwner={isOwner}
              orgId={orgId}
            />
          )}
        </TabsContent>

        {/* SUB-ABA 2: HISTÓRICO DE PAGAMENTOS E FATURAS */}
        <TabsContent value="faturas" className="focus-visible:outline-none animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
          {/* O InvoicesPanel gerencia seu próprio estado de loading/data via hook useInvoices */}
          <InvoicesPanel orgId={orgId} />
        </TabsContent>

        {/* SUB-ABA 3: COBRANÇAS PIX (chave bruta, armazenamento burro) */}
        <TabsContent value="pix" className="focus-visible:outline-none animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">
          <PixSection orgId={orgId} pixKey={pixKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Cadastro da chave Pix da org: 1 input, salvar/remover. O sistema NÃO gera,
 * NÃO valida formato e NÃO normaliza — a chave nasce no banco do cliente e
 * é colada aqui como está (trim é o único tratamento). Guard owner/admin no
 * servidor (assertOrgAdmin); esta aba só renderiza pra owner/admin (guard
 * da rota Configurações).
 */
function PixSection({ orgId, pixKey }: { orgId: string; pixKey: string | null }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrgPixKey);
  const [key, setKey] = useState(pixKey ?? "");
  const dirty = key.trim() !== (pixKey ?? "");
  const configured = !!pixKey;

  const m = useMutation({
    mutationFn: () => updateFn({ data: { orgId, pixKey: key.trim() || null } }),
    onSuccess: () => {
      // Prefixo ["org"] cobre composer e esta aba (mesma key por slug).
      qc.invalidateQueries({ queryKey: ["org"] });
      toast.success(key.trim() ? "Chave Pix salva." : "Chave Pix removida.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Banknote className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Cobranças Pix</div>
        {configured && (
          <span className="rounded-full bg-[var(--pill-green-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pill-green-fg)]">
            configurado
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cole a chave exatamente como foi gerada no seu banco (CPF/CNPJ, e-mail, telefone ou
        aleatória). O sistema não gera nem altera a chave — só armazena e insere nas
        mensagens de cobrança. No chat, o botão Pix monta a mensagem com a chave; o valor
        é sempre livre, digitado a cada envio.
      </p>
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Chave Pix (cole aqui o valor gerado no seu banco)"
        maxLength={120}
        className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs outline-none transition focus:border-primary/50"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || m.isPending}
          onClick={() => m.mutate()}
          className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {m.isPending ? "Salvando..." : "Salvar chave Pix"}
        </button>
        {configured && key.trim() !== "" && (
          <button
            type="button"
            disabled={m.isPending}
            onClick={() => setKey("")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-destructive"
            title="Limpa o campo — salve em seguida pra remover a chave"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover chave
          </button>
        )}
      </div>
    </div>
  );
}

// Componente auxiliar para Skeleton Loading específico da área de planos
function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-64 rounded-2xl bg-card border border-border animate-pulse p-6 shadow-card flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-8 w-16 bg-muted rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-3/4 bg-muted rounded" />
            <div className="h-9 w-full bg-muted rounded-lg mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}
