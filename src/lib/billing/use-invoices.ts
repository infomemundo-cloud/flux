import { useQuery } from "@tanstack/react-query";
import { getOrgInvoices, type Invoice } from "./invoices.functions";

/**
 * Hook para buscar histórico de faturas da organização atual.
 * 
 * - Chama a Server Function `getOrgInvoices`.
 * - Usa chave de cache ["invoices", orgId].
 * - staleTime: 60_000ms (alinha-se com o memo do backend).
 */
export function useInvoices(orgId: string | undefined) {
  return useQuery<Invoice[]>({
    queryKey: ["invoices", orgId],
    queryFn: async () => {
      if (!orgId) throw new Error("Org ID não encontrado");
      
      // A server function espera um objeto { data: { orgId } } ou apenas { orgId }?
      // Verificando a assinatura do createServerFn no passo anterior:
      // .inputValidator((d: unknown) => GetOrgInvoicesSchema.parse(d))
      // Isso significa que passamos diretamente o payload validado pelo Zod.
      // No entanto, a forma padrão de chamar server functions do TanStack Start é:
      // fn({ data: payload })
      
      return await getOrgInvoices({ data: { orgId } });
    },
    enabled: !!orgId,
    staleTime: 60_000, // 60 segundos
    refetchOnWindowFocus: false, // Evita re-fetch automático ao focar na aba
  });
}
