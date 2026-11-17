import { useId } from "react";

/**
 * Monograma "F de fita" do Fluxo — vetor vivo, sem imagem.
 *
 * Versão SIMPLIFICADA (3 gestos, zero loop):
 *  • haste vertical com canto superior arredondado + braço superior RETO
 *    (sem gancho descendente — o gancho anterior fechava uma barriga e
 *    fazia o olho ler "P/R" em tamanho pequeno);
 *  • braço do meio com onda leve que NASCE à esquerda da haste e CRUZA
 *    por cima dela (entrelace com vão de máscara = assinatura da marca);
 *  • fita grossa (7/40 ≈ 17%) com pontas redondas;
 *  • tone="brand": degradê por fita ( superfícies claras);
 *    tone="mono": currentColor (sidebar azul / superfícies escuras) —
 *    resolve o azul-sobre-azul que sumia com a haste;
 *  • ids via useId → várias instâncias na mesma tela sem colisão.
 *
 * Tamanho vem do className (h-6 w-6, h-8 w-8…). Puramente apresentacional.
 */
export function FlxMark({
  className,
  title = "Fluxo",
  tone = "brand",
}: {
  className?: string;
  title?: string;
  tone?: "brand" | "mono";
}) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const gradA = `flxA-${uid}`;
  const gradB = `flxB-${uid}`;
  const maskA = `flxMA-${uid}`;

  // Haste + canto superior + braço superior reto (terminal redondo, SEM gancho).
  const strandA = "M 14 40 V 16 C 14 11 17 8 22 8 H 33";
  // Braço do meio: onda leve, nasce à esquerda da haste, cruza por cima.
  const strandB = "M 7 26 C 12 26 14 23.5 19 23.5 H 26";
  // Tesoura local: trecho de B que corta A no cruzamento (vão do entrelace).
  const cutOverA = "M 8.5 25.8 C 12 25.6 14 23.6 18 23.5";

  const strokeA = tone === "mono" ? "currentColor" : `url(#${gradA})`;
  const strokeB = tone === "mono" ? "currentColor" : `url(#${gradB})`;

  return (
    <svg
      viewBox="2 3 36 42"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradA} gradientUnits="userSpaceOnUse" x1="14" y1="40" x2="33" y2="8">
          <stop offset="0" stopColor="#1e40af" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={gradB} gradientUnits="userSpaceOnUse" x1="7" y1="26" x2="26" y2="23.5">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.6" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        {/* A some no cruzamento → B (braço do meio) passa por cima */}
        <mask id={maskA} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect x="0" y="0" width="48" height="48" fill="white" />
          <path d={cutOverA} stroke="black" strokeWidth="10.5" strokeLinecap="round" fill="none" />
        </mask>
      </defs>
      <path
        d={strandA}
        mask={`url(#${maskA})`}
        stroke={strokeA}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d={strandB}
        stroke={strokeB}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
