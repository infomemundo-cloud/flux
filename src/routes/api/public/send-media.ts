import { createFileRoute } from "@tanstack/react-router";
import { sendMediaMessage } from "@/lib/whatsapp.functions";

/**
 * Rota pública-interna que recebe FormData do composer e delega pra server
 * function sendMediaMessage. Extrai os dados do FormData e converte pra
 * base64 antes de passar pra server function (que espera parâmetros estruturados,
 * não request direto).
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
          const form = await request.formData();
          const demandId = String(form.get("demandId") ?? "");
          const orgId = String(form.get("orgId") ?? "");
          const caption = String(form.get("caption") ?? "");
          const role = String(form.get("role") ?? "agent");
          const fileName = String(form.get("fileName") ?? "");
          const mimeType = String(form.get("mimeType") ?? "");
          const file = form.get("file");

          if (!(file instanceof File)) {
            return json({ ok: false, error: "Arquivo obrigatório." }, 400);
          }

          // Converte File pra base64
          const arrayBuffer = await file.arrayBuffer();
          const fileBase64 = Buffer.from(arrayBuffer).toString("base64");

          // Chama a server function com parâmetros estruturados
          const result = await sendMediaMessage({
            data: {
              demandId,
              orgId,
              caption,
              role: role as "agent" | "system",
              fileName: fileName || file.name,
              mimeType: mimeType || file.type || "application/octet-stream",
              fileBase64,
            },
          });

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