import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { updateOrganization, uploadOrgLogo } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Input } from "@/components/ui/input";

const ACCEPTED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Identidade da organização (aba Geral): nome editável, slug SOMENTE
 * LEITURA (imutável por decisão de produto — URL nunca quebra) e logotipo
 * com upload direto pro bucket org-assets (preview em tempo real + remover).
 * Um único UPDATE (name + logo_url) no salvar; toast + invalidate da query
 * ["org", slug] atualizam header/seletor de orgs na hora.
 */
export function OrgIdentitySection({
  orgId,
  orgSlug,
  orgName,
  orgLogoUrl,
}: {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgLogoUrl: string | null;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrganization);
  const uploadFn = useServerFn(uploadOrgLogo);
  const fileRef = useRef<HTMLInputElement>(null);

  const [nameDraft, setNameDraft] = useState(orgName);
  const [logoDraft, setLogoDraft] = useState<string | null>(orgLogoUrl);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const dirty = nameDraft.trim() !== orgName || logoDraft !== orgLogoUrl;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        reader.readAsDataURL(file);
      });
      return uploadFn({
        data: { orgId, fileBase64: base64, mimeType: file.type as any },
      });
    },
    onSuccess: (r) => {
      setLogoDraft(r.url);
      setLocalPreview(null);
      toast.success("Logotipo enviado — clique em Salvar para confirmar.");
    },
    onError: (e) => {
      setLocalPreview(null);
      toast.error(friendlyError(e));
    },
  });

  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { orgId, name: nameDraft.trim(), logoUrl: logoDraft } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org", orgSlug] });
      toast.success("Configurações atualizadas com sucesso");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG, SVG ou WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo excede o limite de 2MB.");
      return;
    }
    setLocalPreview(URL.createObjectURL(file));
    upload.mutate(file);
  };

  const removeLogo = () => {
    setLogoDraft(null);
    setLocalPreview(null);
  };

  const preview = localPreview ?? logoDraft;

  return (
    <div className="card-elevated space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Identidade da organização</span>
      </div>

      {/* Logotipo */}
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-secondary/40">
          {preview ? (
            <img src={preview} alt="Logotipo da organização" className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            onChange={handleFile}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-secondary disabled:opacity-60"
            >
              {upload.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {logoDraft ? "Trocar logotipo" : "Enviar logotipo"}
            </button>
            {(logoDraft || localPreview) && (
              <button
                type="button"
                onClick={removeLogo}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">
            PNG, JPG, SVG ou WEBP · máx. 2MB
          </span>
        </div>
      </div>

      {/* Nome */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nome da organização</label>
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Nome da organização"
          maxLength={120}
        />
      </div>

      {/* Slug (somente leitura) */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Slug da organização</label>
        <Input value={orgSlug} disabled />
        <p className="text-[10px] text-muted-foreground">
          O slug é o identificador único da URL e não pode ser alterado após a criação.
        </p>
      </div>

      {/* Salvar */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!dirty || save.isPending || upload.isPending || !nameDraft.trim()}
          onClick={() => save.mutate()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar alterações
        </button>
      </div>
    </div>
  );
}