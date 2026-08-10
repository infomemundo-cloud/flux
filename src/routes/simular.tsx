import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Copy, Loader2, Send, Terminal } from "lucide-react";

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
  const [org, setOrg] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("whatsapp");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("media");
  const [reopen, setReopen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; protocol?: string; org?: string } | null>(null);
  const [showApi, setShowApi] = useState(false);

  // Identify the company behind the token so the person knows who will attend them.
  useEffect(() => {
    const t = token.trim();
    setOrg(null); setOrgError(null);
    if (t.length < 8) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/status/${encodeURIComponent(t)}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setOrg(json.org ?? "Organização");
        else setOrgError("Código não reconhecido. Confirme com a empresa.");
      } catch { /* ignore */ }
    }, 500);
    return () => { cancelled = true; clearTimeout(id); };
  }, [token]);

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
    if (!token.trim()) { setResult({ ok: false, text: "Informe o código da empresa para onde a solicitação deve ir." }); return; }
    if (message.trim().length < 1) { setResult({ ok: false, text: "Escreva o que você precisa, com o máximo de detalhe possível." }); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`/api/public/ingest/${encodeURIComponent(token.trim())}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: json?.error === "invalid_token" ? "Código da empresa inválido. Peça o código correto a quem te atendeu." : "Não conseguimos registrar agora. Tente novamente em instantes." });
      } else {
        setResult({ ok: true, text: "Recebemos sua solicitação! A equipe já foi avisada e vai começar o atendimento.", protocol: json.protocol, org: json.org });
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
          <div className="flex items-center gap-1">
            <Link to="/acompanhar" className="text-sm px-3 py-2 rounded-md hover:bg-secondary">Acompanhar solicitação</Link>
            <Link to="/app" className="text-sm px-3 py-2 rounded-md hover:bg-secondary">Abrir painel</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Enviar uma solicitação</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Conte o que você precisa. Ao enviar, geramos um <b>protocolo</b> para você acompanhar o andamento a qualquer momento —
          sem criar conta, sem instalar nada. A equipe responsável recebe um alerta na hora.
        </p>

        <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          {["Recebida", "Em análise", "Aguardando você", "Revisão final", "Concluída"].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded border ${i === 0 ? "bg-primary/10 border-primary/40 text-primary font-medium" : "border-border text-muted-foreground"}`}>{s}</span>
              {i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form onSubmit={submit} className="rounded-lg border border-border p-5 space-y-4">
            <div>
              <label className="text-sm font-medium">Código da empresa</label>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="wht_..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              {org ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary"><Building2 className="h-3.5 w-3.5" /> Sua solicitação será atendida por <b>{org}</b></p>
              ) : orgError ? (
                <p className="mt-1 text-xs text-destructive">{orgError}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Código enviado pela empresa (a equipe gera em Configurações → Tokens de webhook).</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">O que você precisa?</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                placeholder="Ex: Bom dia, meu pedido 4471 chegou com item faltando."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Assunto (opcional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Se vazio, usamos o início da sua mensagem"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium">Seu nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Telefone / WhatsApp</label>
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
                <label className="text-sm font-medium">Por onde você fala com a empresa</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Urgência</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />
              Se eu já tiver uma solicitação em aberto, anexar a ela
            </label>
            <button disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar solicitação
            </button>

            {result && (
              <div className={`rounded-md border p-3 text-sm ${result.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
                <div className="flex items-start gap-2">
                  {result.ok && <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />}
                  <div className="space-y-2 min-w-0">
                    <p>{result.text}</p>
                    {result.org && <p className="text-xs text-muted-foreground">Empresa responsável: <b className="text-foreground">{result.org}</b></p>}
                    {result.protocol && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base px-2 py-1 rounded bg-secondary">{result.protocol}</span>
                          <button type="button" onClick={() => navigator.clipboard?.writeText(result.protocol!)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-secondary">
                            <Copy className="h-3 w-3" /> Copiar
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Guarde este protocolo: é com ele que você acompanha o andamento.</p>
                        <Link to="/acompanhar" search={{ token: token.trim(), protocolo: result.protocol }}
                          className="inline-flex items-center gap-1 text-xs font-medium underline">
                          Acompanhar minha solicitação <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </form>

          <div className="space-y-6">
            <div className="rounded-lg border border-border p-5">
              <div className="text-sm font-medium">Como funciona, em 3 passos</div>
              <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
                <li><b className="text-foreground">1. Você envia.</b> Sua solicitação entra na fila da empresa como “Recebida”.</li>
                <li><b className="text-foreground">2. A equipe é alertada.</b> Um aviso aparece no painel de quem atende, na hora.</li>
                <li><b className="text-foreground">3. Você acompanha.</b> Com o protocolo, veja a etapa atual e o histórico em <Link to="/acompanhar" className="underline">Acompanhar solicitação</Link>.</li>
              </ol>
            </div>

            <div className="rounded-lg border border-border p-5">
              <div className="text-sm font-medium">Já tem um protocolo?</div>
              <p className="mt-2 text-sm text-muted-foreground">Consulte o andamento sem precisar de conta.</p>
              <Link to="/acompanhar" search={{ token: token.trim() || undefined, protocolo: undefined }}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-secondary">
                Acompanhar solicitação <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-lg border border-border p-5">
              <button type="button" onClick={() => setShowApi((v) => !v)} className="flex items-center gap-2 text-sm font-medium">
                <Terminal className="h-4 w-4" /> Para desenvolvedores: equivalente via API
              </button>
              {showApi && (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">Mesmo payload que a Evolution API ou qualquer integração deve enviar.</p>
                  <pre className="mt-3 overflow-x-auto rounded-md bg-secondary p-3 text-xs leading-relaxed">{curl}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
