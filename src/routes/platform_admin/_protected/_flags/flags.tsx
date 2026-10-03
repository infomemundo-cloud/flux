import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout pai da seção de feature flags (padrão aninhado oficial):
 * a rota index (flags.index.tsx) e futuras filhas montam neste Outlet.
 */
export const Route = createFileRoute("/platform_admin/_protected/_flags/flags")({
  component: () => <Outlet />,
});
