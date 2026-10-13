import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveOrgBySlug } from "@/lib/orgs.functions";
import { SuccessStateView } from "./-components/success-state-view";

export const Route = createFileRoute(
  "/_authenticated/app/o/$slug/billing/success",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    preapproval_id: (search.preapproval_id as string) ?? "",
    status: (search.status as string) ?? "unknown",
  }),
  // Loader server-side: resolve slug→orgId + valida RBAC ANTES do componente montar.
  // Padrão mercado (Stripe/Vercel/Supabase): identificador público vira interno no server.
  loader: async ({ params }) => {
    const org = await resolveOrgBySlug({ data: { slug: params.slug } });
    if (!org) throw redirect({ to: "/app" }); // fallback gracioso, nunca erro duro
    return { orgId: org.id, orgName: org.name };
  },
  component: SuccessStateView,
});
