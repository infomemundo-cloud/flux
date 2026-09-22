import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertMember } from "@/lib/demandas/demandas-guard";

/**
 * CRM leve do contato: notas permanentes + etiquetas coloridas + empresa +
 * e-mail. Edição pra todos os papéis humanos de operação (owner, admin,
 * gerente, operador — agente_ia fica fora por não usar UI).
 * Escrita via supabaseAdmin + guard assertMember (defesa em profundidade:
 * a policy "members access contacts" existiria como segunda camada).
 */
const HUMAN_OP_ROLES = ["owner", "admin", "gerente", "operador"] as const;

export const TAG_COLORS = ["brand", "amber", "orange", "violet", "green", "red", "neutral"] as const;

const TagSchema = z.object({
  label: z.string().trim().min(1).max(24),
  color: z.enum(TAG_COLORS),
});

export type ContactTag = z.infer<typeof TagSchema>;

/**
 * Sementes padrão do combobox de etiquetas: garantem sugestões úteis mesmo
 * com a org ainda sem nenhuma etiqueta criada. Etiquetas reais da org
 * (derivadas de contacts.tags) têm prioridade na lista.
 */
export const DEFAULT_TAG_SUGGESTIONS: ContactTag[] = [
  { label: "VIP", color: "amber" },
  { label: "Lead Quente", color: "orange" },
  { label: "Atacado", color: "violet" },
  { label: "Inadimplente", color: "red" },
  { label: "E-commerce", color: "brand" },
  { label: "Cliente Antigo", color: "green" },
];

export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contactId: z.string().uuid(),
        notes: z.string().max(4000).nullable().optional(),
        tags: z.array(TagSchema).max(12).optional(),
        company: z.string().trim().max(120).nullable().optional(),
        email: z
          .string()
          .trim()
          .max(120)
          .email({ message: "E-mail inválido." })
          .nullable()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: contact, error: fetchErr } = await supabaseAdmin
      .from("contacts")
      .select("org_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!contact) throw new Error("Contato não encontrado");
    const role = await assertMember(context.supabase, contact.org_id, context.userId);
    if (!HUMAN_OP_ROLES.includes(role as (typeof HUMAN_OP_ROLES)[number]))
      throw new Error("Sem permissão para editar o contato");
    const patch: Record<string, unknown> = {};
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.company !== undefined) patch.company = data.company;
    if (data.email !== undefined) patch.email = data.email;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("contacts")
      .update(patch as never)
      .eq("id", data.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Sugestões de etiquetas da organização: distintas entre todos os contatos
 * da org (labels + cores já usadas), ordenadas alfabeticamente. O combobox
 * do trilho mescla isso com DEFAULT_TAG_SUGGESTIONS. Volume pequeno → uma
 * query só da coluna tags, dedupe em memória.
 */
export const listOrgTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("contacts")
      .select("tags")
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    const seen = new Map<string, ContactTag>();
    for (const r of rows ?? []) {
      const tags = Array.isArray(r.tags) ? (r.tags as ContactTag[]) : [];
      for (const t of tags) {
        if (t && typeof t.label === "string" && typeof t.color === "string") {
          const key = t.label.toLowerCase();
          if (!seen.has(key)) seen.set(key, { label: t.label, color: t.color as ContactTag["color"] });
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  });