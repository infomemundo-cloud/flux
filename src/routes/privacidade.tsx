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
} from "lucide-react";
import { usePublicNav } from "@/hooks/use-public-nav";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade e Termos de Uso — Flux" },
      {
        name: "description",
        content:
          "Política de Privacidade e Termos de Uso do Flux. Saiba como tratamos seus dados, seus direitos como titular e as regras de uso da plataforma.",
      },
    ],
  }),
  component: PrivacyPage,
});

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 mb-4">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function PrivacyPage() {
  const lastUpdated = "18 de novembro de 2026";
  // Mesma regra da /ajuda: autenticado volta DIRETO pro trabalho
  // (fila da org única / hub se multi-org) — nunca passa por "/" ou "/app"
  // à toa; anônimo mantém o "Voltar" pra landing.
  const nav = usePublicNav();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header contextual (página pública) — ver usePublicNav */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link
            to={nav.target ?? "/"}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary">
              <ShieldCheck className="h-4 w-4 text-primary-foreground" strokeWidth={2.2} />
            </span>
            Flux
          </Link>
          {nav.loading ? (
            /* placeholder de altura: resolve sessão/orgs sem layout shift */
            <span className="h-9 w-24" aria-hidden />
          ) : nav.target ? (
            <Link
              to={nav.target}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              {nav.back ? (
                <ArrowLeft className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {nav.back ? "Voltar" : nav.label}
            </Link>
          ) : (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 space-y-8">
        {/* Título principal */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade e Termos de Uso</h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: {lastUpdated} · Versão preliminar sujeita a revisão jurídica
          </p>
          <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Contato de Privacidade / Encarregado (DPO):{" "}
              <a href="mailto:privacidade@flxapp.cloud" className="font-semibold underline">
                privacidade@flxapp.cloud
              </a>
            </span>
          </div>
        </div>

        {/* POLÍTICA DE PRIVACIDADE */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Política de Privacidade — Fluxo
          </h2>

          <SectionCard icon={Users} title="1. Papel do Fluxo na LGPD">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Empresas clientes (Organizações / Tenants):</strong> atuam como{" "}
                <strong>Controladoras</strong> dos dados pessoais de seus clientes e contatos tratados no
                atendimento via WhatsApp.
              </li>
              <li>
                <strong>Fluxo:</strong> atua como <strong>Operador</strong> ao processar, armazenar e exibir
                mensagens, contatos e eventos operacionais em nome da organização contratante, e como{" "}
                <strong>Controlador</strong> apenas dos dados estritamente necessários para gestão da conta do
                usuário, autenticação, segurança e cobrança da assinatura.
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={Database} title="2. Dados que Coletamos e Tratamos">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Dados de conta e acesso:</strong> nome, e-mail, identificador de usuário, histórico de
                login/status da conta e vínculo com organizações (<code>org_id</code>) e papéis de acesso.
              </li>
              <li>
                <strong>Dados operacionais de atendimento (via integração WhatsApp):</strong> telefone/identificador
                do contato ou grupo, nome/foto de perfil quando disponível, mensagens de entrada e saída,
                metadados técnicos da mensagem e arquivos/mídias anexados (armazenados em bucket privado).
              </li>
              <li>
                <strong>Dados de assinatura e faturamento:</strong> plano contratado, status da assinatura, ciclos,
                faturas e identificadores de transação/pagamento processados via gateway de pagamento.
              </li>
              <li>
                <strong>Logs técnicos e de auditoria:</strong> registros de eventos da demanda, auditoria
                administrativa e logs de entrega/erros de webhook e integração para segurança, estabilidade e
                prevenção a fraudes.
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={FileText} title="3. Finalidades e Bases Legais">
            <p>Tratamos os dados para:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Execução do serviço / procedimentos preliminares (teste/validação):</strong> conectar o
                canal, organizar demandas, manter histórico, distribuir atendimentos e aplicar regras de SLA e plano.
              </li>
              <li>
                <strong>Cumprimento de obrigações legais e regulatórias:</strong> quando aplicável.
              </li>
              <li>
                <strong>Legítimo interesse:</strong> garantir segurança da plataforma, prevenir abuso/fraude,
                diagnosticar falhas e manter a integridade operacional.
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={Lock} title="4. Compartilhamento com Operadores / Suboperadores">
            <p>
              Para o funcionamento técnico do sistema, os dados podem transitar ou ficar armazenados em provedores
              essenciais de infraestrutura e integração:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Supabase</strong> (banco de dados PostgreSQL, autenticação, armazenamento de arquivos/mídias e
                tempo real).
              </li>
              <li>
                <strong>Provedor de hospedagem / runtime da aplicação</strong> (ex.: Vercel).
              </li>
              <li>
                <strong>Evolution API</strong> (gateway de conexão/mensageria WhatsApp configurado para a instância).
              </li>
              <li>
                <strong>Mercado Pago</strong> (processamento de assinaturas recorrentes e pagamentos).
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={Clock} title="5. Segurança, Isolamento e Retenção">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Isolamento e controle de acesso:</strong> separação lógica por organização (
                <code>org_id</code>), políticas de acesso no banco, autenticação via token e restrição por função/papel
                dentro da organização.
              </li>
              <li>
                <strong>Mídias:</strong> arquivos trafegados são armazenados em área privada com acesso
                controlado/temporário.
              </li>
              <li>
                <strong>Retenção e exclusão:</strong> os dados permanecem enquanto a conta/organização estiver ativa ou
                conforme necessidade operacional e legal. Ao encerrar uma organização ou solicitar exclusão, os dados
                vinculados à organização podem ser removidos em cascata, respeitando registros obrigatórios ou logs de
                segurança quando aplicável.
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={Mail} title="6. Direitos dos Titulares">
            <p>
              Titulares de dados podem solicitar confirmação de tratamento, acesso, correção, anonimização ou exclusão
              pelo canal <code>privacidade@flxapp.cloud</code>. Quando o pedido envolver dados de conversas de clientes
              de uma empresa usuária, o Fluxo poderá direcionar ou coordenar a solicitação com a organização
              controladora responsável.
            </p>
          </SectionCard>
        </div>

        {/* TERMOS DE USO */}
        <div className="space-y-6 pt-8 border-t border-border">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Termos de Uso — Fluxo
          </h2>

          <SectionCard icon={FileText} title="1. Objeto">
            <p>
              O <strong>Fluxo</strong> é uma plataforma web voltada à organização de atendimentos e demandas
              operacionais vinculadas a canais de comunicação (como WhatsApp), incluindo fila, histórico, atribuição,
              regras de SLA e gestão de assinatura.
            </p>
          </SectionCard>

          <SectionCard icon={Users} title="2. Cadastro, Conta e Fase de Validação">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                O usuário é responsável pela veracidade das informações de cadastro e pela confidencialidade de suas
                credenciais.
              </li>
              <li>
                Durante períodos de teste, validação ou planos gratuitos/avaliativos, funcionalidades, limites e
                disponibilidades podem estar sujeitos a ajustes, cotas do plano ou alterações sem prejuízo da
                transparência ao usuário.
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={ShieldCheck} title="3. Responsabilidade pelo Uso do WhatsApp e Base Legal">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                A organização usuária declara que possui <strong>base legal adequada</strong> para se comunicar com
                seus contatos pelo WhatsApp e é a única responsável pelo conteúdo das mensagens, mídias e comunicações
                enviadas por sua equipe.
              </li>
              <li>
                É proibido utilizar o Fluxo para envio de spam, mensagens não solicitadas em massa, práticas ilícitas
                ou violação de políticas da plataforma de mensageria e da legislação vigente (incluindo a LGPD).
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={Clock} title="4. Planos, Cotas, Carência e Suspensão">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                O uso da plataforma segue os limites do plano vigente (como quantidade de membros/operadores e volume
                de mensagens do ciclo).
              </li>
              <li>
                Atrasos ou falhas no pagamento podem levar a períodos de carência (com restrição de uso, como modo
                somente leitura) ou suspensão do acesso, conforme as regras da assinatura.
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={Database} title="5. Disponibilidade e Integrações de Terceiros">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                O Fluxo depende de serviços de terceiros (como infraestrutura de nuvem, gateway de WhatsApp e meio de
                pagamento). Indisponibilidades, bloqueios ou mudanças de API de terceiros podem afetar temporariamente
                o envio, o recebimento ou o carregamento de mídias.
              </li>
              <li>
                O sistema é fornecido "no estado em que se encontra" (<em>as is</em>), com esforços contínuos de
                estabilidade e segurança, sem garantia de operação ininterrupta livre de falhas externas.
              </li>
            </ul>
          </SectionCard>

          <SectionCard icon={Lock} title="6. Propriedade Intelectual e Encerramento">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Todo o código, layout, marca e estrutura do Fluxo pertencem aos seus criadores; os dados e conteúdos
                inseridos pela organização permanecem sob responsabilidade/titularidade conforme a relação da
                organização com seus contatos.
              </li>
              <li>
                O usuário pode encerrar sua conta/organização, e o Fluxo pode suspender ou encerrar contas em caso de
                violação destes Termos ou uso abusivo.
              </li>
            </ul>
          </SectionCard>
        </div>

        {/* Footer da página */}
        <div className="pt-8 border-t border-border text-center text-xs text-muted-foreground">
          <p>
            Esta página foi gerada com base nas melhores práticas de conformidade LGPD para SaaS B2B. Para dúvidas
            jurídicas específicas, consulte um advogado especializado.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} Flux — Atendimento compartilhado para equipes
          </p>
        </div>
      </main>
    </div>
  );
}
