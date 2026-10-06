import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/platform_admin/_protected/_tiers/tiers")({
  component: TiersLayout,
});

function TiersLayout() {
  return <Outlet />;
}
