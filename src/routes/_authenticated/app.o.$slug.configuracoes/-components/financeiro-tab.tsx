import { CreditCard } from "lucide-react";
import { SectionTitle } from "@/components/section-ui";
import { ComingSoon } from "./coming-soon";

/** Aba Financeiro: camada de cobrança do tenant (R2/R3 do plano). */
export function FinanceiroTab() {
  return (
    <>
      <SectionTitle
        icon={CreditCard}
        title="Financeiro"
        hint="Plano vigente, cobrança e faturas desta organização. Regras de preço/parcelamento vivem no platform_admin."
      />
      <ComingSoon
        icon={CreditCard}
        title="Plano, limites e cobranças"
        description="Plano atual e limites vigentes somente-leitura (R3); parcelas pagas/em aberto e histórico de faturas visíveis pra owner e admin; método de pagamento, upgrade/downgrade exclusivos do owner."
      />
    </>
  );
}