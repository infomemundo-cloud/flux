// Paleta oficial por estado — mesma que você já tinha desenhado para o
// `custom_statuses` no flux_doc.md (novo=azul, em_analise=amarelo,
// aguardando_cliente=laranja, aguardando_revisao_humana=roxo, concluido=verde).
// Fonte única: usada no pip da fila (app.o.$slug.fila.tsx) e no pip do trilho
// de detalhe. Quando o custom_statuses virar realidade (permitir cor por
// organização), é aqui que essa lógica vai crescer.
export const STATE_COLOR: Record<string, string> = {
  novo: "bg-blue-500",
  em_analise: "bg-yellow-500",
  aguardando_cliente: "bg-orange-500",
  aguardando_revisao_humana: "bg-purple-500",
  concluido: "bg-green-500",
};
