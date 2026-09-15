import { z } from "zod";

export const StateEnum = z.enum([
  "novo",
  "em_analise",
  "aguardando_cliente",
  "aguardando_revisao_humana",
  "concluido",
]);

export const PriorityEnum = z.enum(["baixa", "media", "alta", "urgente"]);

export const OP_ROLES = ["owner", "admin", "gerente", "operador", "agente_ia"] as const;

export async function assertMember(supabase: any, orgId: string, userId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Sem acesso à organização");
  return data.role as string;
}