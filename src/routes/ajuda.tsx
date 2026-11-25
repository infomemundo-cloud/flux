import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  GitBranch,
  Inbox,
  MessageCircle,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { usePublicNav } from "@/hooks/use-public-nav";

export const Route = createFileRoute("/ajuda")({
  // ?from= só aceita caminho interno sob /app (anti open-redirect).
  // RETORNO COM CHAVE OPCIONAL ({ from?: string }): é isso que torna o prop
  // `search` OPCIONAL em todo <Link to="/ajuda"> do app (fix do TS2741).
  // Chave presente com valor undefined seria tratada como requerida pelo Router.
  validateSearch: (search: Record<string, unknown>): { from?: string } => {
    const raw = search.from;
    const ok = typeof raw === "string" && raw.startsWith("/app") && !raw.includes("://");
    return ok ? { from: raw } : {};
  },
  head: () => ({
    meta: [
      { title: "Ajuda & Documentação — Flux" },
      {
        name: "description",
        content:
          "Guia prático do Flux: onde fazer o quê, papéis e permissões, fila e escopos, estados, SLA, atendimento, equipe, WhatsApp e planos.",
      },
    ],
  }),
  component: AjudaPage,
});

const TOC = [
  { id: "onde", label: "Onde fazer o quê" },
  { id: "comeco", label: "Primeiros passos" },
  { id: "fila", label: "Fila & escopos" },
  { id: "estados", label: "Estados & prioridade" },
  { id: "sla", label: "SLA & alertas" },
  { id: "atendimento", label: "Atendimento" },
  { id: "contato", label: "Contato (CRM)" },
  { id: "equipe", label: "Equipe & papéis" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "planos", label: "Planos & cobrança" },
] as const;

