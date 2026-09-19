import { createFileRoute } from "@tanstack/react-router";
import { sendMediaMessage } from "@/lib/whatsapp.functions";
import { createServerFn } from "@tanstack/react-start";

/**
 * Rota pública-interna que recebe FormData do composer e delega pra server
 * function sendMediaMessage (em whatsapp.functions.ts). Precisamos dessa
 * camada porque o TanStack Router não aceita FormData direto em server function
 * via chamada de cliente — fetch + rota dedicada resolve isso.
 */
export const Route = createFileRoute("/api/public/send-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });
        try {
          // Delega pra server function passando o request intacto (FormData).
          const result = await sendMediaMessage({ request });
          return json(result, 200);
        } catch (e: any) {
          const msg = typeof e?.message === "string" ? e.message : "Falha no envio.";
          console.error("[api/send-media] error", msg);
          return json({ ok: false, error: msg }, 400);
        }
      },
    },
  },
});