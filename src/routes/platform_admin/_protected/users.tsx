import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout pai da seção de usuários (Fase 1.8, padrão oficial de rotas
 * aninhadas do TanStack Router): como `/users/$userId` é filha de `/users`,
 * a pai PRECISA renderizar <Outlet /> pra filha montar. Sem isso, o detalhe
 * casava na URL mas nunca renderizava (a antiga pai era a lista, sem Outlet).
 * Este arquivo não tem lógica própria: só delega pra index ($userId).
 */
export const Route = createFileRoute("/platform_admin/_protected/users")({
  component: () => <Outlet />,
});
