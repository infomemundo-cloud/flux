// Fonte única da cascata de fallback pro nome exibido de um contato.
// Usado em qualquer tela que mostra uma demanda: fila, detalhe, alertas.
// Ordem: nome salvo -> telefone salvo -> número extraído do whatsapp_jid
// (caso a demanda tenha vindo do WhatsApp mas o contato não tenha telefone
// próprio salvo) -> só em último caso, "Sem contato" de verdade.
export function resolveContactName(d: {
  contacts?: { name?: string | null; phone?: string | null } | null;
  whatsapp_jid?: string | null;
}): string {
  if (d.contacts?.name) return d.contacts.name;
  if (d.contacts?.phone) return d.contacts.phone;
  if (d.whatsapp_jid) {
    return d.whatsapp_jid
      .replace(/@s\.whatsapp\.net$/i, "")
      .replace(/@c\.us$/i, "")
      .replace(/@g\.us$/i, "");
  }
  return "Sem contato";
}
