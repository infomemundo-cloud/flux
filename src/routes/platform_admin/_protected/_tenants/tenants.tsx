import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/platform_admin/_protected/_tenants/tenants")({
  component: TenantsLayout,
});

function TenantsLayout() {
  return <Outlet />;
}
