import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { updateOrganization, uploadOrgLogo } from "@/lib/orgs.functions";

interface OnboardingStepProfileProps {
  org: { id: string; name: string; slug: string; logo_url?: string | null };
  onComplete: () => void;
}

/** Step 1/2: identidade da org (nome + logo opcional). Slug imutável. */
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
        toast.success("Logotipo enviado.");
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
      toast.error("Dê um nome pra sua organização.");
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

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Configure sua organização</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Esses dados aparecem pro seu time e nos relatórios. Dá pra mudar depois em
          Configurações → Geral.
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-6 rounded-xl border border-border bg-card p-6">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="org-name">Nome da organização</label>
          <input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Acme Comércio"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Logotipo (opcional)</label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logotipo da organização" className="h-16 w-16 rounded-lg border border-border object-cover" />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-lg bg-muted">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </span>
            )}
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary transition">
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              Escolher arquivo
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => void handleLogo(e.target.files?.[0])}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG, SVG ou WebP · até 2MB</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="org-slug">Endereço (imutável)</label>
          <input
            id="org-slug"
            value={org.slug}
            disabled
            className="h-10 w-full rounded-md border border-input bg-muted px-3 font-mono text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">Identificador único da org na URL.</p>
        </div>

        <button
          onClick={() => void handleContinue()}
          disabled={saving || !name.trim()}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-60 transition"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Continuar
        </button>
      </div>
    </div>
  );
}