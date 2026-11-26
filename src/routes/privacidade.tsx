import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  FileText,
  Lock,
  Users,
  Database,
  Clock,
  Mail,
  Globe,
  Cookie,
  Scale,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { usePublicNav } from "@/hooks/use-public-nav";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade e Termos de Uso — Flux" },
      {
        name: "description",
        content:
          "Política de Privacidade e Termos de Uso do Flux (flxapp.cloud). Tratamento de dados pessoais conforme a LGPD (Lei 13.709/2018), direitos do titular, suboperadores, retenção e regras de uso da plataforma.",
      },
    ],
  }),
  component: PrivacyPage,
});

const VERSION = "1.0";
const EFFECTIVE_DATE = "27 de novembro de 2026";
const DPO_EMAIL = "privacidade@flxapp.cloud";

const TOC = [
  { id: "papeis", label: "Papéis na LGPD" },
  { id: "dados", label: "Dados tratados" },
  { id: "finalidades", label: "Finalidades & bases" },
  { id: "suboperadores", label: "Suboperadores" },
  { id: "retencao", label: "Retenção" },
  { id: "seguranca", label: "Segurança" },
  { id: "transferencia", label: "Transferência intl." },
  { id: "direitos", label: "Direitos do titular" },
  { id: "cookies", label: "Cookies" },
  { id: "alteracoes", label: "Alterações" },
  { id: "termos", label: "Termos de Uso" },
  { id: "planos-termos", label: "Planos & cobrança" },
  { id: "responsabilidade", label: "Responsabilidades" },
  { id: "encerramento", label: "Encerramento" },
] as const;

const SUBOPERADORES = [
  ["Supabase", "Banco PostgreSQL, autenticação, storage de mídias e tempo real", "Conta, conversas, mídias, logs", "EUA"],
  ["Vercel", "Hospedagem e runtime da aplicação", "Requisições e logs técnicos", "EUA"],
  ["Evolution API", "Gateway de conexão/mensageria WhatsApp (instância dedicada)", "Mensagens e metadados do canal", "VPS própria"],
  ["Mercado Pago", "Processamento de assinaturas e pagamentos", "Dados de cobrança e identificadores de transação", "Brasil"],
] as const;

const RETENCAO = [
  ["Conta e organização", "Enquanto ativas; até 24 meses após o encerramento para obrigações e remarketing, depois anonimização"],
  ["Conversas, contatos e mídias", "Enquanto a organização estiver ativa; removidos em cascata na exclusão da organização"],
  ["Feedback de produto", "Até 24 meses ou até pedido de exclusão (anonimização dos agregados)"],
  ["Logs de segurança e auditoria", "Prazos legais e de segurança aplicáveis; registros imutáveis de auditoria administrativa"],
  ["Backups", "Ciclo de retenção próprio dos provedores de infraestrutura"],
] as const;

const FINALIDADES = [
  ["Prestar o serviço (conectar canal, fila, histórico, distribuição, SLA)", "Execução de contrato / procedimentos preliminares (art. 7º, V)"],
  ["Cobrança, faturas e gestão da assinatura", "Execução de contrato (art. 7º, V)"],
  ["Segurança, prevenção a fraude e estabilidade", "Legítimo interesse (art. 7º, IX)"],
  ["Obrigações legais e regulatórias", "Cumprimento de obrigação legal (art. 7º, II)"],
  ["Follow-up de feedback e comunicações de melhoria", "Consentimento (art. 7º, I), revogável a qualquer momento"],
] as const;

