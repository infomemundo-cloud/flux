import { useState } from "react";

/**
 * Avatar unificado de contato: foto do WhatsApp (URL temporária do CDN,
 * gravada pelo evento contacts.update) com fallback gracioso pra iniciais
 * quando não há foto OU quando a URL expira (onError).
 *
 * Regras:
 *  - Nunca quebra a tela: qualquer falha de imagem vira iniciais.
 *  - Reseta o estado de "imagem quebrada" quando a url muda (troca de
 *    contato na mesma posição da lista não herda o fallback do anterior).
 *  - `tone` replica EXATAMENTE o visual atual de cada tela quando não há
 *    foto: "neutral" = fila/alertas (bg-primary/10 + text-primary),
 *    "client"/"team"/"ai" = pills do painel de detalhe.
 *  - Fase 2 (futuro, módulo de mídias): trocar a URL do CDN por mídia
 *    persistida no Supabase Storage — a API do componente não muda.
 */
const FALLBACK: Record<string, string> = {
  client: "pill-green",
  team: "pill-brand",
  ai: "pill-violet",
  neutral: "bg-primary/10 text-primary",
};

export function ContactAvatar({
  url,
  name,
  size = "md",
  tone = "neutral",
  className = "",
}: {
  url?: string | null;
  name: string;
  size?: "sm" | "md";
  tone?: keyof typeof FALLBACK;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [lastUrl, setLastUrl] = useState(url ?? null);

  // url mudou (outro contato renderizado na mesma posição) → libera a img de novo
  if ((url ?? null) !== lastUrl) {
    setLastUrl(url ?? null);
    setBroken(false);
  }

  const showImg = !!url && !broken;
  const sizeCls = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]";
  const initialsStr = name
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <div
      className={`${sizeCls} shrink-0 grid place-items-center overflow-hidden rounded-full font-bold ${
        showImg ? "bg-secondary" : FALLBACK[tone]
      } ${className}`}
      aria-hidden
    >
      {showImg ? (
        <img
          src={url!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsStr || "?"
      )}
    </div>
  );
}
