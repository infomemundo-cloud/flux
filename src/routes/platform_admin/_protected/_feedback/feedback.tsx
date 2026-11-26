import { createFileRoute, Outlet } from "@tanstack/react-router";
/**
 * Layout pai da seção de feedback (padrão aninhado oficial, lição 3.4):
 * route id = caminho completo COM o arquivo; a index monta neste Outlet.
 */
export const Route = createFileRoute("/platform_admin/_protected/_feedback/feedback")({
  component: () => <Outlet />,
});