function SectionCard({
  id,
  icon: Icon,
  title,
  children,
}: {
  id?: string;
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function DataTable({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrivacyPage() {
  const nav = usePublicNav();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link to={nav.target ?? "/"} className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary">
              <ShieldCheck className="h-4 w-4 text-primary-foreground" strokeWidth={2.2} />
            </span>
            Flux
          </Link>
          {nav.loading ? (
            <span className="h-9 w-24" aria-hidden />
          ) : nav.target ? (
            <Link
              to={nav.target}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              {nav.back ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              {nav.back ? "Voltar" : nav.label}
            </Link>
          ) : (
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 space-y-8">
        {/* Hero institucional */}
        <div className="space-y-3">
          <span className="pill-brand inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            <ShieldCheck className="h-3 w-3" /> Conformidade LGPD · Lei 13.709/2018
          </span>
          <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade e Termos de Uso</h1>
          <p className="text-sm text-muted-foreground">
            Versão {VERSION} · Vigente a partir de {EFFECTIVE_DATE} · Flux (flxapp.cloud)
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-xs text-foreground/85">
              Encarregado de Dados (DPO):{" "}
              <a href={`mailto:${DPO_EMAIL}`} className="font-semibold text-primary underline underline-offset-2">
                {DPO_EMAIL}
              </a>
              . Canal único para exercer direitos, tirar dúvidas sobre tratamento ou reportar incidentes.
            </span>
          </div>
        </div>

        {/* Índice */}
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
          <div className="-my-1 flex gap-1.5 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1">
            {TOC.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="shrink-0 snap-start rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {t.label}
              </a>
            ))}
          </div>
        </div>

        {/* POLÍTICA */}
        <div className="space-y-6">
          <h2 id="privacidade" className="scroll-mt-24 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-primary" /> Política de Privacidade
          </h2>

          <SectionCard id="papeis" icon={Users} title="1. Quem somos e papéis na LGPD">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Flux (flxapp.cloud)</strong> é a plataforma de atendimento compartilhado. Atuamos como{" "}
                <strong>Operador</strong> (art. 5º, VII) ao tratar mensagens, contatos e eventos operacionais em nome da
                organização contratante.
              </li>
              <li>
                <strong>Organizações clientes</strong> são as <strong>Controladoras</strong> (art. 5º, VI) dos dados pessoais
                de seus contatos e clientes tratados no atendimento, decidindo finalidades e meios desse tratamento.
              </li>
              <li>
                O Flux atua como <strong>Controlador</strong> apenas dos dados estritamente necessários à gestão da conta,
                autenticação, segurança e cobrança da assinatura.
              </li>
            </ul>
          </SectionCard>

          <SectionCard id="dados" icon={Database} title="2. Dados que tratamos">
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>Conta e acesso:</strong> nome, e-mail, identificador de usuário, histórico de login/status e vínculo com organizações e papéis.</li>
              <li><strong>Operacionais de atendimento:</strong> telefone/identificador do contato ou grupo, nome e foto de perfil quando disponíveis, mensagens de entrada e saída, metadados técnicos e mídias anexadas (bucket privado). Inclui o CRM leve da organização (notas, etiquetas, empresa, e-mail do contato).</li>
              <li><strong>Cobrança da organização:</strong> plano, status da assinatura, ciclos, faturas, identificadores de transação do gateway e a chave Pix cadastrada pela empresa para cobrança de seus clientes.</li>
              <li><strong>Feedback de produto (opcional):</strong> nota de 1 a 5, etiquetas, comentário livre (até 1.000 caracteres), resposta de satisfação e a tela de origem (sem identificadores de conversas). Follow-up somente com opt-in explícito.</li>
              <li><strong>Logs e auditoria:</strong> eventos da demanda, auditoria administrativa e logs de entrega/erros de webhook e integração, para segurança, estabilidade e prevenção a fraudes.</li>
            </ul>
          </SectionCard>

          <SectionCard id="finalidades" icon={FileText} title="3. Finalidades e bases legais">
            <DataTable head={["Finalidade", "Base legal (LGPD)"]} rows={FINALIDADES} />
            <p className="text-xs">
              Não vendemos dados pessoais e não os compartilhamos para publicidade de terceiros. O consentimento de
              follow-up é revogável a qualquer momento, sem afetar o tratamento das demais finalidades.
            </p>
          </SectionCard>

          <SectionCard id="suboperadores" icon={Lock} title="4. Compartilhamento e suboperadores">
            <p>Os dados transitam ou ficam armazenados apenas nos provedores essenciais abaixo, sob obrigações contratuais de confidencialidade e segurança:</p>
            <DataTable head={["Provedor", "Função", "Dados", "Local"]} rows={SUBOPERADORES} />
          </SectionCard>

          <SectionCard id="retencao" icon={Clock} title="5. Retenção e exclusão">
            <DataTable head={["Categoria", "Retenção"]} rows={RETENCAO} />
            <p className="text-xs">
              Ao encerrar uma organização, os dados vinculados são removidos em cascata (conversas, contatos, mídias,
              macros, tokens), respeitando registros obrigatórios e logs de segurança. Agregados de feedback são
              anonimizados na exclusão.
            </p>
          </SectionCard>

          <SectionCard id="seguranca" icon={ShieldCheck} title="6. Segurança e isolamento">
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>Isolamento por organização:</strong> separação lógica por <code>org_id</code> com políticas de acesso no banco (RLS) e restrição por papel dentro da organização.</li>
              <li><strong>Mídias privadas:</strong> armazenamento em bucket privado com URLs assinadas de validade curta; nenhum link público permanente.</li>
              <li><strong>Integridade e auditoria:</strong> logs de auditoria administrativa imutáveis; webhooks de pagamento validados por assinatura HMAC.</li>
              <li><strong>Criptografia:</strong> em trânsito (TLS) e em repouso nos provedores de infraestrutura; autenticação por token com expiração.</li>
            </ul>
          </SectionCard>

          <SectionCard id="transferencia" icon={Globe} title="7. Transferência internacional">
            <p>
              Parte dos suboperadores opera fora do Brasil (EUA). A transferência ocorre apenas para provedores essenciais
              à prestação do serviço, sob cláusulas contratuais e garantias de proteção compatíveis com a LGPD (art. 33).
              Não realizamos transferência para fins publicitários.
            </p>
          </SectionCard>

          <SectionCard id="direitos" icon={Scale} title="8. Direitos do titular e como exercer">
            <p>Conforme o art. 18 da LGPD, você pode solicitar:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Confirmação da existência de tratamento e acesso aos dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
              <li>Portabilidade, quando regulamentada;</li>
              <li>Eliminação dos dados tratados com consentimento;</li>
              <li>Informação sobre compartilhamento com suboperadores;</li>
              <li>Revogação do consentimento e oposição a tratamento com base em legítimo interesse;</li>
              <li>Revisão de decisões automatizadas que afetem seus interesses.</li>
            </ul>
            <p className="text-xs">
              Canal: <a href={`mailto:${DPO_EMAIL}`} className="font-semibold text-primary underline underline-offset-2">{DPO_EMAIL}</a>.
              Respondemos em até 15 dias. Pedidos sobre conversas de clientes de uma organização são coordenados com a
              controladora responsável. Feedback pode ser excluído diretamente pela própria conta.
            </p>
          </SectionCard>

          <SectionCard id="cookies" icon={Cookie} title="9. Cookies e tecnologias">
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>Essenciais:</strong> sessão/autenticação e segurança da conta.</li>
              <li><strong>Preferências:</strong> tema da interface (armazenamento local) e rascunho de feedback (sessão).</li>
              <li><strong>Não utilizamos</strong> cookies de publicidade ou rastreadores de terceiros para perfilamento.</li>
            </ul>
          </SectionCard>

          <SectionCard id="alteracoes" icon={FileText} title="10. Alterações desta política">
            <p>
              Mudanças relevantes são comunicadas in-app ou por e-mail e registradas com nova versão e data de vigência no
              topo deste documento. A versão vigente é sempre a publicada nesta página. O uso continuado após a vigência
              indica ciência da versão atualizada.
            </p>
          </SectionCard>
        </div>

        {/* TERMOS */}
        <div className="space-y-6 border-t border-border pt-8">
          <h2 id="termos" className="scroll-mt-24 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileText className="h-5 w-5 text-primary" /> Termos de Uso
          </h2>

          <SectionCard icon={FileText} title="1. Objeto e aceite">
            <p>
              O <strong>Flux</strong> é uma plataforma web de organização de atendimentos e demandas vinculadas a canais de
              comunicação (como WhatsApp), incluindo fila compartilhada, histórico, atribuição, regras de SLA e gestão de
              assinatura. Ao criar conta ou usar a plataforma, você concorda com estes Termos e com a Política de
              Privacidade acima.
            </p>
          </SectionCard>

          <SectionCard icon={Users} title="2. Conta, cadastro e teste grátis">
            <ul className="list-disc space-y-2 pl-5">
              <li>O usuário responde pela veracidade dos dados de cadastro e pela confidencialidade de suas credenciais.</li>
              <li>O teste grátis de 7 dias oferece acesso completo sem cartão; ao fim, a organização escolhe um plano ou entra nas regras de carência/suspensão abaixo.</li>
              <li>Papéis (owner, admin, gerente, operador, agente de IA) definem permissões; a organização responde pelos atos de seus membros.</li>
            </ul>
          </SectionCard>

          <SectionCard id="planos-termos" icon={CreditCard} title="3. Planos, cotas, carência e suspensão">
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>Cotas:</strong> cada plano define operadores e volume de mensagens do ciclo. O estouro da cota de mensagens pausa apenas o <strong>recebimento</strong> de novas mensagens; envio, respostas e histórico continuam liberados até o próximo ciclo. Não é suspensão da conta.</li>
              <li><strong>Carência:</strong> falha de pagamento abre carência de 7 dias em modo leitura — a equipe responde conversas existentes, mas não recebe mensagens novas nem cria demandas. Regularizando, tudo volta.</li>
              <li><strong>Suspensão:</strong> ao fim da carência sem regularização, o acesso é suspenso até a quitação.</li>
              <li><strong>Cancelamento:</strong> mantém o acesso até o fim do período já pago; sem cobrança-surpresa posterior.</li>
              <li><strong>Troca de plano:</strong> upgrade/downgrade preserva o acesso durante a migração; não há downgrade automático por falha de pagamento.</li>
            </ul>
          </SectionCard>

          <SectionCard id="responsabilidade" icon={AlertTriangle} title="4. Responsabilidade pelo uso do WhatsApp e base legal">
            <ul className="list-disc space-y-2 pl-5">
              <li>A organização declara possuir <strong>base legal adequada</strong> para se comunicar com seus contatos e é a única responsável pelo conteúdo das mensagens, mídias e comunicações enviadas por sua equipe.</li>
              <li>É proibido usar o Flux para spam, mensagens não solicitadas em massa, práticas ilícitas ou violação de políticas da plataforma de mensageria e da legislação (incluindo a LGPD).</li>
              <li>Recursos de alto volume (como atendimento em grupos) são opt-in: só entram se a organização ativar explicitamente, ciente do volume de mensagens e mídias.</li>
            </ul>
          </SectionCard>

          <SectionCard icon={Globe} title="5. Disponibilidade e integrações de terceiros">
            <ul className="list-disc space-y-2 pl-5">
              <li>O Flux depende de provedores de nuvem, gateway de WhatsApp e meio de pagamento. Indisponibilidades, bloqueios ou mudanças de API de terceiros podem afetar temporariamente envio, recebimento ou carregamento de mídias.</li>
              <li>A plataforma é fornecida "no estado em que se encontra", com esforço contínuo de estabilidade e segurança, sem garantia de operação ininterrupta livre de falhas externas.</li>
            </ul>
          </SectionCard>

          <SectionCard icon={Lock} title="6. Propriedade intelectual e conteúdo">
            <ul className="list-disc space-y-2 pl-5">
              <li>Código, layout, marca e estrutura do Flux pertencem aos seus criadores; é concedida licença de uso limitada, não exclusiva e intransferível durante a vigência da assinatura.</li>
              <li>Os dados e conteúdos inseridos pela organização (conversas, contatos, macros, notas) permanecem de titularidade da organização, conforme sua relação com seus contatos.</li>
            </ul>
          </SectionCard>

          <SectionCard icon={Scale} title="7. Limitação de responsabilidade">
            <p>
              Na máxima extensão permitida pela lei, o Flux não responde por danos indiretos, lucros cessantes ou perda de
              dados decorrente de uso indevido, de falha de terceiros ou de caso fortuito/força maior. A responsabilidade
              total, quando devida, limita-se ao valor efetivamente pago pela organização nos 12 meses anteriores ao evento.
              Nada aqui exclui responsabilidade por dolo ou por violação de direitos do titular de dados.
            </p>
          </SectionCard>

          <SectionCard id="encerramento" icon={Clock} title="8. Encerramento, exclusão e foro">
            <ul className="list-disc space-y-2 pl-5">
              <li>A organização pode encerrar a conta a qualquer momento; os dados vinculados são removidos em cascata conforme a Política de Privacidade.</li>
              <li>O Flux pode suspender ou encerrar contas em caso de violação destes Termos ou uso abusivo, com aviso quando cabível.</li>
              <li>Aplica-se a legislação da República Federativa do Brasil; fica eleito o foro do domicílio do usuário para dirimir controvérsias de consumo.</li>
            </ul>
          </SectionCard>
        </div>

        {/* Footer institucional */}
        <footer className="border-t border-border pt-8">
          <div className="flex flex-col items-start justify-between gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} Flux — atendimento compartilhado para equipes.</span>
            <div className="flex items-center gap-4">
              <Link to="/ajuda" className="transition hover:text-foreground">Ajuda & Documentação</Link>
              <a href="#privacidade" className="transition hover:text-foreground">Privacidade</a>
              <a href="#termos" className="transition hover:text-foreground">Termos</a>
              <a href={`mailto:${DPO_EMAIL}`} className="transition hover:text-foreground">DPO</a>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground/70">
            Documento de conformidade LGPD (Lei 13.709/2018), versão {VERSION}, vigente desde {EFFECTIVE_DATE}.
            Dúvidas sobre seus direitos: <a href={`mailto:${DPO_EMAIL}`} className="underline underline-offset-2">{DPO_EMAIL}</a>.
          </p>
        </footer>
      </main>
    </div>
  );
}
