import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Search, Building2, ArrowRight } from "lucide-react";

type Search = { token?: string; protocolo?: string };

export const Route = createFileRoute("/acompanhar")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    token: typeof s.token === "string" ? s.token : undefined,
    protocolo: typeof s.protocolo === "string" ? s.protocolo : undefined,
  }),
  component: Acompanhar,
  head: () => ({
    meta: [
      { title: "Acompanhar minha solicitação | Fluxo" },
      { name: "description", content: "Consulte o andamento da sua solicitação usando o código de protocolo recebido no momento do envio." },
      { property: "og:title", content: "Acompanhar minha solicitação | Fluxo" },
      { property: "og:description", content: "Digite seu código de protocolo e veja em que etapa está o seu atendimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const STEPS = [
  { key: "novo", label: "Recebida" },
  { key: "em_analise", label: "Em análise" },
  { key: "aguardando_cliente", label: "Aguardando você" },
  { key: "aguardando_revisao_humana", label: "Revisão final" },
  { key: "concluido", label: "Concluída" },
];

function Acompanhar() {
  const search = useSearch({ from: "/acompanhar" });
  const [token, setToken] = useState(search.token ?? "");
  const [protocolo, setProtocolo] = useState(search.protocolo ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  async function consult(t = token, p = protocolo) {
    if (!t.trim() || !p.trim()) { setError("Preencha o código da empresa e o seu protocolo."); return; }
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/public/status/${encodeURIComponent(t.trim())}?protocol=${encodeURIComponent(p.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json?.error === "invalid_token" ? "Código da empresa inválido. Confirme com quem te atendeu."
            : json?.error === "not_found" ? "Não encontramos nenhuma solicitação com esse protocolo."
            : json?.error === "invalid_protocol" ? "O protocolo tem o formato DM-XXXXXX."
            : "Não foi possível consultar agora. Tente novamente.",
        );
      } else setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (search.token && search.protocolo) void consult(search.token, search.protocolo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentIdx = data ? STEPS.findIndex((s) => s.key === data.demanda.state) : -1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-7 w-7 rounded-md bg-primary" /> Fluxo
          </Link>
          <Link to="/simular" className="text-sm px-3 py-2 rounded-md hover:bg-secondary">Enviar nova solicitação</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Acompanhar minha solicitação</h1>
        <p className="mt-3 text-muted-foreground">
          Informe o código da empresa e o protocolo que você recebeu ao enviar (ex.: <b>DM-4F9A2C</b>). Você vê em que etapa está,
          sem precisar criar conta.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); void consult(); }} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] rounded-lg border border-border p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Código da empresa</label>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="fornecido pela empresa"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Seu protocolo</label>
              <input value={protocolo} onChange={(e) => setProtocolo(e.target.value.toUpperCase())} placeholder="DM-XXXXXX"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <button disabled={loading} className="sm:self-end inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Consultar
          </button>
        </form>

        {error && <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {data?.demanda && (
          <section className="mt-6 rounded-lg border border-border p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" /> Atendimento por <b className="text-foreground">{data.org}</b>
              <span className="ml-auto font-mono text-xs px-2 py-1 rounded bg-secondary">{data.demanda.protocol}</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold">{data.demanda.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Situação atual: <b className="text-foreground">{data.demanda.state_label}</b> · atualizado em{" "}
              {new Date(data.demanda.updated_at).toLocaleString("pt-BR")}
            </p>

            <ol className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded border ${i === currentIdx ? "bg-primary/10 border-primary/40 text-primary font-medium" : i < currentIdx ? "border-border text-foreground" : "border-border text-muted-foreground"}`}>{s.label}</span>
                  {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                </li>
              ))}
            </ol>

            <div className="mt-6 space-y-3">
              <div className="text-sm font-medium">Histórico</div>
              {data.timeline.map((t: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  {t.kind === "created" || t.kind === "message_in" ? <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" /> : <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />}
                  <div>
                    <div>{t.label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.at).toLocaleString("pt-BR")}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}