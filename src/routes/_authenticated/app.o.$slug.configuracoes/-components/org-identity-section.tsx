import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { updateOrganization, uploadOrgLogo } from "@/lib/orgs.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/info-tip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ACCEPTED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Identidade da organização (aba Geral) em grid de 2 colunas:
 * - ESQUERDA: logo slim (box 24x24) com ações SOMENTE em ícone + tooltips
 *   (ícones ao lado, sempre visíveis — overlay no hover quebraria touch/a11y);
 * - DIREITA: nome editável + slug somente-leitura (imutável por decisão,
 *   regra explicada via tooltip) com inputs proporcionais (max-w-md) e
 *   save compacto no rodapé + indicador de alterações não salvas.
 * Um único UPDATE (name + logo_url); toast + invalidate ["org", slug].
 * O InfoTip vem da FONTE ÚNICA (@/components/info-tip); os Tooltip daqui
 * são só pros botões de ação do logo (trocar/remover).
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
  const canRemove = !!logoDraft || !!localPreview;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* COLUNA 1 — Identidade visual (logo slim + ações em ícone) */}
      <div className="card-elevated space-y-4 p-4 sm:p-5">
        <div className="text-sm font-semibold">Identidade visual</div>
        <div className="flex items-center gap-4">
          <div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-secondary/40">
            {preview ? (
              <img
                src={preview}
                alt="Logotipo da organização"
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
            {upload.isPending && (
              <span className="absolute inset-0 grid place-items-center bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </span>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Trocar logotipo"
                    disabled={upload.isPending}
                    onClick={() => fileRef.current?.click()}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Trocar logotipo</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Remover logotipo"
                    disabled={!canRemove}
                    onClick={removeLogo}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-destructive/40 text-destructive transition hover:bg-destructive/10 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Remover logotipo</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Formatos suportados: PNG, JPG, SVG ou WEBP (máx. 2MB). Clique nos
          ícones para alterar.
        </p>
      </div>

      {/* COLUNA 2 — Informações da organização (inputs proporcionais) */}
      <div className="card-elevated flex flex-col gap-4 p-4 sm:p-5">
        <div className="text-sm font-semibold">Informações da organização</div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Nome da organização
          </label>
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Nome da organização"
            maxLength={120}
            className="max-w-md"
          />
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            Slug da organização
            <InfoTip text="O slug é o identificador único da URL e não pode ser alterado após a criação." />
          </label>
          <Input value={orgSlug} disabled className="max-w-md" />
        </div>
        <div className="mt-auto flex items-center justify-end gap-2 pt-2">
          {dirty && (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
              alterações não salvas
            </span>
          )}
          <button
            type="button"
            disabled={!dirty || save.isPending || upload.isPending || !nameDraft.trim()}
            onClick={() => save.mutate()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}