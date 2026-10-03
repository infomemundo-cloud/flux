import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/platform_admin/_protected/_webhooks/webhooks")({
  component: () => <Outlet />,
});
