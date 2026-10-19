/**
 * Endpoint interno invocado pela Vercel Cron.
 * Protegido internamente pelo CRON_SECRET validado em handleCronTrigger().
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleCronTrigger } from "@/lib/billing/mp-cron-endpoint.server"; 

export const Route = createFileRoute("/api/internal/cron-trigger")({
  server: {
    handlers: {
      // Vercel Cron envia GET por padrão
      GET: async ({ request }) => {
        return await handleCronTrigger(request);
      },
      // Mantemos o POST para testes manuais protegidos se necessário
      POST: async ({ request }) => {
        return await handleCronTrigger(request);
      },
    },
  },
});
