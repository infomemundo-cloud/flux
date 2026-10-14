import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout pai da seção de Billing Health no Platform Admin.
 * 
 * Padrão aninhado oficial (§4): a rota index (billing.index.tsx) e futuras 
 * filhas (ex: logs detalhados, reconciliação manual) montam neste Outlet.
 * 
 * Este componente é intencionalmente transparente — não adiciona UI própria,
 * apenas serve como conduit estrutural para hierarquia de rotas. A segurança 
 * (assertPlatformAdmin) reside nas Server Functions chamadas pelos componentes
 * filhos, não aqui.
 */
export const Route = createFileRoute("/platform_admin/_protected/_billing/billing")({
  component: () => <Outlet />,
});
