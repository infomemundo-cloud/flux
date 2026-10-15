/**
 * Endpoint interno invocado pela Vercel Cron a cada 15 minutos.
 * Não é acessível pelo browser nem por clientes externos — protegido por
 * CRON_SECRET validado dentro de handleCronTrigger().
 * 
 * Contrato HTTP:
 * • Método: POST
 * • Header obrigatório: Authorization: Bearer <CRON_SECRET>
 * • Resposta: 200 JSON sempre (mesmo em erro, para evitar retry infinito da Vercel).
 * 
 * Segurança (§5):
 * • A verificação de secret acontece DENTRO da função, não aqui. Este arquivo
 *   é apenas um conduit estrutural entre a rota declarada no vercel.json e
 *   a lógica de negócio isolada em mp-cron-endpoint.server.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
// 👇 IMPORTAÇÃO SEGURA: Sufixo .server.ts impede análise pelo bundler client
import { handleCronTrigger } from "@/lib/billing/mp-cron-endpoint.server"; 

export const Route = createFileRoute("/api/internal/cron-trigger")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return await handleCronTrigger(request);
      },
    },
  },
});
