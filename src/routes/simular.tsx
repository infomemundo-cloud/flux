import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Send, Terminal } from "lucide-react";

export const Route = createFileRoute("/simular")({
  component: Simular,
  head: () => ({
    meta: [
      { title: "Simular entrada de demanda | Fluxo" },
      { name: "description", content: "Página pública para simular a entrada externa de uma demanda no motor Fluxo e validar o fluxo até a fila de triagem." },
      { property: "og:title", content: "Simular entrada de demanda | Fluxo" },
      { property: "og:description", content: "Envie uma demanda de teste por canal externo e acompanhe ela aparecer na fila pronta para alocação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const CHANNELS = ["whatsapp", "instagram", "telegram", "email", "portal", "api", "manual"] as const;
const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;

function Simular() {
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("whatsapp");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("media");
  const [reopen, setReopen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; demandaId?: string } | null>(null);

  const body = {
    ...(title.trim() ? { title: title.trim() } : {}),
    message: message.trim() || "(mensagem de teste)",
    contact: { ...(name.trim() ? { name: name.trim() } : {}), ...(phone.trim() ? { phone: phone.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}) },
    channel_kind: channel,
    priority,
    reopen_if_open: reopen,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) { setResult({ ok: false, text: "Informe o token de ingestão (Configurações → Tokens de webhook)." }); return; }
    if (message.trim().length < 1) { setResult({ ok: false, text: "Escreva a mensagem que chegou pelo canal externo." }); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`/api/public/ingest/${encodeURIComponent(token.trim())}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: json?.error === "invalid_token" ? "Token inválido. Gere um token em Configurações da organização." : JSON.stringify(json) });
      } else {
        setResult({ ok: true, text: "Demanda registrada no motor e disponível na fila de triagem.", demandaId: json.demanda_id });
        setMessage(""); setTitle("");
      }
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const curl = `curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/public/ingest/${token.trim() || "{token}"} \\
  -H "content-type: application/json" \\
  -d '${JSON.stringify(body)}'`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-7 w-7 rounded-md bg-primary" /> Fluxo
          </Link>
          <Link to="/app" className="text-sm px-3 py-2 rounded-md hover:bg-secondary">Abrir painel</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Simular entrada de demanda</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Esta página pública reproduz exatamente o que um canal externo (WhatsApp via Evolution API, formulário, e‑mail ou integração)
          envia para o motor. A demanda entra como <b>Novo</b>, sem responsável, e fica pronta para ser alocada a um colaborador.
        </p>

        <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          {["Novo", "Em análise", "Aguardando cliente", "Aguardando revisão humana", "Concluído"].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded border ${i === 0 ? "bg-primary/10 border-primary/40 text-primary font-medium" : "border-border text-muted-foreground"}`}>{s}</span>
              {i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form onSubmit={submit} className="rounded-lg border border-border p-5 space-y-4">
            <div>
              <label className="text-sm font-medium">Token de ingestão</label>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="wht_..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-muted-foreground">Gere em Configurações da organização → Tokens de webhook.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Mensagem recebida</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                placeholder="Ex: Bom dia, meu pedido 4471 chegou com item faltando."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Título (opcional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Se vazio, usa o início da mensagem"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium">Contato</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Telefone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 91 ..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">E‑mail</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Canal</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Prioridade</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />
              Anexar à demanda aberta do mesmo contato, se existir
            </label>
            <button disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar demanda
            </button>

            {result && (
              <div className={`rounded-md border p-3 text-sm ${result.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
                <div className="flex items-start gap-2">
                  {result.ok && <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />}
                  <div className="space-y-1 break-all">
                    <p>{result.text}</p>
                    {result.demandaId && <p className="text-xs text-muted-foreground">ID: {result.demandaId}</p>}
                    {result.ok && <Link to="/app" className="text-xs underline">Ver na fila e alocar a um colaborador</Link>}
                  </div>
                </div>
              </div>
            )}
          </form>

          <div className="rounded-lg border border-border p-5">
            <div className="flex items-center gap-2 text-sm font-medium"><Terminal className="h-4 w-4" /> Equivalente via API</div>
            <p className="mt-2 text-xs text-muted-foreground">Mesmo payload que a Evolution API ou qualquer integração deve enviar.</p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-secondary p-3 text-xs leading-relaxed">{curl}</pre>
            <div className="mt-4 text-xs text-muted-foreground space-y-1">
              <p>1. A demanda é criada com estado <b>Novo</b> e sem responsável.</p>
              <p>2. A mensagem entra no histórico como evento de entrada.</p>
              <p>3. Na fila, qualquer gerente/admin pode atribuir a um operador — ou o próprio operador usa “Atribuir para mim”.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