/** Mapa "onde fazer o quê" — tarefa → caminho na UI → papel mínimo. */
const ONDE_FAZER = [
  ["Conectar o WhatsApp da empresa", "Configurações → Canais & Integrações → Conectar", "Owner/Admin"],
  ["Convidar pessoa para a equipe", "Equipe → Novo convite (link ou e-mail)", "Owner/Admin/Gerente"],
  ["Aprovar solicitação de entrada", "Equipe → Convites pendentes", "Owner/Admin/Gerente"],
  ["Criar demanda manual", "Fila → botão +", "Quem atende"],
  ["Assumir demanda órfã", "Fila → aba Órfãs → abrir → Responsável → “Atribuir pra mim”", "Quem atende"],
  ["Responder no WhatsApp", "Demanda → Chat → aba WhatsApp", "Quem atende"],
  ["Registrar nota interna (não sai da equipe)", "Demanda → Chat → aba Interno", "Quem atende"],
  ["Criar ou usar macro de resposta", "Chat → gatilho / · gestão em Configurações → Macros", "Quem atende · gestão Owner/Admin"],
  ["Mudar estado, prioridade, prazo ou responsável", "Demanda → trilho Propriedades", "Quem atende"],
  ["Editar notas, etiquetas, empresa e e-mail do contato", "Demanda → trilho → abas Contato / Notas", "Quem atende"],
  ["Ver alertas de SLA", "Sidebar → Alertas SLA", "Todos os membros"],
  ["Definir regra de SLA e distribuição automática", "Configurações → Atendimento", "Owner/Admin"],
  ["Liberar atendimento em grupos", "Configurações → Canais & Integrações (com aviso de volume)", "Owner/Admin"],
  ["Cadastrar chave Pix da empresa", "Configurações → Financeiro → Cobranças Pix", "Owner/Admin"],
  ["Ver plano, faturas e próxima cobrança", "Configurações → Financeiro", "Owner/Admin"],
  ["Excluir demanda (confirmação pelo protocolo)", "Demanda → trilho → Excluir demanda", "Owner/Admin"],
] as const;

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: typeof Inbox;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function AjudaPage() {
  const { from } = Route.useSearch();
  const nav = usePublicNav(from);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header contextual (página pública) — ver usePublicNav */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link
            to={nav.target ?? "/"}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary">
              <Inbox className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.2} />
            </span>
            Flux
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {nav.loading ? (
              /* placeholder de altura: resolve sessão/orgs sem layout shift */
              <span className="h-8 w-28" aria-hidden />
            ) : nav.target ? (
              <>
                {/* "Início" é link de visitante ANÔNIMO CONFIRMADO (user === null).
                    Enquanto a sessão não resolve, placeholder invisível de mesma
                    largura — zero flicker e zero layout shift para logados. */}
                {!nav.sessionResolved ? (
                  <span className="h-8 w-14" aria-hidden />
                ) : !nav.authed ? (
                  <Link to="/" className="rounded-lg px-3 py-1.5 transition hover:bg-secondary">
                    Início
                  </Link>
                ) : null}
                <Link
                  to={nav.target}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
                >
                  {nav.back ? (
                    <ArrowLeft className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  {nav.label}
                </Link>
              </>
            ) : (
              <>
                <Link to="/auth" className="rounded-lg px-3.5 py-1.5 transition hover:bg-secondary">
                  Entrar
                </Link>
                <Link
                  to="/auth"
                  className="rounded-lg bg-primary px-3.5 py-1.5 font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
                >
                  Testar grátis
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight">Ajuda & Documentação</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            O guia prático do Flux: o que o sistema faz, onde fazer cada coisa e quem pode
            fazer. Atualizado em novembro de 2026.
          </p>
        </div>

        {/* TOC em chips — scroll horizontal "flutuante" estilo app:
            scrollbar invisível (scrollbar-none), snap por chip e fade na borda
            direita como affordance. py-1/-my-1 reserva espaço pro anel de foco
            não ser clipado pelo overflow. */}
        <div id="secoes" className="relative mt-6 scroll-mt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-background to-transparent"
          />
          <div className="-my-1 flex gap-1.5 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1">
            {TOC.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="shrink-0 snap-start rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
              >
                {t.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-12">
          {/* ONDE FAZER O QUÊ */}
          <section id="onde" className="scroll-mt-24">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </span>
              <h2 className="text-lg font-bold tracking-tight">Onde fazer o quê</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              A tabela-resposta: tarefa, caminho dentro do Flux e papel mínimo necessário.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tarefa</th>
                    <th className="px-4 py-3 font-medium">Onde</th>
                    <th className="px-4 py-3 font-medium">Papel mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {ONDE_FAZER.map(([tarefa, onde, papel]) => (
                    <tr key={tarefa} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{tarefa}</td>
                      <td className="px-4 py-3 text-muted-foreground">{onde}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{papel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Section id="comeco" icon={ArrowRight} title="Primeiros passos (3 minutos)">
            <Bullets
              items={[
                <>
                  <strong className="text-foreground">1. Conecte o WhatsApp.</strong> Em
                  Configurações → Canais & Integrações, clique em Conectar e escaneie o QR com o
                  aparelho da empresa. A partir daí, toda mensagem recebida vira demanda na fila.
                </>,
                <>
                  <strong className="text-foreground">2. Convide a equipe.</strong> Em Equipe →
                  Novo convite, gere um link (ou convide por e-mail) e aprove a entrada de cada
                  pessoa. O papel define o que ela vê e faz.
                </>,
                <>
                  <strong className="text-foreground">3. Atenda pela fila.</strong> Abra uma
                  conversa, responda pela aba WhatsApp e mova o estado conforme o andamento. Tudo
                  fica registrado com autor e horário.
                </>,
              ]}
            />
          </Section>

          <Section id="fila" icon={Inbox} title="Fila & escopos">
            <Bullets
              items={[
                <>
                  <strong className="text-foreground">Fila:</strong> o turno de trabalho da
                  equipe. Gestores (owner/admin/gerente) veem tudo; operadores veem apenas as
                  demandas atribuídas a si e as órfãs — regra de foco, não de sigilo: qualquer
                  membro abre uma demanda por link direto.
                </>,
                <>
                  <strong className="text-foreground">Minhas:</strong> seu backlog pessoal
                  (demandas atribuídas a você).
                </>,
                <>
                  <strong className="text-foreground">Órfãs:</strong> demandas sem responsável —
                  o “mercado” de auto-atribuição. Abra e use “Atribuir pra mim”.
                </>,
                <>
                  <strong className="text-foreground">Atrasadas:</strong> corte de SLA estourado
                  ou prazo vencido. Na aba Fila, atrasadas também aparecem inline com borda
                  lateral carmim.
                </>,
                <>
                  Leitura rápida do card: borda colorida = estado; ponto azul no avatar = não
                  lida; chip à direita = SLA estourado, prioridade alta/urgente ou estado.
                </>,
              ]}
            />
          </Section>

          <Section id="estados" icon={GitBranch} title="Estados, prioridade e prazo (não são a mesma coisa)">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill-brand rounded-full px-2.5 py-1 text-[11px] font-bold">Novo</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="pill-amber rounded-full px-2.5 py-1 text-[11px] font-bold">Em análise</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="pill-orange rounded-full px-2.5 py-1 text-[11px] font-bold">Aguardando cliente</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="pill-green rounded-full px-2.5 py-1 text-[11px] font-bold">Concluído</span>
            </div>
            <Bullets
              items={[
                <>
                  <strong className="text-foreground">Estado</strong> = etapa do atendimento
                  (quem aguarda quem). Existe também “Aguardando revisão humana” para validação
                  interna antes de concluir.
                </>,
                <>
                  <strong className="text-foreground">Prioridade</strong> = urgência do cliente
                  (baixa, média, alta, urgente). Alta/urgente destacam o card na fila.
                </>,
                <>
                  <strong className="text-foreground">Prazo</strong> = data combinada para
                  resolver aquela demanda específica (campo Prazo no trilho).
                </>,
                <>
                  Toda mudança de estado, responsável e prioridade fica no histórico da demanda
                  com autor e horário — nada muda em silêncio.
                </>,
              ]}
            />
          </Section>

          <Section id="sla" icon={Timer} title="SLA & alertas">
            <Bullets
              items={[
                <>
                  A regra de SLA da organização mede{" "}
                  <strong className="text-foreground">inatividade</strong>: tempo sem nenhuma
                  movimentação na conversa (configurável em Configurações → Atendimento, de 1h a
                  7 dias).
                </>,
                <>
                  O <strong className="text-foreground">prazo individual</strong> da demanda é
                  outra coisa: é a data combinada de resolução, definida no trilho.
                </>,
                <>
                  Severidades nos Alertas: atenção (regra estourada), alto (3+ dias parado),
                  crítico (5+ dias, pulsante). O badge vermelho na sidebar conta as demandas
                  paradas.
                </>,
                <>
                  O alerta existe para agir <em>antes</em> do cliente reclamar — abra a aba
                  Atrasadas e redistribua ou responda.
                </>,
              ]}
            />
          </Section>

          <Section id="atendimento" icon={MessageCircle} title="Atendimento (Chat)">
            <Bullets
              items={[
                <>
                  Duas abas: <strong className="text-foreground">WhatsApp</strong> (envia ao
                  cliente) e <strong className="text-foreground">Interno</strong> (nota de
                  equipe, não sai da casa).
                </>,
                <>
                  Responder com citação: passe o mouse sobre uma bolha e clique em ↩ para
                  responder aquela mensagem específica (chega citada no WhatsApp).
                </>,
                <>
                  Macros: digite <code className="rounded bg-secondary px-1">/</code> no Chat
                  para inserir respostas rápidas; dá para criar e editar ali mesmo.
                </>,
                <>
                  Anexos (imagens, áudio, vídeo, documentos até 3 MB), emojis e gravação de áudio
                  direta (botão do microfone, com STOP e preview antes do envio).
                </>,
                <>
                  Com chave Pix cadastrada (Configurações → Financeiro), o Chat monta a
                  mensagem de cobrança com a chave da empresa.
                </>,
              ]}
            />
          </Section>

          <Section id="contato" icon={Users} title="Contato (CRM leve)">
            <Bullets
              items={[
                <>
                  No trilho, aba <strong className="text-foreground">Contato</strong>: notas
                  permanentes, etiquetas coloridas (até 12), empresa e e-mail — editáveis inline.
                </>,
                <>
                  A aba <strong className="text-foreground">Notas</strong> guarda o contexto
                  recorrente do cliente (preferências, combinados), separado do histórico da
                  demanda.
                </>,
                <>
                  O indicador “#X de N” mostra quantas demandas aquele contato já abriu, com
                  navegação entre as anteriores.
                </>,
              ]}
            />
          </Section>

          <Section id="equipe" icon={Users} title="Equipe & papéis">
            <div className="flex flex-wrap gap-1.5">
              {["owner", "admin", "gerente", "operador", "agente_ia"].map((r) => (
                <span
                  key={r}
                  className="pill-brand rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                >
                  {r}
                </span>
              ))}
            </div>
            <Bullets
              items={[
                <>
                  <strong className="text-foreground">Owner/Admin:</strong> tudo, incluindo
                  Configurações, exclusão de demandas e gestão de planos.
                </>,
                <>
                  <strong className="text-foreground">Gerente:</strong> convida e aprova membros,
                  distribui demandas e acompanha tudo; não entra em Configurações.
                </>,
                <>
                  <strong className="text-foreground">Operador:</strong> atende pela fila (suas +
                  órfãs), assume e responde; vê Equipe, Dashboard e Alertas.
                </>,
                <>
                  <strong className="text-foreground">Agente de IA:</strong> papel técnico para
                  automações; não pode concluir demandas (revisão humana obrigatória).
                </>,
                <>
                  Convites respeitam a cota de operadores do plano — a barra de capacidade aparece
                  na tela Equipe.
                </>,
              ]}
            />
          </Section>

          <Section id="whatsapp" icon={MessageCircle} title="WhatsApp (conexão e grupos)">
            <Bullets
              items={[
                <>
                  Uma empresa = um número conectado = uma instância dedicada. Reconectar não
                  apaga histórico.
                </>,
                <>
                  Grupos entram somente se a organização{" "}
                  <strong className="text-foreground">ativar explicitamente</strong> (Configurações
                  → Canais), com aviso de volume: grupo é fluxo alto de mensagens e mídia.
                </>,
                <>
                  Mídias recebidas ficam em armazenamento privado com acesso temporário assinado —
                  nenhum link público permanente.
                </>,
                <>
                  Mensagens enviadas pelo próprio aparelho fora do Flux não ecoam na fila
                  (anti-ruído).
                </>,
              ]}
            />
          </Section>

          <Section id="planos" icon={CreditCard} title="Planos, cotas e cobrança">
            <Bullets
              items={[
                <>
                  Planos definem operadores e mensagens/mês (ex.: Operação 2 op / 1.500 msg;
                  Escala 15 op / 35.000 msg). O WhatsApp é 1 canal em todos os planos.
                </>,
                <>
                  Teste grátis de 7 dias com acesso completo, sem cartão.
                </>,
                <>
                  Fatura vencida abre <strong className="text-foreground">carência de 7 dias</strong>:
                  a equipe continua respondendo conversas existentes, mas não recebe mensagens
                  novas nem cria demandas. Regularizando, tudo volta.
                </>,
                <>
                  Em Configurações → Financeiro você vê plano ativo, próxima cobrança, histórico
                  de faturas e a chave Pix da empresa.
                </>,
                <>
                  Cancelamento mantém o acesso até o fim do período já pago — sem surpresa.
                </>,
              ]}
            />
          </Section>
        </div>

        {/* Rodapé da página */}
        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Flux — atendimento compartilhado para equipes.</span>
          <div className="flex items-center gap-4">
            <Link to="/privacidade" className="transition hover:text-foreground">
              Política de Privacidade & Termos
            </Link>
            {/* Quem chega por deep-link (#fila, #atendimento, vindos dos empty
                states/InfoTips) entra no MEIO do guia; este link leva ao índice
                de todas as seções — a "ajuda completa", de cima a baixo. */}
            <a href="#secoes" className="transition hover:text-foreground">
              Ajuda completa
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
