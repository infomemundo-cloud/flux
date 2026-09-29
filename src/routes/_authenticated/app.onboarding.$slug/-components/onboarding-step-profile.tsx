import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Loader2, Upload } from "lucide-react";
import { updateOrganization, uploadOrgLogo } from "@/lib/orgs.functions";

interface OnboardingStepProfileProps {
  org: { id: string; name: string; slug: string; logo_url?: string | null };
  onComplete: () => void;
}

/** MESMA regra do servidor (slugify em orgs.functions.ts). */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "org";

/** Preview vivo idêntico ao card do OrgPicker. */
function OrgPreview({ name, logoUrl, slug }: { name: string; logoUrl: string | null; slug: string }) {
  const [broken, setBroken] = useState(false);
  const displayName = name.trim() || "Nome da empresa";
  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "F";
  return (
    <div className="space-y-3">
      <div className="text-[11px] font-medium text-slate-400">Preview na plataforma</div>
      {/* Card idêntico ao do OrgPicker */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        {logoUrl && !broken ? (
          <img
            src={logoUrl}
            alt=""
            onError={() => setBroken(true)}
            className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-slate-800"
          />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-100">{displayName}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.2 font-medium text-primary">
              Proprietário
            </span>
            <span className="truncate font-mono text-slate-500">/{slug}</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Você pode alterar o nome e a marca visual no painel da empresa a qualquer momento em{" "}
        <span className="text-slate-300 font-medium">Configurações → Geral</span>.
      </p>
    </div>
  );
}

/**
 * Step 1/2 do wizard: 2 colunas contidas dentro do shell slate (D9).
 * Esquerda: campos (nome + slug imutável + CTA).
 * Direita: upload de logo + preview vivo (como a org aparece no hub).
 * Slug preview com fallback: nome vazio mostra o slug REAL da org
 * (não o fallback "org" do slugify).
 */
export function OnboardingStepProfile({ org, onComplete }: OnboardingStepProfileProps) {
  const updateOrg = useServerFn(updateOrganization);
  const uploadLogo = useServerFn(uploadOrgLogo);
  const [name, setName] = useState(org.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo excede o limite de 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try {
        const res = await uploadLogo({
          data: {
            orgId: org.id,
            fileBase64: String(reader.result),
            mimeType: file.type as "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp",
          },
        });
        setLogoUrl(res.url);
        toast.success("Logotipo atualizado com sucesso.");
      } catch (err: any) {
        toast.error(err?.message ?? "Falha ao enviar o logotipo");
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleContinue() {
    if (!name.trim()) {
      toast.error("Informe o nome da sua organização.");
      return;
    }
    setSaving(true);
    try {
      await updateOrg({ data: { orgId: org.id, name: name.trim(), logoUrl } });
      onComplete();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao salvar o perfil");
      setSaving(false);
    }
  }

  // Fallback: nome vazio mostra o slug REAL da org (não o "org" do slugify).
  const previewSlug = name.trim() ? slugify(name.trim()) : org.slug;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
          Configure a identidade da empresa
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Defina o nome de exibição e o logotipo para o time e relatórios.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ─── ESQUERDA: Formulário ─── */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 space-y-4">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Informações Gerais
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300" htmlFor="org-name">
                Nome da organização
              </label>
              <input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Acme Comércio"
                className="h-9 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 text-xs text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300" htmlFor="org-slug">
                Endereço na URL (imutável)
              </label>
              <input
                id="org-slug"
                value={previewSlug}
                disabled
                className="h-9 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 font-mono text-xs text-slate-500 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-500">
                Identificador único gerado automaticamente para o domínio.
              </p>
            </div>
            <button
              onClick={() => void handleContinue()}
              disabled={saving || !name.trim()}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50 mt-2"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              Continuar para Conexão
            </button>
          </div>
        </div>

        {/* ─── DIREITA: Marca + Preview ─── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3">
              Logotipo da Empresa
            </div>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logotipo"
                  className="h-16 w-16 rounded-xl border border-slate-800 object-cover"
                />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-xl bg-slate-900 border border-slate-800">
                  <Building2 className="h-6 w-6 text-slate-500" />
                </span>
              )}
              <div className="flex-1 space-y-1.5">
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 transition hover:bg-slate-800">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  {logoUrl ? "Trocar imagem" : "Upload da logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => void handleLogo(e.target.files?.[0])}
                  />
                </label>
                <p className="text-[10px] text-slate-500">PNG, JPG ou SVG · Máx. 2MB</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
            <OrgPreview name={name} logoUrl={logoUrl} slug={previewSlug} />
          </div>
        </div>
      </div>
    </div>
  );
}
